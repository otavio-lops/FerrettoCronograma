const bgApi = globalThis.browser ?? globalThis.chrome;
const supportsPromiseApi = typeof globalThis.browser !== "undefined";

function getLastError() {
  return globalThis.chrome?.runtime?.lastError ?? bgApi.runtime?.lastError ?? null;
}

function wrapCallback(fn, context, ...args) {
  return new Promise((resolve, reject) => {
    fn.call(context, ...args, (result) => {
      const lastError = getLastError();
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(result);
    });
  });
}

function queryTabs(queryInfo) {
  return supportsPromiseApi
    ? bgApi.tabs.query(queryInfo)
    : wrapCallback(bgApi.tabs.query, bgApi.tabs, queryInfo);
}

function sendTabMessage(tabId, message) {
  return supportsPromiseApi
    ? bgApi.tabs.sendMessage(tabId, message)
    : wrapCallback(bgApi.tabs.sendMessage, bgApi.tabs, tabId, message);
}

function updateTab(tabId, updateProperties) {
  return supportsPromiseApi
    ? bgApi.tabs.update(tabId, updateProperties)
    : wrapCallback(bgApi.tabs.update, bgApi.tabs, tabId, updateProperties);
}

function reloadTab(tabId, reloadProperties) {
  if (supportsPromiseApi) {
    return typeof reloadProperties === "undefined"
      ? bgApi.tabs.reload(tabId)
      : bgApi.tabs.reload(tabId, reloadProperties);
  }

  return new Promise((resolve, reject) => {
    const callback = () => {
      const lastError = getLastError();
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve();
    };

    if (typeof reloadProperties === "undefined") {
      bgApi.tabs.reload(tabId, callback);
      return;
    }

    bgApi.tabs.reload(tabId, reloadProperties, callback);
  });
}

function storageGet(keys) {
  return supportsPromiseApi
    ? bgApi.storage.local.get(keys)
    : wrapCallback(bgApi.storage.local.get, bgApi.storage.local, keys);
}

function storageSet(items) {
  return supportsPromiseApi
    ? bgApi.storage.local.set(items)
    : wrapCallback(bgApi.storage.local.set, bgApi.storage.local, items);
}

function storageRemove(keys) {
  return supportsPromiseApi
    ? bgApi.storage.local.remove(keys)
    : wrapCallback(bgApi.storage.local.remove, bgApi.storage.local, keys);
}

async function getActiveTab() {
  const tabs = await queryTabs({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

async function loadPopupState() {
  const activeTab = await getActiveTab();
  const urlValida = activeTab?.url?.includes("professorferretto.com.br");

  if (!urlValida) {
    return { screen: "acesso_errado" };
  }

  let response;
  try {
    response = await sendTabMessage(activeTab.id, { action: "puxar_aulas" });
  } catch (error) {
    return { screen: "primeira_vez" };
  }

  if (!response?.sucesso) {
    return { screen: "primeira_vez" };
  }

  const firstLoad = await storageGet(["weeks"]);
  if (!firstLoad.weeks) {
    return { screen: "primeira_vez" };
  }

  const [settingsResult, preloadResult] = await Promise.all([
    storageGet(["settings"]),
    storageGet(["preload_settings"]),
  ]);

  if (!settingsResult.settings) {
    return {
      screen: "configuracoes",
      data: response.conteudo,
      preload_settings: preloadResult.preload_settings ?? null,
    };
  }

  return {
    screen: "cronograma",
    data: response.conteudo,
    settings: settingsResult.settings,
  };
}

async function salvarConfiguracoes(payload) {
  await storageSet({ settings: payload.settings });

  if (payload.clearPreload) {
    await storageRemove(["preload_settings"]);
  }

  return { ok: true };
}

async function prepararEdicao() {
  const settingsResult = await storageGet(["settings"]);
  if (!settingsResult.settings) {
    return { ok: false };
  }

  await storageSet({ preload_settings: settingsResult.settings });
  await storageRemove(["settings"]);
  return { ok: true };
}

async function irParaAulas() {
  const activeTab = await getActiveTab();
  if (!activeTab) {
    return { ok: false };
  }

  await updateTab(activeTab.id, {
    url: "https://app.professorferretto.com.br/turmas/curso-completo?semana=0",
  });

  return { ok: true };
}

async function recarregarPaginaAtiva() {
  const activeTab = await getActiveTab();
  if (!activeTab) {
    return { ok: false };
  }

  await reloadTab(activeTab.id);
  return { ok: true };
}

bgApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request?.action) {
    return false;
  }

  const actions = {
    load_popup_state: () => loadPopupState(),
    save_settings: () => salvarConfiguracoes(request.payload ?? {}),
    prepare_edit_settings: () => prepararEdicao(),
    navigate_to_classes: () => irParaAulas(),
    reload_active_tab: () => recarregarPaginaAtiva(),
    bridge_puxar_aulas: async () => {
      const activeTab = await getActiveTab();
      if (!activeTab) {
        return { sucesso: false, erro: "Nenhuma aba ativa encontrada" };
      }

      return sendTabMessage(activeTab.id, { action: "puxar_aulas" });
    },
  };

  const handler = actions[request.action];
  if (!handler) {
    return false;
  }

  Promise.resolve(handler())
    .then((result) => sendResponse(result))
    .catch((error) => {
      sendResponse({
        ok: false,
        erro: error?.message ?? "Erro desconhecido",
      });
    });

  return true;
});
