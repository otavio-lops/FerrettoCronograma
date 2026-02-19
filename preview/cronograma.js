/**
 * preview/cronograma.js
 * O Cérebro da extensão.
 * Este script é responsável por calcular prazos, distribuir aulas pelos dias de estudo,
 * gerenciar o status de atraso e renderizar a interface final do cronograma.
 */



//Simulação de prazo do cronograma, para verificar se é humanamente possível finalizar dentro do período.
function simularPrazoCronograma(dadosPorSemana, config) {
    let segundosTotaisCarga = 0;
    const selecionadas = config.materias_selecionadas || [];

    Object.values(dadosPorSemana).forEach(semana => {
        selecionadas.forEach(matNome => {
            if (semana[matNome] && semana[matNome].aulas) {
                semana[matNome].aulas.forEach(aula => segundosTotaisCarga += aula.duracao);
            }
        });
    });

    const diasEstudoSemanas = config.dias_da_semana.length || 1;
    const segundosDisponiveisSemana = config.horas_de_estudo * 3600 * diasEstudoSemanas;
    const numSemanasNoBanco = Object.keys(dadosPorSemana).length || 1;

    const mediaNecessariaSemanal = segundosTotaisCarga / numSemanasNoBanco;
    const excedente = segundosDisponiveisSemana - mediaNecessariaSemanal;

    return {
        cabe: excedente >= 0,
        horasFaltantes: Math.ceil(Math.abs(excedente) / 3600 / diasEstudoSemanas)
    };
}

//Variáveis Globais de Controle
const TODOS_OS_DIAS = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];
let dadosCronogramaCompleto = {};
let semanaAtiva = 1;
let semanaAtual = 1;
let diaAtivoIndice = 0;
let DIAS_SEMANA_USUARIO = [];
let exibirAssistidas = false;

//Funções Auxiliares (Helpers)
function filtrarMaterias(dadosOriginais, selecionadas) {
    const filtrados = {};
    Object.keys(dadosOriginais).forEach(sem => {
        filtrados[sem] = {};
        selecionadas.forEach(mat => {
            if (dadosOriginais[sem][mat]) {
                filtrados[sem][mat] = dadosOriginais[sem][mat];
            }
        });
    });
    return filtrados;
}

function adicionarAulaAoDia(dia, aula) {
    if (!dia.blocos[aula.materia]) {
        dia.blocos[aula.materia] = {
            tempoTotal: 0,
            tempoAssistido: 0,
            aulasAssistidasContagem: 0,
            detalheAulas: []
        };
    }
    dia.blocos[aula.materia].detalheAulas.push({ titulo: aula.titulo, assistida: aula.assistida });
    dia.blocos[aula.materia].tempoTotal += aula.duracao;
    dia.segundosUsados += aula.duracao;

    if (aula.assistida) {
        dia.blocos[aula.materia].tempoAssistido += aula.duracao;
        dia.blocos[aula.materia].aulasAssistidasContagem += 1;
    }
    dia.materiasNoDia.add(aula.materia);
}

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `hsl(${Math.abs(hash) % 360}, 70%, 45%)`;
}


//Lógica de Geração Principal
function gerarCronogramaLogica(diasSelecionados, dadosFiltradosPorSemana, materiasPorDia, horasPorDia) {
    const cronogramaGeral = {};
    const semanasDisponiveis = Object.keys(dadosFiltradosPorSemana).map(Number);
    const maxSemana = semanasDisponiveis.length > 0 ? Math.max(...semanasDisponiveis) : 1;

    const limiteSegundosIdeal = horasPorDia * 3600;
    const MARGEM_TOLERANCIA = 1200;

    for (let i = 1; i <= maxSemana; i++) {
        const chaveSemana = `Semana ${i}`;
        const conteudoSemana = dadosFiltradosPorSemana[i] || {};

        let filaAulas = [];
        Object.keys(conteudoSemana).forEach(materia => {
            if (conteudoSemana[materia].aulas) {
                conteudoSemana[materia].aulas.forEach(aula => filaAulas.push({ ...aula, materia }));
            }
        });

        let estruturaSeteDias = TODOS_OS_DIAS.map(nome => ({
            nome: nome,
            segundosUsados: 0,
            materiasNoDia: new Set(),
            blocos: {},
            tipo: diasSelecionados.includes(nome) ? "estudo" : "descanso"
        }));

        let diasDeEstudo = estruturaSeteDias.filter(d => d.tipo === "estudo");

        if (filaAulas.length > 0 && diasDeEstudo.length > 0) {
            let indexAula = 0;
            for (let dia of diasDeEstudo) {
                if (indexAula >= filaAulas.length) break;
                while (indexAula < filaAulas.length) {
                    let aula = filaAulas[indexAula];
                    const jaTemMateria = dia.materiasNoDia.has(aula.materia);
                    const podeAddNovaMateria = dia.materiasNoDia.size < materiasPorDia;
                    const cabeNaTolerancia = (dia.segundosUsados + aula.duracao) <= (limiteSegundosIdeal + MARGEM_TOLERANCIA);

                    if ((jaTemMateria || podeAddNovaMateria) && cabeNaTolerancia) {
                        adicionarAulaAoDia(dia, aula);
                        indexAula++;
                        while (indexAula < filaAulas.length &&
                            filaAulas[indexAula].materia === aula.materia &&
                            (dia.segundosUsados + filaAulas[indexAula].duracao) <= (limiteSegundosIdeal + MARGEM_TOLERANCIA)) {
                            adicionarAulaAoDia(dia, filaAulas[indexAula]);
                            indexAula++;
                        }
                    } else {
                        break;
                    }
                }
            }
            while (indexAula < filaAulas.length) {
                diasDeEstudo.sort((a, b) => a.segundosUsados - b.segundosUsados);
                let diaAlvo = diasDeEstudo[0];
                let aulaPai = filaAulas[indexAula];
                adicionarAulaAoDia(diaAlvo, aulaPai);
                indexAula++;
                while (indexAula < filaAulas.length && filaAulas[indexAula].materia === aulaPai.materia) {
                    adicionarAulaAoDia(diaAlvo, filaAulas[indexAula]);
                    indexAula++;
                }
            }
        }

        cronogramaGeral[chaveSemana] = {};
        estruturaSeteDias.forEach(dia => {
            cronogramaGeral[chaveSemana][dia.nome] = {
                tipo: dia.tipo,
                conteudo: Object.entries(dia.blocos).map(([materia, info]) => ({
                    materia,
                    duracao: info.tempoTotal,
                    assistido: info.tempoAssistido,
                    qtdTitulos: info.detalheAulas.length,
                    qtdAssistidas: info.aulasAssistidasContagem,
                    detalheAulas: info.detalheAulas
                }))
            };
        });
    }
    return cronogramaGeral;
}

//Renderização
function renderizarPaginaCronograma() {
    const container = document.getElementById('listaEstudos');
    const tituloSemana = document.getElementById('tituloSemana');
    const nomeDiaAtivo = document.getElementById('nomeDiaAtivo');
    const footer = document.querySelector('.footer-cronograma');
    const statusContainer = document.querySelector('.status-container');
    const blocoOk = document.getElementById('statusCompleto');
    const blocoPendente = document.getElementById('statusPendente');
    const txtStatusOk = blocoOk ? blocoOk.querySelector('.status-text') : null;
    const txtHorasPendentes = document.getElementById('horasPendentes');
    const txtAulasAssistidas = document.getElementById('aulasAssistidas');

    const diaNome = TODOS_OS_DIAS[diaAtivoIndice];
    const chaveSemana = `Semana ${semanaAtiva}`;

    if (tituloSemana) tituloSemana.innerText = chaveSemana;
    if (nomeDiaAtivo) nomeDiaAtivo.innerText = diaNome;

    container.innerHTML = '';
    const dadosSemana = dadosCronogramaCompleto[chaveSemana];
    const infoDiaNoData = dadosSemana ? dadosSemana[diaNome] : null;

    const temCargaNaSemana = dadosSemana ? Object.values(dadosSemana).some(d => d.conteudo && d.conteudo.length > 0) : false;
    if (!dadosSemana || (infoDiaNoData && infoDiaNoData.tipo !== "descanso" && !temCargaNaSemana)) {
        if (statusContainer) statusContainer.style.display = 'none';
        if (footer) footer.style.display = 'flex';

        container.innerHTML = `
            <div style="text-align: center; margin-top: 40px; padding: 20px;">
                <div style="font-size: 40px; margin-bottom: 20px; opacity: 0.5;">📖</div>
                <h3 style="color: var(--text); font-size: 16px; margin-bottom: 12px; font-weight: 700;">
                    Sem dados para esta semana
                </h3>
                <p style="font-size: 13px; color: var(--text-light); line-height: 1.6; margin: 0 auto; max-width: 260px;">
                    O cronograma consegue apenas organizar o conteúdo das semanas que você visitou.<br><br>
                    Acesse a <strong>Semana ${semanaAtiva}</strong> na plataforma para liberar o conteúdo.<br><br>
                    Uma vez acessado, os dados serão salvos no seu navegador para o próximo acesso.
                </p>
            </div>`;

        renderizarFooterBotoes(footer);
        return;
    }

    const infoDia = dadosSemana[diaNome];
    if (infoDia.tipo === "descanso") {
        if (statusContainer) statusContainer.style.display = 'none';
        if (footer) footer.style.display = 'flex';
        container.innerHTML = `
            <div style="text-align: center; margin-top: 50px; opacity: 0.7;">
                <div style="font-size: 40px; margin-bottom: 15px;">☕</div>
                <h3 style="color: var(--text);">Dia de Descanso</h3>
                <p style="font-size: 14px; color: var(--text-light);">Aproveite para recarregar as energias!</p>
            </div>`;
        renderizarFooterBotoes(footer);
        return;
    }

    if (statusContainer) statusContainer.style.display = 'flex';
    if (footer) footer.style.display = 'flex';

    let totalSegundosDia = 0;
    let assistidoSegundosDia = 0;
    let totalAulasDia = 0;
    let assistidasContagemDia = 0;
    let temConteudoVisivel = false;

    infoDia.conteudo.forEach(bloco => {
        totalSegundosDia += bloco.duracao;
        assistidoSegundosDia += (bloco.assistido || 0);
        totalAulasDia += bloco.qtdTitulos;
        assistidasContagemDia += bloco.qtdAssistidas;

        const titulosFiltrados = exibirAssistidas
            ? bloco.detalheAulas.map(a => a.titulo)
            : bloco.detalheAulas.filter(a => !a.assistida).map(a => a.titulo);

        if (titulosFiltrados.length > 0) {
            temConteudoVisivel = true;

            const tempoParaExibir = exibirAssistidas
                ? bloco.duracao
                : (bloco.duracao - (bloco.assistido || 0));

            const h = Math.floor(tempoParaExibir / 3600);
            const m = Math.floor((tempoParaExibir % 3600) / 60);
            const tempoStr = `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`;

            const card = document.createElement('div');
            card.className = 'dia-bloco';
            const cor = stringToColor(bloco.materia);
            card.style.borderLeftColor = cor;

            card.innerHTML = `
                <div class="materia-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span class="materia-nome" style="color: ${cor}; font-weight: bold; font-size: 13px;">${bloco.materia}</span>
                    <span class="materia-tempo" style="font-size: 11px; font-weight: 600; opacity: 0.8;">${tempoStr}</span>
                </div>
                <div class="conteudo-lista limitado" style="font-size: 12px; line-height: 1.4; color: var(--text-light);">
                    ${titulosFiltrados.join(';<br> ')}
                </div>
                <button class="btn-toggle">Ver mais</button>
            `;

            const btn = card.querySelector('.btn-toggle');
            const texto = card.querySelector('.conteudo-lista');

            if (titulosFiltrados.length <= 1) {
                btn.style.display = 'none';
                texto.classList.remove('limitado');
            } else {
                btn.addEventListener('click', () => {
                    const isLim = texto.classList.contains('limitado');
                    texto.classList.toggle('limitado', !isLim);
                    btn.innerText = isLim ? 'Ver menos' : 'Ver mais';
                });
            }
            container.appendChild(card);
        }
    });

    if (!temConteudoVisivel) {
        const msg = (totalAulasDia > 0 && !exibirAssistidas)
            ? "Todas as aulas de hoje já foram assistidas! 🎉"
            : "Nenhuma aula prevista para hoje.";
        container.innerHTML = `<p style="text-align:center; margin-top:40px; opacity:0.5; font-size: 13px;">${msg}</p>`;
    }

    renderizarFooterBotoes(footer);

    const segundosRestantes = totalSegundosDia - assistidoSegundosDia;

    if (totalAulasDia > 0 && assistidasContagemDia >= totalAulasDia) {
        if (blocoOk) blocoOk.style.display = 'flex';
        if (blocoPendente) blocoPendente.style.display = 'none';
        if (txtStatusOk) txtStatusOk.innerText = "Dia completo!";
    } else {
        if (blocoOk) blocoOk.style.display = 'none';
        if (blocoPendente) blocoPendente.style.display = 'flex';

        const hP = Math.floor(segundosRestantes / 3600);
        const mP = Math.floor((segundosRestantes % 3600) / 60);

        if (txtHorasPendentes) txtHorasPendentes.innerText = `${String(hP).padStart(2, '0')}h${String(mP).padStart(2, '0')}`;
        if (txtAulasAssistidas) txtAulasAssistidas.innerText = `${assistidasContagemDia}/${totalAulasDia}`;
    }
}

function verificarAtrasosGerais() {
    let temAtraso = false;
    Object.keys(dadosCronogramaCompleto).forEach(chaveSemana => {
        const numSemana = parseInt(chaveSemana.replace("Semana ", ""));

        if (numSemana < semanaAtual) {
            const semana = dadosCronogramaCompleto[chaveSemana];
            Object.values(semana).forEach(dia => {
                dia.conteudo.forEach(bloco => {
                    if (bloco.qtdAssistidas < bloco.qtdTitulos) {
                        temAtraso = true;
                    }
                });
            });
        }
    });
    return temAtraso;
}

function abrirTelaNotificacoes() {
    const overlay = document.createElement('div');
    overlay.className = 'notif-overlay';

    let htmlConteudo = '';
    const diasPorSemana = (DIAS_SEMANA_USUARIO && DIAS_SEMANA_USUARIO.length > 0) ? DIAS_SEMANA_USUARIO.length : 1;

    Object.keys(dadosCronogramaCompleto).forEach(chaveSemana => {
        const numSemana = parseInt(chaveSemana.replace("Semana ", ""));
        
        if (numSemana < semanaAtual) {
            let segAtrasados = 0;
            const semana = dadosCronogramaCompleto[chaveSemana];
            
            Object.values(semana).forEach(dia => {
                dia.conteudo.forEach(bloco => {
                    const pendente = (bloco.duracao - (bloco.assistido || 0));
                    if (pendente > 0) segAtrasados += pendente;
                });
            });

            if (segAtrasados > 0) {
                const hT = String(Math.floor(segAtrasados / 3600)).padStart(2, '0');
                const mT = String(Math.floor((segAtrasados % 3600) / 60)).padStart(2, '0');
                const sT = String(segAtrasados % 60).padStart(2, '0');
                const tempoTotalFormatado = `${hT}h${mT}m${sT}s`;

                const segExtraDia = Math.ceil(segAtrasados / diasPorSemana);
                const hE = String(Math.floor(segExtraDia / 3600)).padStart(2, '0');
                const mE = String(Math.floor((segExtraDia % 3600) / 60)).padStart(2, '0');
                const sE = String(segExtraDia % 60).padStart(2, '0');
                const tempoExtraFormatado = `${hE}h${mE}m${sE}s`;

                htmlConteudo += `
                    <div class="card-atraso">
                        <span class="semana-label">Atraso Identificado</span>
                        <p style="margin: 10px 0 5px; font-size: 14px; color: #666;">Você tem conteúdos da <strong>${chaveSemana}</strong> atrasados.</p>
                        
                        <div class="tempo-total-box">
                            ${tempoTotalFormatado}
                        </div>

                        <div class="calc-resumo-box">
                            Baseado no seu plano de ${diasPorSemana} dias de estudo, 
                            você precisará estudar <strong>${tempoExtraFormatado}</strong> 
                            a mais por dia para compensar até o começo da próxima semana.
                        </div>
                    </div>`;
            }
        }
    });

    overlay.innerHTML = `
        <div class="notif-header">
            <h2 style="margin:0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Notificações</h2>
            <button id="fecharNotif" style="background:#eee; border:none; width:32px; height:32px; border-radius:50%; font-weight:bold; cursor:pointer;">&times;</button>
        </div>
        <div class="notif-body">
            ${htmlConteudo || `
                <div style="text-align:center; padding-top:100px;">
                    <span style="font-size:60px;">✨</span>
                    <h3 style="margin-top:20px; color:#1a1a1a;">Tudo em dia!</h3>
                    <p style="color:#666; font-size:14px;">Você não possui conteúdos atrasados.</p>
                </div>
            `}
        </div>
    `;

    document.body.appendChild(overlay);
    document.getElementById('fecharNotif').onclick = () => {
        overlay.style.transform = "translateY(100%)";
        overlay.style.transition = "transform 0.3s ease";
        setTimeout(() => document.body.removeChild(overlay), 300);
    };
}

//Monta os botões do rodapé lado a lado com classes CSS
function renderizarFooterBotoes(footerElement) {
    if (!footerElement) return;
    footerElement.innerHTML = '';

    const temAtraso = verificarAtrasosGerais();

    const btnSininho = document.createElement('button');
    btnSininho.className = `btn-notification ${temAtraso ? 'badge-alert' : ''}`;
    btnSininho.innerHTML = '🔔';
    btnSininho.style.color = 'var(--text-light)';
    btnSininho.onclick = abrirTelaNotificacoes;

    const btnEditar = document.createElement('button');
    btnEditar.className = 'btn-footer-secondary btn-edit-cron';
    btnEditar.innerText = 'Editar Plano';
    btnEditar.onclick = async () => {
        const get_settings = await chrome.storage.local.get(['settings']);
        if (!get_settings.settings) return;

        await chrome.storage.local.set({ "preload_settings": get_settings.settings });
        await chrome.storage.local.remove(['settings']);
        window.location.reload();
    };

    const btnFiltro = document.createElement('button');
    btnFiltro.className = 'btn-footer-secondary btn-filter-cron';
    btnFiltro.innerText = exibirAssistidas ? "Ocultar" : "Exibir assistidas";
    btnFiltro.onclick = () => {
        exibirAssistidas = !exibirAssistidas;
        renderizarPaginaCronograma();
    };

    footerElement.appendChild(btnSininho);
    footerElement.appendChild(btnEditar);
    footerElement.appendChild(btnFiltro);
}


//Navegação e Inicialização
function configurarBotaoNavegacao(id, acaoClique, acaoSegurar) {
    const btn = document.getElementById(id);
    if (!btn) return;
    let timer;
    const start = (e) => {
        e.preventDefault();
        timer = setTimeout(() => { timer = null; acaoSegurar(); }, 500);
    };
    const cancel = (e) => {
        if (timer) { clearTimeout(timer); timer = null; acaoClique(); }
    };
    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', cancel);
    btn.addEventListener('touchstart', start, { passive: false });
    btn.addEventListener('touchend', cancel, { passive: false });
}

configurarBotaoNavegacao('semanaAnterior',
    () => {
        if (diaAtivoIndice > 0) diaAtivoIndice--;
        else if (semanaAtiva > 1) { semanaAtiva--; diaAtivoIndice = 6; }
        renderizarPaginaCronograma();
    },
    () => { semanaAtiva = 1; diaAtivoIndice = 0; renderizarPaginaCronograma(); }
);

configurarBotaoNavegacao('proximaSemana',
    () => {
        const chaveAtual = `Semana ${semanaAtiva}`;
        if (!dadosCronogramaCompleto[chaveAtual]) {
            const proximaSemanaChave = `Semana ${semanaAtiva + 1}`;
            if (dadosCronogramaCompleto[proximaSemanaChave]) {
                semanaAtiva++; diaAtivoIndice = 0;
            } else {
                if (navigator.vibrate) navigator.vibrate(50);
                return;
            }
        }
        else {
            if (diaAtivoIndice < 6) diaAtivoIndice++;
            else { semanaAtiva++; diaAtivoIndice = 0; }
        }
        renderizarPaginaCronograma();
    },
    () => {
        const numSemanas = Object.keys(dadosCronogramaCompleto).map(s => parseInt(s.replace("Semana ", "")));
        if (numSemanas.length > 0) {
            semanaAtiva = Math.max(...numSemanas) + 1;
            diaAtivoIndice = 0;
            renderizarPaginaCronograma();
        }
    }
);

function mostrarCronograma(todas_aulas_por_semana, configuracoes) {
    DIAS_SEMANA_USUARIO = configuracoes.dias_da_semana || [];
    const dadosFiltrados = filtrarMaterias(todas_aulas_por_semana, configuracoes.materias_selecionadas);

    dadosCronogramaCompleto = gerarCronogramaLogica(
        DIAS_SEMANA_USUARIO,
        dadosFiltrados,
        configuracoes.aulas_por_dia,
        configuracoes.horas_de_estudo
    );

    const numSemanas = Object.keys(dadosCronogramaCompleto).map(s => parseInt(s.replace("Semana ", "")));
    semanaAtual = Math.max(...numSemanas);
    semanaAtiva = numSemanas.length > 0 ? Math.max(...numSemanas) : 1;

    let indexHoje = new Date().getDay() - 1;
    if (indexHoje === -1) indexHoje = 6;
    diaAtivoIndice = indexHoje;

    renderizarPaginaCronograma();
    if (typeof menus !== 'undefined') menus.cronograma.style.display = "flex";
}