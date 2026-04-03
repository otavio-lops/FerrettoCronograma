(function () {
  const rawApi = globalThis.browser ?? globalThis.chrome;
  const supportsPromiseApi = typeof globalThis.browser !== "undefined";

  if (!rawApi) {
    throw new Error("Browser extension API indisponivel.");
  }

  function getLastError() {
    return globalThis.chrome?.runtime?.lastError ?? rawApi.runtime?.lastError ?? null;
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

  function tabsReload(tabId, reloadProperties) {
    if (supportsPromiseApi) {
      return typeof reloadProperties === "undefined"
        ? rawApi.tabs.reload(tabId)
        : rawApi.tabs.reload(tabId, reloadProperties);
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
        rawApi.tabs.reload(tabId, callback);
        return;
      }

      rawApi.tabs.reload(tabId, reloadProperties, callback);
    });
  }

  globalThis.extensionApi = {
    raw: rawApi,
    runtimeGetURL(path) {
      return rawApi.runtime.getURL(path);
    },
    runtimeSendMessage(message) {
      return supportsPromiseApi
        ? rawApi.runtime.sendMessage(message)
        : wrapCallback(rawApi.runtime.sendMessage, rawApi.runtime, message);
    },
    storageGet(keys) {
      return supportsPromiseApi
        ? rawApi.storage.local.get(keys)
        : wrapCallback(rawApi.storage.local.get, rawApi.storage.local, keys);
    },
    storageSet(items) {
      return supportsPromiseApi
        ? rawApi.storage.local.set(items)
        : wrapCallback(rawApi.storage.local.set, rawApi.storage.local, items);
    },
    storageRemove(keys) {
      return supportsPromiseApi
        ? rawApi.storage.local.remove(keys)
        : wrapCallback(rawApi.storage.local.remove, rawApi.storage.local, keys);
    },
    tabsQuery(queryInfo) {
      return supportsPromiseApi
        ? rawApi.tabs.query(queryInfo)
        : wrapCallback(rawApi.tabs.query, rawApi.tabs, queryInfo);
    },
    tabsSendMessage(tabId, message) {
      return supportsPromiseApi
        ? rawApi.tabs.sendMessage(tabId, message)
        : wrapCallback(rawApi.tabs.sendMessage, rawApi.tabs, tabId, message);
    },
    tabsUpdate(tabId, updateProperties) {
      return supportsPromiseApi
        ? rawApi.tabs.update(tabId, updateProperties)
        : wrapCallback(rawApi.tabs.update, rawApi.tabs, tabId, updateProperties);
    },
    tabsReload,
  };
})();
