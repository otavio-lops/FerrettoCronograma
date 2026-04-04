/**
 * listener.js
 * Este script sera responsavel por ler os dados da turma para montar o cronograma.
 * Ele roda no contexto da pagina para capturar os dados (materias, duracao, etc...) da turma
 * que a propria plataforma ja envia para o navegador do usuario.
 */

const f = window.fetch;
const STATUS_KEYS = ["watched", "completed", "done", "isCompleted", "finished"];

function normalizarCategoria(valor) {
  if (valor === "QUESTIONS_SUBJECT") {
    return "questoes";
  }

  if (valor === "SIMULATED") {
    return "simulado";
  }

  return "aula";
}

function criarChaveItem(categoria, item) {
  return [
    categoria,
    item.titulo || item.nome || "",
    item.duracao || 0,
  ].join("::");
}

function extrairAtualizacoesDeConclusao(payload) {
  const atualizacoes = [];
  const visitados = new WeakSet();
  const chavesUnicas = new Set();

  const visitar = (valor) => {
    if (!valor || typeof valor !== "object") {
      return;
    }

    if (visitados.has(valor)) {
      return;
    }

    visitados.add(valor);

    if (Array.isArray(valor)) {
      valor.forEach(visitar);
      return;
    }

    const chaveStatus = STATUS_KEYS.find((chave) => typeof valor[chave] === "boolean");
    if (chaveStatus && valor[chaveStatus]) {
      const origemItem = valor.item && typeof valor.item === "object"
        ? valor.item
        : valor;

      const id = valor.id
        ?? valor._id
        ?? valor.resourceId
        ?? origemItem.id
        ?? origemItem._id
        ?? origemItem.resourceId
        ?? null;

      const titulo = valor.title
        ?? valor.name
        ?? origemItem.title
        ?? origemItem.name
        ?? "";

      const duracao = Number(
        valor?.mainVideo?.timeInSeconds
        ?? origemItem?.mainVideo?.timeInSeconds
        ?? valor?.timeInSeconds
        ?? origemItem?.timeInSeconds
        ?? 0
      ) || 0;

      const categoria = normalizarCategoria(
        valor.type
        ?? valor.resourceType
        ?? origemItem.type
        ?? origemItem.resourceType
      );

      if (id !== null || titulo) {
        const chave = criarChaveItem(categoria, {
          titulo,
          duracao,
        });
        const chaveUnica = `${id ?? "sem-id"}::${chave}`;

        if (!chavesUnicas.has(chaveUnica)) {
          chavesUnicas.add(chaveUnica);
          atualizacoes.push({
            id,
            titulo,
            duracao,
            categoria,
            assistida: true,
            chave,
          });
        }
      }
    }

    Object.values(valor).forEach(visitar);
  };

  visitar(payload);
  return atualizacoes;
}

window.fetch = async (...args) => {
  const [resource, config] = args;
  const r = await f(...args);

  try {
    const c = r.clone();
    const j = await c.json();

    if (j && j.data && j.data.studyPlanByWeek && j.data.studyPlanByWeek.nodes) {
      window.postMessage({
        type: "DATA_CAPTURED",
        payload: {
          week_number: JSON.parse(config.body).variables.filter.week,
          week_content: j,
        },
      }, "*");
    }

    const atualizacoesDeConclusao = extrairAtualizacoesDeConclusao(j);
    if (atualizacoesDeConclusao.length > 0) {
      window.postMessage({
        type: "RESOURCE_STATUS_CAPTURED",
        payload: {
          items: atualizacoesDeConclusao,
        },
      }, "*");
    }
  } catch (err) {
    // Silencioso se nao for JSON
  }

  return r;
};
