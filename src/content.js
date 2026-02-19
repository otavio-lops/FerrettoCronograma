/**
 * content.js
 * Este é o script principal que faz a ponte entre a página do Ferretto e a lógica da extensão.
 * 
 * Ele atualiza obtendo os dados do "listener.js", e então "traduzindo" para a linguagem que a extensão fala.
 * Permitindo, posteriormente, a organização dos dados de acordo com as demandas do usuário.
 */

const s = document.createElement("script");
s.src = chrome.runtime.getURL("./src/listener.js");
(document.head || document.documentElement).appendChild(s);

const cyrb53 = (str, seed = 0) => {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

window.addEventListener("message", async (e) => {
  if (e.data?.type !== "DATA_CAPTURED") return;

  let local_database = {
    changed: false,
    object: {
      materias: [],
      aulas_id: {},
      aulas: {}
    }
  };

  const checkDb = await chrome.storage.local.get(['weeks']);
  if (checkDb.weeks) local_database.object = checkDb.weeks;

  const aulas_formatadas = formatarAulas(e.data.payload.week_content.data.studyPlanByWeek.nodes);
  const hash_antigo = local_database.object.aulas_id[e.data.payload.week_number] || "";
  const hash_novo = aulas_formatadas.hash;

  if (hash_antigo !== hash_novo) {
    local_database.changed = true;
    local_database.object.aulas_id[e.data.payload.week_number] = aulas_formatadas.hash;
    local_database.object.aulas[e.data.payload.week_number] = aulas_formatadas.content;
    local_database.object.materias = Array.from(new Set(local_database.object.materias.concat(Object.keys(aulas_formatadas.content))));
  }

  if (local_database.changed) {
    chrome.storage.local.set({ "weeks": local_database.object });
  };
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "puxar_aulas") {
    puxarAulas().then(dados => sendResponse(dados))
      .catch(erro => sendResponse({ sucesso: "erro", conteudo: {} }));

    return true;
  }
});

async function puxarAulas() {
  const data = await chrome.storage.local.get(['weeks']);
  if (!data.weeks) return { sucesso: false, conteudo: {} };

  return {
    sucesso: true,
    conteudo: data.weeks
  };
}

function formatarAulas(data) {
  let disciplinas = {};

  for (const item of data) {
    for (const conteudo of item.disciplinesResources) {
      const nomeDaDisciplina = conteudo.discipline.name;

      const aulas = conteudo.resources.filter(aula => aula.type === "CLASS").map(aula => ({
        semana: item.weekNumber,
        titulo: aula.item.title,
        duracao: aula.item.mainVideo.timeInSeconds,
        assistida: aula.item.watched
      }));

      const exercicios = conteudo.resources.filter(aula => aula.type === "QUESTIONS_SUBJECT").map(aula => ({
        semana: item.weekNumber,
        titulo: aula.item.name
      }));

      const simulados = conteudo.resources.filter(aula => aula.type === "SIMULATED").map(aula => ({
        semana: item.weekNumber,
        titulo: aula.item.title,
      }));

      disciplinas[nomeDaDisciplina] = {
        aulas: aulas,
        exercicios: exercicios,
        simulados: simulados
      }
    }
  }

  return {
    hash: cyrb53(JSON.stringify(disciplinas)),
    content: disciplinas
  };
};

const allowedOrigins = [
  "https://app.professorferretto.com.br",
  "https://legado.professorferretto.com.br"
];

if (allowedOrigins.some(url => window.location.href.includes(url))) {
  const host = document.createElement('div');
  host.id = 'extensao-cronograma-root';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const estilo = document.createElement('style');
  estilo.textContent = `
    :host {
      all: initial; /* Reseta qualquer herança do site */
    }

    #container-cronograma-flutuante {
      position: fixed;
      bottom: 90px;
      left: 30px;
      width: 340px;
      height: 560px;
      z-index: 2147483646;
      display: none;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 12px 40px rgba(0,0,0,0.3);
      border: 1px solid rgba(0,0,0,0.1);
      animation: zoomIn 0.2s ease-out;
      background: #f1f5f9;
    }

    #container-cronograma-flutuante.ativo {
      display: block;
    }

    #iframe-cronograma {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }

    #btn-trigger-cronograma {
      position: fixed;
      bottom: 30px;
      left: 30px;
      z-index: 2147483647;
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
      transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s;
      white-space: nowrap;
      overflow: hidden;
    }

    #btn-trigger-cronograma.expandido {
      width: 340px;
      background: #4f46e5;
    }

    @keyframes zoomIn {
      from { opacity: 0; transform: scale(0.95) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
  `;
  shadow.appendChild(estilo);

  const container = document.createElement('div');
  container.id = 'container-cronograma-flutuante';

  const iframe = document.createElement('iframe');
  iframe.id = 'iframe-cronograma';

  container.appendChild(iframe);
  shadow.appendChild(container);

  const btn = document.createElement('button');
  btn.id = 'btn-trigger-cronograma';
  btn.innerHTML = '📅 Cronograma';
  shadow.appendChild(btn);

  const fecharJanela = () => {
    container.classList.remove('ativo');
    btn.classList.remove('expandido');
    btn.innerHTML = '📅 Cronograma';
  };

  const abrirJanela = () => {
    container.classList.add('ativo');
    btn.classList.add('expandido');
    btn.innerHTML = '✕ Fechar';
    iframe.src = chrome.runtime.getURL('../preview/index.html?origin=button');
  };

  btn.onclick = (e) => {
    e.stopPropagation();
    const estaAtivo = container.classList.contains('ativo');
    estaAtivo ? fecharJanela() : abrirJanela();
  };

  container.onclick = (e) => e.stopPropagation();

  window.addEventListener('click', (event) => {
    const path = event.composedPath();
    const clicouDentro = path.includes(container);
    const clicouNoBotao = path.includes(btn);

    if (container.classList.contains('ativo') && !clicouDentro && !clicouNoBotao) {
      fecharJanela();
    }
  });
}