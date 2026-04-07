const scheduleApi = globalThis.extensionApi;

const TODOS_OS_DIAS = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
];

let dadosCronogramaCompleto = {};
let semanaAtiva = 1;
let semanaAtual = 1;
let diaAtivoIndice = 0;
let DIAS_SEMANA_USUARIO = [];
let exibirAssistidas = false;
const DURACAO_QUESTOES = 30 * 60;
const DURACAO_SIMULADO = 40 * 60;
const ORDEM_PADRAO_CATEGORIA = {
  aula: 0,
  questoes: 1,
  simulado: 2,
};

function filtrarMaterias(dadosOriginais, selecionadas) {
  const filtrados = {};
  const materiasSelecionadas = Array.isArray(selecionadas) ? selecionadas : [];

  Object.keys(dadosOriginais || {}).forEach((semana) => {
    filtrados[semana] = {};

    materiasSelecionadas.forEach((materia) => {
      if (dadosOriginais[semana]?.[materia]) {
        filtrados[semana][materia] = dadosOriginais[semana][materia];
      }
    });
  });

  return filtrados;
}

function clonarDadosPorSemana(dadosPorSemana) {
  const clone = {};

  Object.entries(dadosPorSemana || {}).forEach(([semana, materias]) => {
    clone[semana] = {};

    Object.entries(materias || {}).forEach(([materia, conteudo]) => {
      clone[semana][materia] = {
        aulas: (conteudo.aulas || []).map((aula) => ({ ...aula })),
        exercicios: (conteudo.exercicios || []).map((item) => ({ ...item })),
        simulados: (conteudo.simulados || []).map((item) => ({ ...item })),
      };
    });
  });

  return clone;
}

function obterSemanasDisponiveis(dadosPorSemana) {
  return Object.keys(dadosPorSemana || {})
    .map(Number)
    .filter((semana) => !Number.isNaN(semana))
    .sort((a, b) => a - b);
}

function obterOpcoesDeConteudo(config = {}) {
  return {
    incluirConteudosAtrasados: Boolean(config.incluir_conteudos_atrasados),
    incluirAtrasadosSemanaAtual: Boolean(config.incluir_conteudos_atrasados_semana_atual),
    incluirSimulados: Boolean(config.incluir_simulados_no_cronograma),
    incluirQuestoes: Boolean(config.incluir_questoes_no_cronograma),
  };
}

function normalizarDuracao(valor, padrao = 0) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : padrao;
}

function normalizarOrdemSequencia(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 0 ? numero : null;
}

function normalizarItemConteudo(item, categoria) {
  const duracaoPadrao = categoria === "simulado"
    ? DURACAO_SIMULADO
    : categoria === "questoes"
      ? DURACAO_QUESTOES
      : 0;

  return {
    titulo: item.titulo || item.nome || "",
    assistida: Boolean(item.assistida),
    duracao: normalizarDuracao(item.duracao, duracaoPadrao),
    categoria,
    semana: item.semana ?? null,
    ordem: normalizarOrdemSequencia(item.ordem),
  };
}

function clonarDetalhe(item) {
  return {
    titulo: item.titulo,
    assistida: Boolean(item.assistida),
    duracao: normalizarDuracao(item.duracao),
    categoria: item.categoria || "aula",
    ordem: normalizarOrdemSequencia(item.ordem),
  };
}

function compararItensPorSequencia(a, b) {
  const ordemA = normalizarOrdemSequencia(a?.ordem);
  const ordemB = normalizarOrdemSequencia(b?.ordem);

  if (ordemA !== null || ordemB !== null) {
    if (ordemA === null) {
      return 1;
    }

    if (ordemB === null) {
      return -1;
    }

    if (ordemA !== ordemB) {
      return ordemA - ordemB;
    }
  }

  const prioridadeCategoriaA = ORDEM_PADRAO_CATEGORIA[a?.categoria] ?? Number.MAX_SAFE_INTEGER;
  const prioridadeCategoriaB = ORDEM_PADRAO_CATEGORIA[b?.categoria] ?? Number.MAX_SAFE_INTEGER;

  if (prioridadeCategoriaA !== prioridadeCategoriaB) {
    return prioridadeCategoriaA - prioridadeCategoriaB;
  }

  return 0;
}

function ordenarItensPorSequencia(itens = []) {
  return itens.sort(compararItensPorSequencia);
}

function extrairItensSelecionados(conteudo, opcoesConteudo) {
  return ordenarItensPorSequencia([
    ...(conteudo.aulas || []).map((item) => normalizarItemConteudo(item, "aula")),
    ...(opcoesConteudo.incluirQuestoes
      ? (conteudo.exercicios || []).map((item) => normalizarItemConteudo(item, "questoes"))
      : []),
    ...(opcoesConteudo.incluirSimulados
      ? (conteudo.simulados || []).map((item) => normalizarItemConteudo(item, "simulado"))
      : []),
  ]);
}

function criarGrupoAtrasado(materia, semanaOriginal, itens) {
  return {
    id: `atrasado-${semanaOriginal}-${materia}`,
    materia,
    prioridade: 0,
    tipoConteudo: "atrasado",
    semanaOriginal,
    diaOriginal: null,
    itens,
  };
}

function criarGrupoAtrasadoSemanaAtual(materia, diaOriginal, itens) {
  return {
    id: `atrasado-semana-atual-${diaOriginal}-${materia}`,
    materia,
    prioridade: 1,
    tipoConteudo: "atrasado_semana_atual",
    semanaOriginal: null,
    diaOriginal,
    itens,
  };
}

function criarGrupoAtual(materia, itens) {
  return {
    id: `atual-${materia}`,
    materia,
    prioridade: 2,
    tipoConteudo: "atual",
    semanaOriginal: null,
    diaOriginal: null,
    itens,
  };
}

function obterOuCriarGrupoNoMapa(mapa, chave, criarGrupo) {
  if (!mapa.has(chave)) {
    mapa.set(chave, criarGrupo());
  }

  return mapa.get(chave);
}

function coletarPendenciasDaColecao(
  conteudo,
  chaveColecao,
  categoria,
  deveIncluir,
  numeroSemana,
  semanaReferencia,
  materia,
  backlogMap
) {
  if (!deveIncluir) {
    return;
  }

  const itensMantidos = [];

  (conteudo[chaveColecao] || []).forEach((item) => {
    const itemNormalizado = normalizarItemConteudo(item, categoria);

    if (itemNormalizado.assistida) {
      itensMantidos.push(item);
      return;
    }

    const semanaOriginal = itemNormalizado.semana ?? numeroSemana;
    const chaveGrupo = `${semanaOriginal}::${materia}`;
    const grupo = obterOuCriarGrupoNoMapa(backlogMap, chaveGrupo, () =>
      criarGrupoAtrasado(materia, Number(semanaOriginal), [])
    );

    grupo.itens.push({
      ...itemNormalizado,
      assistida: false,
      semana: semanaReferencia,
      semana_original: semanaOriginal,
    });
  });

  conteudo[chaveColecao] = itensMantidos;
}

function prepararDadosPorSemana(dadosPorSemana, opcoesConteudo) {
  const dadosProcessados = clonarDadosPorSemana(dadosPorSemana);
  const semanasDisponiveis = obterSemanasDisponiveis(dadosProcessados);
  const semanaReferencia = semanasDisponiveis.length > 0 ? Math.max(...semanasDisponiveis) : 1;
  const backlogMap = new Map();

  if (!dadosProcessados[semanaReferencia]) {
    dadosProcessados[semanaReferencia] = {};
  }

  if (!opcoesConteudo.incluirConteudosAtrasados) {
    return {
      dadosProcessados,
      backlogSemanaAtual: [],
      semanaAtualReferencia: semanaReferencia,
    };
  }

  semanasDisponiveis.forEach((numeroSemana) => {
    if (numeroSemana >= semanaReferencia) {
      return;
    }

    Object.entries(dadosProcessados[numeroSemana] || {}).forEach(([materia, conteudo]) => {
      coletarPendenciasDaColecao(
        conteudo,
        "aulas",
        "aula",
        true,
        numeroSemana,
        semanaReferencia,
        materia,
        backlogMap
      );

      coletarPendenciasDaColecao(
        conteudo,
        "exercicios",
        "questoes",
        opcoesConteudo.incluirQuestoes,
        numeroSemana,
        semanaReferencia,
        materia,
        backlogMap
      );

      coletarPendenciasDaColecao(
        conteudo,
        "simulados",
        "simulado",
        opcoesConteudo.incluirSimulados,
        numeroSemana,
        semanaReferencia,
        materia,
        backlogMap
      );
    });
  });

  const backlogSemanaAtual = Array.from(backlogMap.values())
    .sort((a, b) => {
      if (a.semanaOriginal !== b.semanaOriginal) {
        return a.semanaOriginal - b.semanaOriginal;
      }

      return a.materia.localeCompare(b.materia);
    });

  return {
    dadosProcessados,
    backlogSemanaAtual,
    semanaAtualReferencia: semanaReferencia,
  };
}

function calcularCargaPendentePorSemana(
  dadosPorSemana,
  backlogSemanaAtual,
  semanaAtualReferencia,
  opcoesConteudo
) {
  const totais = {};

  Object.entries(dadosPorSemana || {}).forEach(([semana, materias]) => {
    let totalSemana = 0;

    Object.values(materias || {}).forEach((conteudo) => {
      extrairItensSelecionados(conteudo, opcoesConteudo).forEach((item) => {
        if (!item.assistida) {
          totalSemana += item.duracao;
        }
      });
    });

    totais[semana] = totalSemana;
  });

  if (backlogSemanaAtual.length > 0) {
    const chaveSemanaAtual = String(semanaAtualReferencia);
    if (!totais[chaveSemanaAtual]) {
      totais[chaveSemanaAtual] = 0;
    }

    backlogSemanaAtual.forEach((grupo) => {
      grupo.itens.forEach((item) => {
        if (!item.assistida) {
          totais[chaveSemanaAtual] += item.duracao;
        }
      });
    });
  }

  return totais;
}

function simularPrazoCronograma(dadosPorSemana, config) {
  const opcoesConteudo = {
    ...obterOpcoesDeConteudo(config),
    incluirConteudosAtrasados: false,
    incluirAtrasadosSemanaAtual: false,
  };
  const dadosFiltrados = filtrarMaterias(
    dadosPorSemana,
    config.materias_selecionadas || []
  );

  const { dadosProcessados, backlogSemanaAtual, semanaAtualReferencia } = prepararDadosPorSemana(
    dadosFiltrados,
    opcoesConteudo
  );

  const diasEstudoSemanal = config.dias_da_semana.length || 1;
  const segundosDisponiveisSemana = config.horas_de_estudo * 3600 * diasEstudoSemanal;
  const cargasPendentes = Object.values(
    calcularCargaPendentePorSemana(
      dadosProcessados,
      backlogSemanaAtual,
      semanaAtualReferencia,
      opcoesConteudo
    )
  );
  const maiorDeficit = cargasPendentes.reduce((maior, cargaSemana) => {
    return Math.max(maior, cargaSemana - segundosDisponiveisSemana);
  }, 0);

  return {
    cabe: maiorDeficit <= 0,
    horasFaltantes: Math.ceil(maiorDeficit / 3600 / diasEstudoSemanal),
  };
}

function criarEstruturaSemana(diasSelecionados) {
  return TODOS_OS_DIAS.map((nome) => ({
    nome,
    segundosUsados: 0,
    materiasNoDia: new Set(),
    blocos: {},
    tipo: diasSelecionados.includes(nome) ? "estudo" : "descanso",
  }));
}

function criarFilaAPartirDeGrupo(grupo) {
  return ordenarItensPorSequencia([...grupo.itens]).map((item) => ({
    ...item,
    materia: grupo.materia,
    blocoId: grupo.id,
    prioridade: grupo.prioridade,
    tipoConteudo: grupo.tipoConteudo,
    semanaOriginal: grupo.semanaOriginal,
    diaOriginal: grupo.diaOriginal ?? null,
  }));
}

function extrairGruposAtuais(conteudoSemana, opcoesConteudo) {
  return Object.entries(conteudoSemana || {})
    .map(([materia, conteudo]) => {
      const itens = extrairItensSelecionados(conteudo, opcoesConteudo);
      return itens.length > 0 ? criarGrupoAtual(materia, itens) : null;
    })
    .filter(Boolean);
}

function calcularLimiteIdealDaSemana(gruposAtuais, diasDeEstudo, horasPorDia) {
  const limiteBase = horasPorDia * 3600;

  if (!diasDeEstudo.length) {
    return limiteBase;
  }

  const cargaTotalSemana = gruposAtuais.reduce((totalSemana, grupo) => {
    return totalSemana + grupo.itens.reduce((totalGrupo, item) => {
      return totalGrupo + item.duracao;
    }, 0);
  }, 0);

  if (cargaTotalSemana <= 0) {
    return limiteBase;
  }

  return Math.max(limiteBase, Math.ceil(cargaTotalSemana / diasDeEstudo.length));
}

function garantirBlocoNoDia(dia, item) {
  if (!dia.blocos[item.blocoId]) {
    dia.blocos[item.blocoId] = {
      id: item.blocoId,
      prioridade: item.prioridade ?? 1,
      tipoConteudo: item.tipoConteudo ?? "atual",
      semanaOriginal: item.semanaOriginal ?? null,
      diaOriginal: item.diaOriginal ?? null,
      materia: item.materia,
      tempoTotal: 0,
      tempoAssistido: 0,
      itensConcluidos: 0,
      ordemPrimeiroItem: item.ordemDistribuicao ?? Number.MAX_SAFE_INTEGER,
      detalhes: [],
    };
  }

  const bloco = dia.blocos[item.blocoId];
  const ordemAtual = item.ordemDistribuicao ?? Number.MAX_SAFE_INTEGER;

  if (ordemAtual < (bloco.ordemPrimeiroItem ?? Number.MAX_SAFE_INTEGER)) {
    bloco.ordemPrimeiroItem = ordemAtual;
  }

  return bloco;
}

function adicionarItemAoDia(dia, item) {
  const bloco = garantirBlocoNoDia(dia, item);

  bloco.detalhes.push(clonarDetalhe(item));
  bloco.tempoTotal += item.duracao;
  dia.segundosUsados += item.duracao;

  if (item.assistida) {
    bloco.tempoAssistido += item.duracao;
    bloco.itensConcluidos += 1;
  }

  dia.materiasNoDia.add(item.materia);
}

function podeAdicionarItem(
  dia,
  item,
  materiasPorDia,
  limiteSegundosIdeal,
  margemTolerancia,
  ignorarTolerancia = false
) {
  const jaTemMateria = dia.materiasNoDia.has(item.materia);
  const podeAdicionarNovaMateria = dia.materiasNoDia.size < materiasPorDia;
  const cabeNaTolerancia =
    ignorarTolerancia ||
    dia.segundosUsados + item.duracao <= limiteSegundosIdeal + margemTolerancia;

  return (jaTemMateria || podeAdicionarNovaMateria) && cabeNaTolerancia;
}

function escolherDiaSequencialParaItem(
  diasDeEstudo,
  item,
  indiceInicial,
  materiasPorDia,
  limiteSegundosIdeal,
  margemTolerancia
) {
  const indicePartida = Math.min(
    Math.max(indiceInicial, 0),
    diasDeEstudo.length - 1
  );

  for (let indiceDia = indicePartida; indiceDia < diasDeEstudo.length; indiceDia += 1) {
    const dia = diasDeEstudo[indiceDia];
    if (podeAdicionarItem(dia, item, materiasPorDia, limiteSegundosIdeal, margemTolerancia)) {
      return indiceDia;
    }
  }

  for (let indiceDia = indicePartida; indiceDia < diasDeEstudo.length; indiceDia += 1) {
    const dia = diasDeEstudo[indiceDia];
    if (podeAdicionarItem(dia, item, materiasPorDia, limiteSegundosIdeal, margemTolerancia, true)) {
      return indiceDia;
    }
  }

  return diasDeEstudo.length - 1;
}

function distribuirFilaEmSequencia(
  diasDeEstudo,
  fila,
  materiasPorDia,
  limiteSegundosIdeal,
  margemTolerancia,
  sequenciadorDistribuicao
) {
  if (!fila.length || !diasDeEstudo.length) {
    return;
  }

  const sequenciador = sequenciadorDistribuicao || { valor: 0 };
  let cursorDia = 0;

  fila.forEach((item) => {
    const indiceDia = escolherDiaSequencialParaItem(
      diasDeEstudo,
      item,
      cursorDia,
      materiasPorDia,
      limiteSegundosIdeal,
      margemTolerancia
    );

    adicionarItemAoDia(diasDeEstudo[indiceDia], {
      ...item,
      ordemDistribuicao: sequenciador.valor,
    });
    sequenciador.valor += 1;
    cursorDia = indiceDia;
  });
}

function escolherDiaParaAtrasado(
  diasAlvo,
  item,
  materiasPorDia,
  limiteSegundosIdeal,
  margemTolerancia
) {
  const candidatosComLimiteDeMateria = diasAlvo.filter((dia) => {
    return dia.materiasNoDia.has(item.materia) || dia.materiasNoDia.size < materiasPorDia;
  });

  const candidatosBase = candidatosComLimiteDeMateria.length > 0 ? candidatosComLimiteDeMateria : diasAlvo;
  const limiteComTolerancia = limiteSegundosIdeal + margemTolerancia;
  const candidatosNaTolerancia = candidatosBase.filter((dia) => {
    return dia.segundosUsados + item.duracao <= limiteComTolerancia;
  });
  const candidatos = candidatosNaTolerancia.length > 0 ? candidatosNaTolerancia : candidatosBase;

  const montarMetricas = (diaCandidato) => {
    const cargasProjetadas = diasAlvo.map((diaAtual) => {
      return diaAtual === diaCandidato
        ? diaAtual.segundosUsados + item.duracao
        : diaAtual.segundosUsados;
    });
    const totalProjetado = cargasProjetadas.reduce((total, carga) => total + carga, 0);
    const mediaProjetada = totalProjetado / cargasProjetadas.length;

    return {
      excesso: Math.max(0, (diaCandidato.segundosUsados + item.duracao) - limiteComTolerancia),
      intervalo: Math.max(...cargasProjetadas) - Math.min(...cargasProjetadas),
      desvioTotal: cargasProjetadas.reduce((total, carga) => {
        return total + Math.abs(carga - mediaProjetada);
      }, 0),
      projecao: diaCandidato.segundosUsados + item.duracao,
      mesmaMateria: diaCandidato.materiasNoDia.has(item.materia) ? 0 : 1,
      ordemDia: TODOS_OS_DIAS.indexOf(diaCandidato.nome),
    };
  };

  return candidatos.reduce((melhorDia, dia) => {
    if (!melhorDia) {
      return dia;
    }

    const metricasDia = montarMetricas(dia);
    const metricasMelhor = montarMetricas(melhorDia);

    if (metricasDia.excesso !== metricasMelhor.excesso) {
      return metricasDia.excesso < metricasMelhor.excesso ? dia : melhorDia;
    }

    if (metricasDia.intervalo !== metricasMelhor.intervalo) {
      return metricasDia.intervalo < metricasMelhor.intervalo ? dia : melhorDia;
    }

    if (metricasDia.desvioTotal !== metricasMelhor.desvioTotal) {
      return metricasDia.desvioTotal < metricasMelhor.desvioTotal ? dia : melhorDia;
    }

    if (metricasDia.projecao !== metricasMelhor.projecao) {
      return metricasDia.projecao < metricasMelhor.projecao ? dia : melhorDia;
    }

    if (metricasDia.mesmaMateria !== metricasMelhor.mesmaMateria) {
      return metricasDia.mesmaMateria < metricasMelhor.mesmaMateria ? dia : melhorDia;
    }

    return metricasDia.ordemDia < metricasMelhor.ordemDia ? dia : melhorDia;
  }, null);
}

function distribuirFilaAtrasadaAoLongoDaSemana(
  diasAlvo,
  fila,
  materiasPorDia,
  limiteSegundosIdeal,
  margemTolerancia,
  sequenciadorDistribuicao
) {
  if (!fila.length || !diasAlvo.length) {
    return;
  }

  const sequenciador = sequenciadorDistribuicao || { valor: 0 };

  fila.forEach((item) => {
    const diaEscolhido = escolherDiaParaAtrasado(
      diasAlvo,
      item,
      materiasPorDia,
      limiteSegundosIdeal,
      margemTolerancia
    );

    if (!diaEscolhido) {
      return;
    }

    adicionarItemAoDia(diaEscolhido, {
      ...item,
      ordemDistribuicao: sequenciador.valor,
    });
    sequenciador.valor += 1;
  });
}

function compararBlocosOuGrupos(a, b) {
  if (a.prioridade !== b.prioridade) {
    return a.prioridade - b.prioridade;
  }

  const semanaA = a.semanaOriginal ?? Number.MAX_SAFE_INTEGER;
  const semanaB = b.semanaOriginal ?? Number.MAX_SAFE_INTEGER;

  if (semanaA !== semanaB) {
    return semanaA - semanaB;
  }

  const diaA = a.diaOriginal ? TODOS_OS_DIAS.indexOf(a.diaOriginal) : Number.MAX_SAFE_INTEGER;
  const diaB = b.diaOriginal ? TODOS_OS_DIAS.indexOf(b.diaOriginal) : Number.MAX_SAFE_INTEGER;

  if (diaA !== diaB) {
    return diaA - diaB;
  }

  return a.materia.localeCompare(b.materia);
}

function compararPrioridadeCronologica(a, b) {
  if (a.prioridade !== b.prioridade) {
    return a.prioridade - b.prioridade;
  }

  const semanaA = a.semanaOriginal ?? Number.MAX_SAFE_INTEGER;
  const semanaB = b.semanaOriginal ?? Number.MAX_SAFE_INTEGER;

  if (semanaA !== semanaB) {
    return semanaA - semanaB;
  }

  const diaA = a.diaOriginal ? TODOS_OS_DIAS.indexOf(a.diaOriginal) : Number.MAX_SAFE_INTEGER;
  const diaB = b.diaOriginal ? TODOS_OS_DIAS.indexOf(b.diaOriginal) : Number.MAX_SAFE_INTEGER;

  if (diaA !== diaB) {
    return diaA - diaB;
  }
 
  return 0;
}

function compararBlocosParaRender(a, b) {
  const comparacaoCronologica = compararPrioridadeCronologica(a, b);

  if (comparacaoCronologica !== 0) {
    return comparacaoCronologica;
  }

  const ordemA = a.ordemPrimeiroItem ?? Number.MAX_SAFE_INTEGER;
  const ordemB = b.ordemPrimeiroItem ?? Number.MAX_SAFE_INTEGER;

  if (ordemA !== ordemB) {
    return ordemA - ordemB;
  }

  return compararBlocosOuGrupos(a, b);
}

function ordenarBlocosParaRender(blocos) {
  return Object.values(blocos).sort(compararBlocosParaRender);
}

function atualizarBlocoAposMoverPendencias(bloco, itensRestantes) {
  bloco.detalhes = itensRestantes.map((item) => clonarDetalhe(item));
  bloco.tempoTotal = itensRestantes.reduce((total, item) => total + item.duracao, 0);
  bloco.tempoAssistido = itensRestantes.reduce((total, item) => {
    return total + (item.assistida ? item.duracao : 0);
  }, 0);
  bloco.itensConcluidos = itensRestantes.filter((item) => item.assistida).length;
}

function registrarPendenciasDaSemanaAtual(backlogMap, bloco, diaOrigem, pendencias) {
  let chaveGrupo;
  let grupo;

  if (bloco.tipoConteudo === "atrasado" && bloco.semanaOriginal) {
    chaveGrupo = `atrasado::${bloco.semanaOriginal}::${bloco.materia}`;
    grupo = obterOuCriarGrupoNoMapa(backlogMap, chaveGrupo, () =>
      criarGrupoAtrasado(bloco.materia, bloco.semanaOriginal, [])
    );
  } else {
    const diaOriginal = bloco.tipoConteudo === "atrasado_semana_atual"
      ? (bloco.diaOriginal || diaOrigem)
      : diaOrigem;

    chaveGrupo = `atrasado-semana-atual::${diaOriginal}::${bloco.materia}`;
    grupo = obterOuCriarGrupoNoMapa(backlogMap, chaveGrupo, () =>
      criarGrupoAtrasadoSemanaAtual(bloco.materia, diaOriginal, [])
    );
  }

  pendencias.forEach((item) => {
    grupo.itens.push({
      ...clonarDetalhe(item),
      assistida: false,
    });
  });
}

function recomputarMateriasNoDia(dia) {
  dia.materiasNoDia = new Set(Object.values(dia.blocos).map((item) => item.materia));
}

function extrairAtrasadosDaSemanaAtual(
  estruturaSeteDias,
  diasDestino,
  indiceDiaAtual,
  materiasPorDia,
  limiteSegundosIdeal,
  margemTolerancia,
  sequenciadorDistribuicao
) {
  if (!diasDestino.length || indiceDiaAtual <= 0) {
    return;
  }

  const backlogSemanaAtual = new Map();

  for (let i = 0; i < indiceDiaAtual; i += 1) {
    const dia = estruturaSeteDias[i];

    if (dia.tipo !== "estudo") {
      continue;
    }

    Object.entries(dia.blocos).forEach(([blocoId, bloco]) => {
      const itensRestantes = [];
      const itensPendentes = [];

      bloco.detalhes.forEach((item) => {
        if (item.assistida) {
          itensRestantes.push(item);
          return;
        }

        itensPendentes.push(item);
      });

      if (!itensPendentes.length) {
        return;
      }

      registrarPendenciasDaSemanaAtual(backlogSemanaAtual, bloco, dia.nome, itensPendentes);
      dia.segundosUsados -= itensPendentes.reduce((total, item) => total + item.duracao, 0);

      if (itensRestantes.length === 0) {
        delete dia.blocos[blocoId];
      } else {
        atualizarBlocoAposMoverPendencias(bloco, itensRestantes);
      }
    });

    recomputarMateriasNoDia(dia);
  }

  const gruposRedistribuidos = Array.from(backlogSemanaAtual.values()).sort(compararBlocosOuGrupos);

  const filaRedistribuida = gruposRedistribuidos.flatMap((grupo) => criarFilaAPartirDeGrupo(grupo));
  distribuirFilaAtrasadaAoLongoDaSemana(
    diasDestino,
    filaRedistribuida,
    materiasPorDia,
    limiteSegundosIdeal,
    margemTolerancia,
    sequenciadorDistribuicao
  );
}

function gerarCronogramaLogica(
  diasSelecionados,
  dadosFiltradosPorSemana,
  backlogSemanaAtual,
  semanaAtualReferencia,
  opcoesConteudo,
  materiasPorDia,
  horasPorDia
) {
  const cronogramaGeral = {};
  const semanasDisponiveis = obterSemanasDisponiveis(dadosFiltradosPorSemana);
  const maxSemanaBase = semanasDisponiveis.length > 0 ? Math.max(...semanasDisponiveis) : 1;
  const maxSemana = Math.max(maxSemanaBase, semanaAtualReferencia || 1);
  const margemTolerancia = 1200;

  for (let i = 1; i <= maxSemana; i += 1) {
    const chaveSemana = `Semana ${i}`;
    const conteudoSemana = dadosFiltradosPorSemana[i] || {};
    const estruturaSeteDias = criarEstruturaSemana(diasSelecionados);
    const diasDeEstudo = estruturaSeteDias.filter((dia) => dia.tipo === "estudo");

    if (diasDeEstudo.length > 0) {
      const sequenciadorDistribuicao = { valor: 0 };
      const gruposAtuais = extrairGruposAtuais(conteudoSemana, opcoesConteudo);
      const filaAtual = gruposAtuais.flatMap((grupo) => criarFilaAPartirDeGrupo(grupo));
      const limiteSegundosIdealSemana = calcularLimiteIdealDaSemana(
        gruposAtuais,
        diasDeEstudo,
        horasPorDia
      );

      distribuirFilaEmSequencia(
        diasDeEstudo,
        filaAtual,
        materiasPorDia,
        limiteSegundosIdealSemana,
        margemTolerancia,
        sequenciadorDistribuicao
      );

      if (i === semanaAtualReferencia && backlogSemanaAtual.length > 0) {
        const filaAtrasados = backlogSemanaAtual.flatMap((grupo) => criarFilaAPartirDeGrupo(grupo));
        distribuirFilaAtrasadaAoLongoDaSemana(
          diasDeEstudo,
          filaAtrasados,
          materiasPorDia,
          limiteSegundosIdealSemana,
          margemTolerancia,
          sequenciadorDistribuicao
        );
      }

      if (i === semanaAtualReferencia && opcoesConteudo.incluirAtrasadosSemanaAtual) {
        const indiceDiaAtual = new Date().getDay() - 1;
        const indiceNormalizado = indiceDiaAtual === -1 ? 6 : indiceDiaAtual;
        const diasDestino = estruturaSeteDias.filter((dia, indice) => {
          return dia.tipo === "estudo" && indice >= indiceNormalizado;
        });

        extrairAtrasadosDaSemanaAtual(
          estruturaSeteDias,
          diasDestino,
          indiceNormalizado,
          materiasPorDia,
          limiteSegundosIdealSemana,
          margemTolerancia,
          sequenciadorDistribuicao
        );
      }
    }

    cronogramaGeral[chaveSemana] = {};

    estruturaSeteDias.forEach((dia) => {
      cronogramaGeral[chaveSemana][dia.nome] = {
        tipo: dia.tipo,
        conteudo: ordenarBlocosParaRender(dia.blocos).map((bloco) => ({
          materia: bloco.materia,
          prioridade: bloco.prioridade,
          tipoConteudo: bloco.tipoConteudo,
          semanaOriginal: bloco.semanaOriginal,
          diaOriginal: bloco.diaOriginal,
          duracao: bloco.tempoTotal,
          assistido: bloco.tempoAssistido,
          qtdTitulos: bloco.detalhes.length,
          qtdAssistidas: bloco.itensConcluidos,
          detalhes: bloco.detalhes.map((item) => clonarDetalhe(item)),
        })),
      };
    });
  }

  return cronogramaGeral;
}

function formatarTempoCurto(segundos) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

function stringToColor(str) {
  let hash = 0;

  for (let i = 0; i < str.length; i += 1) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  return `hsl(${Math.abs(hash) % 360}, 70%, 45%)`;
}

function obterRotuloDoBloco(bloco) {
  if (bloco.tipoConteudo === "atrasado" && bloco.semanaOriginal) {
    return `Atrasado - Semana ${bloco.semanaOriginal}`;
  }

  if (bloco.tipoConteudo === "atrasado_semana_atual" && bloco.diaOriginal) {
    return `Atrasado desta semana - ${bloco.diaOriginal}`;
  }

  return "";
}

function formatarTituloDoItem(item) {
  if (item.categoria === "simulado") {
    return `[Simulado] ${item.titulo}`;
  }

  if (item.categoria === "questoes") {
    return `[Questoes] ${item.titulo}`;
  }

  return item.titulo;
}

function renderizarFooterBotoes(footerElement) {
  if (!footerElement) {
    return;
  }

  footerElement.innerHTML = "";

  const acoes = document.createElement("div");
  acoes.className = "footer-actions";

  const btnEditar = document.createElement("button");
  btnEditar.id = "btnEditar";
  btnEditar.className = "btn-footer-secondary btn-edit-cron";
  btnEditar.innerText = "Editar Plano";
  btnEditar.onclick = async () => {
    await scheduleApi.runtimeSendMessage({ action: "prepare_edit_settings" });
    window.location.reload();
  };

  const btnFiltro = document.createElement("button");
  btnFiltro.className = "btn-footer-secondary btn-filter-cron";
  btnFiltro.innerText = exibirAssistidas ? "Ocultar" : "Exibir assistidas";
  btnFiltro.onclick = () => {
    exibirAssistidas = !exibirAssistidas;
    renderizarPaginaCronograma();
  };

  acoes.appendChild(btnEditar);
  acoes.appendChild(btnFiltro);
  footerElement.appendChild(acoes);
}

function renderizarPaginaCronograma() {
  const container = document.getElementById("listaEstudos");
  const tituloSemana = document.getElementById("tituloSemana");
  const nomeDiaAtivo = document.getElementById("nomeDiaAtivo");
  const footer = document.querySelector(".footer-cronograma");
  const statusContainer = document.querySelector(".status-container");
  const blocoOk = document.getElementById("statusCompleto");
  const blocoPendente = document.getElementById("statusPendente");
  const txtStatusOk = blocoOk ? blocoOk.querySelector(".status-text") : null;
  const txtHorasPendentes = document.getElementById("horasPendentes");
  const txtAulasAssistidas = document.getElementById("aulasAssistidas");

  const diaNome = TODOS_OS_DIAS[diaAtivoIndice];
  const chaveSemana = `Semana ${semanaAtiva}`;

  if (tituloSemana) {
    tituloSemana.innerText = chaveSemana;
  }

  if (nomeDiaAtivo) {
    nomeDiaAtivo.innerText = diaNome;
  }

  container.innerHTML = "";

  const dadosSemana = dadosCronogramaCompleto[chaveSemana];
  const infoDiaNoData = dadosSemana ? dadosSemana[diaNome] : null;
  const temCargaNaSemana = dadosSemana
    ? Object.values(dadosSemana).some((dia) => dia.conteudo && dia.conteudo.length > 0)
    : false;

  if (!dadosSemana || (infoDiaNoData && infoDiaNoData.tipo !== "descanso" && !temCargaNaSemana)) {
    if (statusContainer) {
      statusContainer.style.display = "none";
    }

    if (footer) {
      footer.style.display = "flex";
    }

    container.innerHTML = `
      <div style="text-align: center; margin-top: 40px; padding: 20px;">
        <h3 style="color: var(--text); font-size: 16px; margin-bottom: 12px; font-weight: 700;">
          Sem dados para esta semana
        </h3>
        <p style="font-size: 13px; color: var(--text-light); line-height: 1.6; margin: 0 auto; max-width: 260px;">
          O cronograma consegue apenas organizar o conteúdo das semanas que voce visitou.<br><br>
          Acesse a <strong>Semana ${semanaAtiva}</strong> na plataforma para liberar o conteúdo.<br><br>
          Uma vez acessado, os dados serão salvos no seu navegador para o próximo acesso.
        </p>
      </div>
    `;

    renderizarFooterBotoes(footer);
    return;
  }

  const infoDia = dadosSemana[diaNome];

  if (infoDia.tipo === "descanso") {
    if (statusContainer) {
      statusContainer.style.display = "none";
    }

    if (footer) {
      footer.style.display = "flex";
    }

    container.innerHTML = `
      <div style="text-align: center; margin-top: 50px; opacity: 0.7;">
        <h3 style="color: var(--text);">Dia de Descanso</h3>
        <p style="font-size: 14px; color: var(--text-light);">Aproveite para recarregar as energias!</p>
      </div>
    `;

    renderizarFooterBotoes(footer);
    return;
  }

  if (statusContainer) {
    statusContainer.style.display = "flex";
  }

  if (footer) {
    footer.style.display = "flex";
  }

  let totalSegundosDia = 0;
  let assistidoSegundosDia = 0;
  let totalItensDia = 0;
  let itensConcluidosDia = 0;
  let temConteudoVisivel = false;

  infoDia.conteudo.forEach((bloco) => {
    totalSegundosDia += bloco.duracao;
    assistidoSegundosDia += bloco.assistido || 0;
    totalItensDia += bloco.qtdTitulos;
    itensConcluidosDia += bloco.qtdAssistidas;

    const detalhesFiltrados = exibirAssistidas
      ? bloco.detalhes
      : bloco.detalhes.filter((item) => !item.assistida);
    const titulosFiltrados = detalhesFiltrados.map((item) => formatarTituloDoItem(item));

    if (!titulosFiltrados.length) {
      return;
    }

    temConteudoVisivel = true;

    const tempoParaExibir = exibirAssistidas
      ? bloco.duracao
      : bloco.duracao - (bloco.assistido || 0);

    const card = document.createElement("div");
    const cor = stringToColor(`${bloco.tipoConteudo}:${bloco.materia}:${bloco.semanaOriginal ?? "atual"}`);
    card.className = "dia-bloco";
    card.style.borderLeftColor = cor;

    const rotulo = obterRotuloDoBloco(bloco);

    card.innerHTML = `
      <div class="materia-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
        <div style="display: flex; flex-direction: column; gap: 4px;">
          ${rotulo ? `<span style="font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${cor};">${rotulo}</span>` : ""}
          <span class="materia-nome" style="color: ${cor}; font-weight: bold; font-size: 13px;">${bloco.materia}</span>
        </div>
        <span class="materia-tempo" style="font-size: 11px; font-weight: 600; opacity: 0.8;">${formatarTempoCurto(tempoParaExibir)}</span>
      </div>
      <div class="conteudo-lista limitado" style="font-size: 12px; line-height: 1.4; color: var(--text-light);">
        ${titulosFiltrados.join(";<br> ")}
      </div>
      <button class="btn-toggle">Ver mais</button>
    `;

    const btn = card.querySelector(".btn-toggle");
    const texto = card.querySelector(".conteudo-lista");

    if (titulosFiltrados.length <= 1) {
      btn.style.display = "none";
      texto.classList.remove("limitado");
    } else {
      btn.addEventListener("click", () => {
        const estaLimitado = texto.classList.contains("limitado");
        texto.classList.toggle("limitado", !estaLimitado);
        btn.innerText = estaLimitado ? "Ver menos" : "Ver mais";
      });
    }

    container.appendChild(card);
  });

  if (!temConteudoVisivel) {
    const mensagem =
      totalItensDia > 0 && !exibirAssistidas
        ? "Todos os itens de hoje ja foram concluidos!"
        : "Nenhum item previsto para hoje.";

    container.innerHTML = `<p style="text-align:center; margin-top:40px; opacity:0.5; font-size: 13px;">${mensagem}</p>`;
  }

  const segundosRestantes = totalSegundosDia - assistidoSegundosDia;
  renderizarFooterBotoes(footer);

  if (totalItensDia > 0 && itensConcluidosDia >= totalItensDia) {
    if (blocoOk) {
      blocoOk.style.display = "flex";
    }

    if (blocoPendente) {
      blocoPendente.style.display = "none";
    }

    if (txtStatusOk) {
      txtStatusOk.innerText = "Dia completo!";
    }
  } else {
    if (blocoOk) {
      blocoOk.style.display = "none";
    }

    if (blocoPendente) {
      blocoPendente.style.display = "flex";
    }

    if (txtHorasPendentes) {
      txtHorasPendentes.innerText = formatarTempoCurto(Math.max(segundosRestantes, 0));
    }

    if (txtAulasAssistidas) {
      txtAulasAssistidas.innerText = `${itensConcluidosDia}/${totalItensDia}`;
    }
  }
}

function configurarBotaoNavegacao(id, acaoClique, acaoSegurar) {
  const btn = document.getElementById(id);

  if (!btn) {
    return;
  }

  let timer;

  const start = (e) => {
    e.preventDefault();
    timer = setTimeout(() => {
      timer = null;
      acaoSegurar();
    }, 500);
  };

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      acaoClique();
    }
  };

  btn.addEventListener("mousedown", start);
  btn.addEventListener("mouseup", cancel);
  btn.addEventListener("touchstart", start, { passive: false });
  btn.addEventListener("touchend", cancel, { passive: false });
}

configurarBotaoNavegacao(
  "semanaAnterior",
  () => {
    if (diaAtivoIndice > 0) {
      diaAtivoIndice -= 1;
    } else if (semanaAtiva > 1) {
      semanaAtiva -= 1;
      diaAtivoIndice = 6;
    }

    renderizarPaginaCronograma();
  },
  () => {
    semanaAtiva = 1;
    diaAtivoIndice = 0;
    renderizarPaginaCronograma();
  }
);

configurarBotaoNavegacao(
  "proximaSemana",
  () => {
    const chaveAtual = `Semana ${semanaAtiva}`;

    if (!dadosCronogramaCompleto[chaveAtual]) {
      const proximaSemanaChave = `Semana ${semanaAtiva + 1}`;

      if (dadosCronogramaCompleto[proximaSemanaChave]) {
        semanaAtiva += 1;
        diaAtivoIndice = 0;
      } else {
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }

        return;
      }
    } else if (diaAtivoIndice < 6) {
      diaAtivoIndice += 1;
    } else {
      semanaAtiva += 1;
      diaAtivoIndice = 0;
    }

    renderizarPaginaCronograma();
  },
  () => {
    const numSemanas = Object.keys(dadosCronogramaCompleto).map((semana) =>
      parseInt(semana.replace("Semana ", ""), 10)
    );

    if (numSemanas.length > 0) {
      semanaAtiva = Math.max(...numSemanas) + 1;
      diaAtivoIndice = 0;
      renderizarPaginaCronograma();
    }
  }
);

function mostrarCronograma(todasAulasPorSemana, configuracoes) {
  const opcoesConteudo = obterOpcoesDeConteudo(configuracoes);

  DIAS_SEMANA_USUARIO = configuracoes.dias_da_semana || [];

  const dadosFiltrados = filtrarMaterias(
    todasAulasPorSemana,
    configuracoes.materias_selecionadas
  );

  const { dadosProcessados, backlogSemanaAtual, semanaAtualReferencia } = prepararDadosPorSemana(
    dadosFiltrados,
    opcoesConteudo
  );

  dadosCronogramaCompleto = gerarCronogramaLogica(
    DIAS_SEMANA_USUARIO,
    dadosProcessados,
    backlogSemanaAtual,
    semanaAtualReferencia,
    opcoesConteudo,
    configuracoes.aulas_por_dia,
    configuracoes.horas_de_estudo
  );

  const numSemanas = Object.keys(dadosCronogramaCompleto).map((semana) =>
    parseInt(semana.replace("Semana ", ""), 10)
  );

  semanaAtual = semanaAtualReferencia || (numSemanas.length > 0 ? Math.max(...numSemanas) : 1);
  semanaAtiva = semanaAtual;

  let indexHoje = new Date().getDay() - 1;
  if (indexHoje === -1) {
    indexHoje = 6;
  }

  diaAtivoIndice = indexHoje;

  renderizarPaginaCronograma();

  if (typeof menus !== "undefined") {
    menus.cronograma.style.display = "flex";
  }
}
