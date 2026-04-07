/**
 * content.js
 * Faz a ponte entre a página do Ferretto e a lógica da extensão.
 */

const contentApi = globalThis.extensionApi;
const s = document.createElement("script");
s.src = contentApi.runtimeGetURL("src/listener.js");
(document.head || document.documentElement).appendChild(s);

const cyrb53 = (str, seed = 0) => {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;

  for (let i = 0, ch; i < str.length; i += 1) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

const STORAGE_DB_PADRAO = {
  materias: [],
  aulas_id: {},
  aulas: {},
};

function criarChaveItemConteudo(categoria, item) {
  return [
    categoria,
    item.titulo || item.nome || "",
    item.duracao || 0,
  ].join("::");
}

async function carregarBancoLocal() {
  const checkDb = await contentApi.storageGet(["weeks"]);
  return checkDb.weeks ? checkDb.weeks : {
    ...STORAGE_DB_PADRAO,
    aulas_id: {},
    aulas: {},
    materias: [],
  };
}

async function salvarBancoLocal(dados) {
  await contentApi.storageSet({ weeks: dados });
}

window.addEventListener("message", async (e) => {
  if (e.data?.type === "DATA_CAPTURED") {
    const localDatabase = {
      changed: false,
      object: await carregarBancoLocal(),
    };

    const aulasFormatadas = formatarAulas(e.data.payload.week_content.data.studyPlanByWeek.nodes);
    const hashAntigo = localDatabase.object.aulas_id[e.data.payload.week_number] || "";
    const hashNovo = aulasFormatadas.hash;

    if (hashAntigo !== hashNovo) {
      localDatabase.changed = true;
      localDatabase.object.aulas_id[e.data.payload.week_number] = aulasFormatadas.hash;
      localDatabase.object.aulas[e.data.payload.week_number] = aulasFormatadas.content;
      localDatabase.object.materias = Array.from(
        new Set(localDatabase.object.materias.concat(Object.keys(aulasFormatadas.content)))
      );
    }

    if (sincronizarStatusConclusao(localDatabase.object.aulas)) {
      localDatabase.changed = true;
    }

    if (localDatabase.changed) {
      await salvarBancoLocal(localDatabase.object);
    }

    return;
  }

  if (e.data?.type === "RESOURCE_STATUS_CAPTURED") {
    const atualizacoes = Array.isArray(e.data.payload?.items) ? e.data.payload.items : [];
    if (!atualizacoes.length) {
      return;
    }

    const localDatabase = await carregarBancoLocal();
    const houveMudancaPorCaptura = aplicarAtualizacoesDeConclusao(localDatabase.aulas, atualizacoes);
    const houveMudancaPorSincronizacao = sincronizarStatusConclusao(localDatabase.aulas);

    if (houveMudancaPorCaptura || houveMudancaPorSincronizacao) {
      await salvarBancoLocal(localDatabase);
    }
  }
});

contentApi.raw.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "puxar_aulas") {
    puxarAulas()
      .then((dados) => sendResponse(dados))
      .catch(() => sendResponse({ sucesso: "erro", conteudo: {} }));

    return true;
  }

  return false;
});

async function puxarAulas() {
  const data = await contentApi.storageGet(["weeks"]);
  if (!data.weeks) {
    return { sucesso: false, conteudo: {} };
  }

  return {
    sucesso: true,
    conteudo: data.weeks,
  };
}

function formatarAulas(data) {
  const obterIdentificadorItem = (recurso) =>
    recurso?.id ??
    recurso?.item?.id ??
    recurso?.item?._id ??
    recurso?.item?.resourceId ??
    recurso?.item?.resource?.id ??
    null;

  const obterStatusConclusao = (item) => Boolean(
    item?.watched ??
    item?.completed ??
    item?.done ??
    item?.isCompleted ??
    item?.finished
  );

  const disciplinas = {};

  for (const item of data) {
    for (const conteudo of item.disciplinesResources) {
      const nomeDaDisciplina = conteudo.discipline.name;
      const aulas = [];
      const exercicios = [];
      const simulados = [];

      (conteudo.resources || []).forEach((recurso, ordem) => {
        if (recurso.type === "CLASS") {
          const duracao = recurso?.item?.mainVideo?.timeInSeconds ?? 0;
          const titulo = recurso?.item?.title || "";

          aulas.push({
            id: obterIdentificadorItem(recurso),
            semana: item.weekNumber,
            ordem,
            titulo,
            duracao,
            assistida: obterStatusConclusao(recurso.item),
            chave: criarChaveItemConteudo("aula", {
              titulo,
              duracao,
            }),
          });
          return;
        }

        if (recurso.type === "QUESTIONS_SUBJECT") {
          const titulo = recurso?.item?.name || "";

          exercicios.push({
            id: obterIdentificadorItem(recurso),
            semana: item.weekNumber,
            ordem,
            titulo,
            assistida: obterStatusConclusao(recurso.item),
            chave: criarChaveItemConteudo("questoes", {
              titulo,
            }),
          });
          return;
        }

        if (recurso.type === "SIMULATED") {
          const titulo = recurso?.item?.title || "";

          simulados.push({
            id: obterIdentificadorItem(recurso),
            semana: item.weekNumber,
            ordem,
            titulo,
            assistida: obterStatusConclusao(recurso.item),
            chave: criarChaveItemConteudo("simulado", {
              titulo,
            }),
          });
        }
      });

      disciplinas[nomeDaDisciplina] = {
        aulas,
        exercicios,
        simulados,
      };
    }
  }

  return {
    hash: cyrb53(JSON.stringify(disciplinas)),
    content: disciplinas,
  };
}

function aplicarAtualizacoesDeConclusao(aulasPorSemana, atualizacoes) {
  const idsConcluidos = new Set();
  const chavesConcluidas = new Set();
  let houveAlteracao = false;

  atualizacoes.forEach((item) => {
    if (!item?.assistida) {
      return;
    }

    if (item.id !== null && typeof item.id !== "undefined") {
      idsConcluidos.add(String(item.id));
    }

    if (item.chave) {
      chavesConcluidas.add(item.chave);
    }
  });

  if (!idsConcluidos.size && !chavesConcluidas.size) {
    return false;
  }

  const sincronizarColecao = (categoria, itens = []) => {
    itens.forEach((item) => {
      if (item?.assistida) {
        return;
      }

      const chaveItem = item.chave || criarChaveItemConteudo(categoria, item);
      const correspondeAoStatusNovo = (
        item.id !== null
        && typeof item.id !== "undefined"
        && idsConcluidos.has(String(item.id))
      ) || chavesConcluidas.has(chaveItem);

      if (correspondeAoStatusNovo) {
        item.assistida = true;
        houveAlteracao = true;
      }
    });
  };

  Object.values(aulasPorSemana || {}).forEach((materias) => {
    Object.values(materias || {}).forEach((conteudo) => {
      sincronizarColecao("aula", conteudo?.aulas);
      sincronizarColecao("questoes", conteudo?.exercicios);
      sincronizarColecao("simulado", conteudo?.simulados);
    });
  });

  return houveAlteracao;
}

function sincronizarStatusConclusao(aulasPorSemana) {
  const itensConcluidos = new Set();
  let houveAlteracao = false;

  const registrarChavesConcluidas = (materia, categoria, itens = []) => {
    itens.forEach((item) => {
      if (!item?.assistida) {
        return;
      }

      if (item.id) {
        itensConcluidos.add(`id::${item.id}`);
      }

      const chaveFallback = item.chave || criarChaveItemConteudo(categoria, item);
      itensConcluidos.add(`fp::${materia}::${chaveFallback}`);
    });
  };

  Object.entries(aulasPorSemana || {}).forEach(([, materias]) => {
    Object.entries(materias || {}).forEach(([materia, conteudo]) => {
      registrarChavesConcluidas(materia, "aula", conteudo?.aulas);
      registrarChavesConcluidas(materia, "questoes", conteudo?.exercicios);
      registrarChavesConcluidas(materia, "simulado", conteudo?.simulados);
    });
  });

  const sincronizarColecao = (materia, categoria, itens = []) => {
    itens.forEach((item) => {
      if (item?.assistida) {
        return;
      }

      const chaveFallback = item.chave || criarChaveItemConteudo(categoria, item);
      const deveMarcarConcluida = (item.id && itensConcluidos.has(`id::${item.id}`))
        || itensConcluidos.has(`fp::${materia}::${chaveFallback}`);

      if (deveMarcarConcluida) {
        item.assistida = true;
        houveAlteracao = true;
      }
    });
  };

  Object.values(aulasPorSemana || {}).forEach((materias) => {
    Object.entries(materias || {}).forEach(([materia, conteudo]) => {
      sincronizarColecao(materia, "aula", conteudo?.aulas);
      sincronizarColecao(materia, "questoes", conteudo?.exercicios);
      sincronizarColecao(materia, "simulado", conteudo?.simulados);
    });
  });

  return houveAlteracao;
}

const allowedOrigins = [
  "https://app.professorferretto.com.br",
  "https://legado.professorferretto.com.br",
];

if (allowedOrigins.some((url) => window.location.href.includes(url))) {
  const POSITION_STORAGE_KEY = "floating_widget_position";
  const BUTTON_WIDTH = 150;
  const BUTTON_HEIGHT = 48;
  const POPUP_WIDTH = 340;
  const POPUP_HEIGHT = 560;
  const POPUP_GAP = 12;
  const VIEWPORT_MARGIN = 16;
  const DRAG_HOLD_MS = 500;

  const host = document.createElement("div");
  host.id = "extensao-cronograma-root";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const estilo = document.createElement("style");
  estilo.textContent = `
    :host {
      all: initial;
    }

    #widget-cronograma {
      position: fixed;
      left: 30px;
      top: 30px;
      z-index: 2147483646;
      overflow: visible;
    }

    #overlay-arraste {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(15, 23, 42, 0.28);
      color: white;
      font-family: sans-serif;
      font-size: 28px;
      font-weight: 700;
      line-height: 1.25;
      text-align: center;
      letter-spacing: -0.02em;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: opacity 0.18s ease, visibility 0.18s ease;
      z-index: 2147483645;
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
    }

    #overlay-arraste.ativo {
      opacity: 1;
      visibility: visible;
    }

    #container-cronograma-flutuante {
      position: absolute;
      width: 340px;
      height: 560px;
      display: none;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(0, 0, 0, 0.1);
      animation: zoomIn 0.2s ease-out;
      background: #f1f5f9;
    }

    #container-cronograma-flutuante.ativo {
      display: block;
    }

    #widget-cronograma.popup-right #container-cronograma-flutuante {
      left: 0;
    }

    #widget-cronograma.popup-left #container-cronograma-flutuante {
      right: 0;
    }

    #widget-cronograma.popup-up #container-cronograma-flutuante {
      bottom: calc(100% + 12px);
    }

    #widget-cronograma.popup-down #container-cronograma-flutuante {
      top: calc(100% + 12px);
    }

    #iframe-cronograma {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }

    #btn-trigger-cronograma {
      position: relative;
      background: #6366f1;
      color: white;
      border: none;
      border-radius: 12px;
      padding: 12px 0;
      width: 150px;
      font-weight: bold;
      font-family: sans-serif;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.3s, transform 0.2s ease, box-shadow 0.2s ease;
      white-space: nowrap;
      overflow: hidden;
      touch-action: none;
    }

    #btn-trigger-cronograma.expandido {
      background: #4f46e5;
    }

    #widget-cronograma.arrastando #btn-trigger-cronograma {
      cursor: grabbing;
      transform: scale(1.02);
      box-shadow: 0 8px 24px rgba(99, 102, 241, 0.45);
      transition: none;
    }

    @keyframes zoomIn {
      from { opacity: 0; transform: scale(0.95) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
  `;
  shadow.appendChild(estilo);

  const widget = document.createElement("div");
  widget.id = "widget-cronograma";
  widget.classList.add("popup-right", "popup-up");

  const overlayArraste = document.createElement("div");
  overlayArraste.id = "overlay-arraste";
  overlayArraste.textContent = "Mova para onde voce quiser!";

  const container = document.createElement("div");
  container.id = "container-cronograma-flutuante";

  const iframe = document.createElement("iframe");
  iframe.id = "iframe-cronograma";
  container.appendChild(iframe);

  const btn = document.createElement("button");
  btn.id = "btn-trigger-cronograma";
  btn.textContent = "Cronograma";

  shadow.appendChild(overlayArraste);
  widget.appendChild(container);
  widget.appendChild(btn);
  shadow.appendChild(widget);

  const posicaoWidget = {
    left: 30,
    top: Math.max(VIEWPORT_MARGIN, window.innerHeight - BUTTON_HEIGHT - 30),
  };

  let holdTimer = null;
  let dragging = false;
  let suppressClick = false;
  let interactionActive = false;
  let activeTouchId = null;
  let offsetX = 0;
  let offsetY = 0;
  let startX = 0;
  let startY = 0;
  let currentPointerX = 0;
  let currentPointerY = 0;

  const clampPosition = (left, top) => {
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - BUTTON_WIDTH - VIEWPORT_MARGIN);
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - BUTTON_HEIGHT - VIEWPORT_MARGIN);

    return {
      left: Math.min(Math.max(left, VIEWPORT_MARGIN), maxLeft),
      top: Math.min(Math.max(top, VIEWPORT_MARGIN), maxTop),
    };
  };

  const limparHoldTimer = () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  const atualizarDirecaoPopup = () => {
    const espacoDireita = window.innerWidth - posicaoWidget.left - VIEWPORT_MARGIN;
    const espacoEsquerda = posicaoWidget.left + BUTTON_WIDTH - VIEWPORT_MARGIN;
    const espacoAcima = posicaoWidget.top - POPUP_GAP - VIEWPORT_MARGIN;
    const espacoAbaixo = window.innerHeight - posicaoWidget.top - BUTTON_HEIGHT - POPUP_GAP - VIEWPORT_MARGIN;

    const abreParaDireita = espacoDireita >= POPUP_WIDTH || espacoDireita >= espacoEsquerda;
    const abreParaCima = espacoAcima >= POPUP_HEIGHT || espacoAcima >= espacoAbaixo;

    widget.classList.toggle("popup-right", abreParaDireita);
    widget.classList.toggle("popup-left", !abreParaDireita);
    widget.classList.toggle("popup-up", abreParaCima);
    widget.classList.toggle("popup-down", !abreParaCima);
  };

  const aplicarPosicaoWidget = (left, top) => {
    const posicaoClamped = clampPosition(left, top);
    posicaoWidget.left = posicaoClamped.left;
    posicaoWidget.top = posicaoClamped.top;
    widget.style.left = `${posicaoWidget.left}px`;
    widget.style.top = `${posicaoWidget.top}px`;
    atualizarDirecaoPopup();
  };

  const salvarPosicaoWidget = async () => {
    await contentApi.storageSet({
      [POSITION_STORAGE_KEY]: {
        left: posicaoWidget.left,
        top: posicaoWidget.top,
      },
    });
  };

  const restaurarPosicaoWidget = async () => {
    const resultado = await contentApi.storageGet([POSITION_STORAGE_KEY]);
    const posicaoSalva = resultado[POSITION_STORAGE_KEY];

    if (typeof posicaoSalva?.left === "number" && typeof posicaoSalva?.top === "number") {
      aplicarPosicaoWidget(posicaoSalva.left, posicaoSalva.top);
      return;
    }

    aplicarPosicaoWidget(posicaoWidget.left, posicaoWidget.top);
  };

  const fecharJanela = () => {
    container.classList.remove("ativo");
    btn.classList.remove("expandido");
    btn.textContent = "Cronograma";
  };

  const abrirJanela = () => {
    atualizarDirecaoPopup();
    container.classList.add("ativo");
    btn.classList.add("expandido");
    btn.textContent = "Fechar";

    const iframeUrl = contentApi.runtimeGetURL(`preview/index.html?origin=button&ts=${Date.now()}`);
    iframe.src = iframeUrl;
  };

  const encerrarArraste = async () => {
    widget.classList.remove("arrastando");
    overlayArraste.classList.remove("ativo");

    if (dragging) {
      dragging = false;
      await salvarPosicaoWidget();
    }
  };

  const iniciarInteracao = (clientX, clientY, touchId = null) => {
    interactionActive = true;
    activeTouchId = touchId;
    startX = clientX;
    startY = clientY;
    currentPointerX = clientX;
    currentPointerY = clientY;
    offsetX = clientX - posicaoWidget.left;
    offsetY = clientY - posicaoWidget.top;
    suppressClick = false;
    dragging = false;

    limparHoldTimer();
    holdTimer = setTimeout(() => {
      if (!interactionActive) {
        return;
      }

      dragging = true;
      suppressClick = true;
      widget.classList.add("arrastando");
      overlayArraste.classList.add("ativo");
      offsetX = currentPointerX - posicaoWidget.left;
      offsetY = currentPointerY - posicaoWidget.top;
    }, DRAG_HOLD_MS);
  };

  const moverInteracao = (clientX, clientY) => {
    if (!interactionActive) {
      return;
    }

    currentPointerX = clientX;
    currentPointerY = clientY;

    if (!dragging) {
      const deltaX = Math.abs(clientX - startX);
      const deltaY = Math.abs(clientY - startY);

      if (deltaX > 24 || deltaY > 24) {
        limparHoldTimer();
      }

      return;
    }

    aplicarPosicaoWidget(clientX - offsetX, clientY - offsetY);
  };

  const finalizarInteracao = async () => {
    limparHoldTimer();
    interactionActive = false;
    activeTouchId = null;
    await encerrarArraste();
  };

  btn.addEventListener("mousedown", (e) => {
    if (e.button !== 0) {
      return;
    }

    iniciarInteracao(e.clientX, e.clientY);
  });

  window.addEventListener("mousemove", (e) => {
    moverInteracao(e.clientX, e.clientY);
  });

  window.addEventListener("mouseup", () => {
    finalizarInteracao();
  });

  btn.addEventListener("touchstart", (e) => {
    const toque = e.changedTouches[0];
    if (!toque) {
      return;
    }

    iniciarInteracao(toque.clientX, toque.clientY, toque.identifier);
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (!interactionActive || activeTouchId === null) {
      return;
    }

    const toque = Array.from(e.changedTouches).find((item) => item.identifier === activeTouchId);
    if (!toque) {
      return;
    }

    if (dragging) {
      e.preventDefault();
    }

    moverInteracao(toque.clientX, toque.clientY);
  }, { passive: false });

  const finalizarTouch = () => {
    finalizarInteracao();
  };

  window.addEventListener("touchend", finalizarTouch);
  window.addEventListener("touchcancel", finalizarTouch);

  btn.addEventListener("dragstart", (e) => {
    e.preventDefault();
  });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();

    if (suppressClick) {
      e.preventDefault();
      suppressClick = false;
      return;
    }

    const estaAtivo = container.classList.contains("ativo");
    estaAtivo ? fecharJanela() : abrirJanela();
  });

  container.onclick = (e) => e.stopPropagation();

  window.addEventListener("resize", () => {
    aplicarPosicaoWidget(posicaoWidget.left, posicaoWidget.top);
  });

  window.addEventListener("click", (event) => {
    const path = event.composedPath();
    const clicouNoWidget = path.includes(widget);

    if (container.classList.contains("ativo") && !clicouNoWidget) {
      fecharJanela();
    }
  });

  restaurarPosicaoWidget().catch(() => {
    aplicarPosicaoWidget(posicaoWidget.left, posicaoWidget.top);
  });
}
