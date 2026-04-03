/**
 * listener.js
 * Este script será responsável por ler os dados da turma para montar o cronograma.
 * Ele roda no contexto da página para capturar os dados (matérias, duração, etc...) da turma
 * que a própria plataforma já envia para o navegador do usuário.
 */

const f = window.fetch;

window.fetch = async (...args) => {
  const [resource, config] = args;
  const r = await f(...args);

  try {
    const c = r.clone();
    const j = await c.json();

    const url = typeof resource === 'string' ? resource : resource.url;

    const plainHeaders = {};
    if (config?.headers) {
      if (config.headers instanceof Headers) {
        config.headers.forEach((v, k) => plainHeaders[k] = v);
      } else {
        Object.assign(plainHeaders, config.headers);
      }
    }

    if (j && j.data && j.data.studyPlanByWeek && j.data.studyPlanByWeek.nodes) {
      window.postMessage({ 
        type: "DATA_CAPTURED", 
        payload: {
          week_number: JSON.parse(config.body).variables.filter.week,
          week_content: j
        }
      }, "*");
    }
  } catch (err) {
    // Silencioso se não for JSON
  }
  
  return r;
};