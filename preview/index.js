/**
 * preview/index.js
 * Este script controla a interface (UI) da extensão. Ele gerencia a navegação entre
 * as telas de carregamento, erro, configurações e a exibição do cronograma.
 */

const menus = {
    acesso_errado: document.getElementById('acesso_errado'),
    carregando: document.getElementById('carregando'),
    primeira_vez: document.getElementById('primeira_vez'),
    configuracoes: document.getElementById('configuracoes'),
    cronograma: document.getElementById('cronograma')
}

function load(tabs) {
    const urlValida = tabs[0]?.url?.includes("professorferretto.com.br");
    if (!urlValida) {
        menus.carregando.style.display = "none";
        menus.acesso_errado.style.display = "block";
        return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { action: "puxar_aulas" }, async (response) => {
        if (chrome.runtime.lastError) {
            menus.carregando.style.display = "none";
            menus.primeira_vez.style.display = "block";
            return;
        }

        if (response && response.sucesso) {
            const first_load = await chrome.storage.local.get(['weeks']);
            if (!first_load.weeks) {
                menus.carregando.style.display = "none";
                menus.primeira_vez.style.display = "block";
                return;
            }

            const data = response.conteudo;
            const get_settings = await chrome.storage.local.get(['settings']);

            if (!get_settings.settings) {
                data.materias.forEach(materia => adicionarMateria(materia));
                menus.carregando.style.display = "none";
                menus.configuracoes.style.display = "block";

                const tem_configuracoes_precarregadas = await chrome.storage.local.get(['preload_settings']);
                if (tem_configuracoes_precarregadas.preload_settings) {
                    const checkboxesMaterias = document.querySelectorAll('#materias input[type="checkbox"]');
                    const selecionadasMateria = tem_configuracoes_precarregadas.preload_settings.materias_selecionadas;

                    checkboxesMaterias.forEach(input => {
                        input.checked = selecionadasMateria.includes(input.value);
                    });

                    const checkboxesDias = document.querySelectorAll('#seletorDias input[type="checkbox"]');
                    const diasConfig = tem_configuracoes_precarregadas.preload_settings.dias_da_semana;

                    checkboxesDias.forEach(input => {
                        input.checked = diasConfig.includes(input.value);
                    });

                    document.getElementById('qtdAulas').value = Number(tem_configuracoes_precarregadas.preload_settings.aulas_por_dia);
                    document.getElementById('horasEstudo').value = Number(tem_configuracoes_precarregadas.preload_settings.horas_de_estudo);
                
                    document.getElementById('btnContinuar').innerText = "Salvar Cronograma";
                }

                document.getElementById('btnContinuar').addEventListener('click', (e) => {
                    const materias_selecionadas = Array.from(document.getElementById('materias').querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
                    const dias_selecionados = Array.from(document.getElementById('seletorDias').querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
                    const aulas_por_dia = Number(document.getElementById('qtdAulas').value);
                    const horas_de_estudo = Number(document.getElementById('horasEstudo').value);

                    if (dias_selecionados.length < 1) {
                        mostrarAlerta("Por favor, selecione pelo menos 1 de estudo.");
                        return;
                    }

                    if (materias_selecionadas.length < 1) {
                        mostrarAlerta("Selecione pelo menos 1 matéria para estudar.");
                        return;
                    }

                    const minNecessario = Math.ceil(materias_selecionadas.length / dias_selecionados.length);
                    if (aulas_por_dia < minNecessario) {
                        mostrarAlerta(`Com ${materias_selecionadas.length} matéria(s) e ${dias_selecionados.length} dia(s) de estudo, você precisa de no mínimo ${minNecessario} matérias por dia para o cronograma funcionar corretamente.`);
                        return;
                    }

                    const configs_pra_salvar = {
                        dias_da_semana: dias_selecionados,
                        materias_selecionadas: materias_selecionadas,
                        aulas_por_dia: aulas_por_dia,
                        horas_de_estudo: horas_de_estudo
                    };

                    const simulacao_cronograma = simularPrazoCronograma(data.aulas, configs_pra_salvar);
                    if (!simulacao_cronograma.cabe) {
                        mostrarAlerta(`Horas de estudos insuficiênte para terminar os estudos junto com a turma!<br><br>Aumente para ${horas_de_estudo + simulacao_cronograma.horasFaltantes} hora(s) de estudo por dia para finalizar junto com a turma.`);
                        return;
                    };

                    chrome.storage.local.set({ "settings": configs_pra_salvar }, async () => {
                        if (tem_configuracoes_precarregadas.preload_settings) await chrome.storage.local.remove(['preload_settings']);

                        menus.configuracoes.style.display = "none";
                        mostrarCronograma(data.aulas, configs_pra_salvar);
                    });
                });

                return;
            }

            menus.carregando.style.display = "none";
            mostrarCronograma(data.aulas, get_settings.settings);
        } else {
            menus.carregando.style.display = "none";
            menus.primeira_vez.style.display = "block";
        }
    });
}

window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const origem = urlParams.get('origin');

    if (origem === 'button') {
        menus.acesso_errado.style.display = "none";
        menus.carregando.style.display = "block";
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            load(tabs);
        });
    } else {
        menus.carregando.style.display = "none";
        menus.acesso_errado.style.display = "block";
    };
};