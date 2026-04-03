/**
 * preview/index.js
 * Este script controla a interface (UI) da extensao. Ele gerencia a navegacao entre
 * as telas de carregamento, erro, configuracoes e a exibicao do cronograma.
 */

const popupApi = globalThis.extensionApi;
const menus = {
  acesso_errado: document.getElementById("acesso_errado"),
  carregando: document.getElementById("carregando"),
  primeira_vez: document.getElementById("primeira_vez"),
  configuracoes: document.getElementById("configuracoes"),
  cronograma: document.getElementById("cronograma"),
};

function mostrarTela(nome) {
  Object.values(menus).forEach((menu) => {
    menu.style.display = "none";
  });

  if (menus[nome]) {
    menus[nome].style.display = nome === "cronograma" ? "flex" : "block";
  }
}

async function load() {
  try {
    const state = await popupApi.runtimeSendMessage({ action: "load_popup_state" });

    if (!state?.screen) {
      mostrarTela("primeira_vez");
      return;
    }

    if (state.screen === "acesso_errado") {
      mostrarTela("acesso_errado");
      return;
    }

    if (state.screen === "primeira_vez") {
      mostrarTela("primeira_vez");
      return;
    }

    if (state.screen === "configuracoes") {
      montarTelaConfiguracoes(state.data, state.preload_settings);
      return;
    }

    if (state.screen === "cronograma") {
      mostrarTela("cronograma");
      mostrarCronograma(state.data.aulas, state.settings);
      return;
    }

    mostrarTela("primeira_vez");
  } catch (error) {
    mostrarTela("primeira_vez");
  }
}

function montarTelaConfiguracoes(data, preloadSettings) {
  const incluirSimuladosInput = document.getElementById("incluirSimulados");
  const incluirQuestoesInput = document.getElementById("incluirQuestoes");
  const incluirAtrasadosInput = document.getElementById("incluirAtrasados");
  const incluirAtrasadosSemanaAtualInput = document.getElementById("incluirAtrasadosSemanaAtual");

  document.getElementById("materias").innerHTML = "";
  data.materias.forEach((materia) => adicionarMateria(materia));
  mostrarTela("configuracoes");

  if (preloadSettings) {
    const checkboxesMaterias = document.querySelectorAll('#materias input[type="checkbox"]');
    const selecionadasMateria = preloadSettings.materias_selecionadas;

    checkboxesMaterias.forEach((input) => {
      input.checked = selecionadasMateria.includes(input.value);
    });

    const checkboxesDias = document.querySelectorAll('#seletorDias input[type="checkbox"]');
    const diasConfig = preloadSettings.dias_da_semana;

    checkboxesDias.forEach((input) => {
      input.checked = diasConfig.includes(input.value);
    });

    document.getElementById("qtdAulas").value = Number(preloadSettings.aulas_por_dia);
    document.getElementById("horasEstudo").value = Number(preloadSettings.horas_de_estudo);
    incluirSimuladosInput.checked = Boolean(preloadSettings.incluir_simulados_no_cronograma);
    incluirQuestoesInput.checked = Boolean(preloadSettings.incluir_questoes_no_cronograma);
    incluirAtrasadosInput.checked = Boolean(preloadSettings.incluir_conteudos_atrasados);
    incluirAtrasadosSemanaAtualInput.checked = Boolean(preloadSettings.incluir_conteudos_atrasados_semana_atual);
    document.getElementById("btnContinuar").innerText = "Salvar Cronograma";
  } else {
    incluirSimuladosInput.checked = false;
    incluirQuestoesInput.checked = false;
    incluirAtrasadosInput.checked = false;
    incluirAtrasadosSemanaAtualInput.checked = false;
    document.getElementById("btnContinuar").innerText = "Gerar Cronograma";
  }

  document.getElementById("btnContinuar").onclick = async () => {
    const materiasSelecionadas = Array.from(
      document.getElementById("materias").querySelectorAll('input[type="checkbox"]:checked')
    ).map((cb) => cb.value);
    const diasSelecionados = Array.from(
      document.getElementById("seletorDias").querySelectorAll('input[type="checkbox"]:checked')
    ).map((cb) => cb.value);
    const aulasPorDia = Number(document.getElementById("qtdAulas").value);
    const horasDeEstudo = Number(document.getElementById("horasEstudo").value);
    const incluirSimulados = incluirSimuladosInput.checked;
    const incluirQuestoes = incluirQuestoesInput.checked;
    const incluirConteudosAtrasados = incluirAtrasadosInput.checked;
    const incluirConteudosAtrasadosSemanaAtual = incluirAtrasadosSemanaAtualInput.checked;

    if (diasSelecionados.length < 1) {
      mostrarAlerta("Por favor, selecione pelo menos 1 de estudo.");
      return;
    }

    if (materiasSelecionadas.length < 1) {
      mostrarAlerta("Selecione pelo menos 1 materia para estudar.");
      return;
    }

    const minNecessario = Math.ceil(materiasSelecionadas.length / diasSelecionados.length);
    if (aulasPorDia < minNecessario) {
      mostrarAlerta(`Com ${materiasSelecionadas.length} materia(s) e ${diasSelecionados.length} dia(s) de estudo, voce precisa de no minimo ${minNecessario} materias por dia para o cronograma funcionar corretamente.`);
      return;
    }

    const configsPraSalvar = {
      dias_da_semana: diasSelecionados,
      materias_selecionadas: materiasSelecionadas,
      aulas_por_dia: aulasPorDia,
      horas_de_estudo: horasDeEstudo,
      incluir_simulados_no_cronograma: incluirSimulados,
      incluir_questoes_no_cronograma: incluirQuestoes,
      incluir_conteudos_atrasados: incluirConteudosAtrasados,
      incluir_conteudos_atrasados_semana_atual: incluirConteudosAtrasadosSemanaAtual,
    };

    const simulacaoCronograma = simularPrazoCronograma(data.aulas, configsPraSalvar);
    if (!simulacaoCronograma.cabe) {
      mostrarAlerta(`Horas de estudos insuficiente para terminar os estudos junto com a turma!<br><br>Aumente para ${horasDeEstudo + simulacaoCronograma.horasFaltantes} hora(s) de estudo por dia para finalizar junto com a turma.`);
      return;
    }

    await popupApi.runtimeSendMessage({
      action: "save_settings",
      payload: {
        settings: configsPraSalvar,
        clearPreload: Boolean(preloadSettings),
      },
    });

    mostrarTela("cronograma");
    mostrarCronograma(data.aulas, configsPraSalvar);
  };
}

window.onload = async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const origem = urlParams.get("origin");

  if (origem === "button") {
    mostrarTela("carregando");
    await load();
    return;
  }

  mostrarTela("acesso_errado");
};
