/**
 * preview/funcoes.js
 * Conjunto de funções utilitárias para a interface da extensão.
 * Gerencia controles de input, criação dinâmica de elementos e navegação.
 */

const qtdAulasInput = document.getElementById("qtdAulas");
const maisAulasBtn = document.getElementById("maisAulas");
const menosAulasBtn = document.getElementById("menosAulas");

const horasEstudoInput = document.getElementById("horasEstudo");
const maisHorasBtn = document.getElementById("maisHoras");
const menosHorasBtn = document.getElementById("menosHoras");

function incrementar(input, max = Infinity) {
  let val = parseInt(input.value) || 0;
  if (val < max) input.value = val + 1;
}

function decrementar(input, min = 0) {
  let val = parseInt(input.value) || 0;
  if (val > min) input.value = val - 1;
}

maisAulasBtn.addEventListener("click", () => incrementar(qtdAulasInput, 30));
menosAulasBtn.addEventListener("click", () => decrementar(qtdAulasInput, 0));

maisHorasBtn.addEventListener("click", () => incrementar(horasEstudoInput, 24));
menosHorasBtn.addEventListener("click", () => decrementar(horasEstudoInput, 0));

// Impede digitar valor menor que 0 manualmente
[qtdAulasInput, horasEstudoInput].forEach(input => {
  input.addEventListener("input", () => {
    if (parseInt(input.value) < 0 || isNaN(parseInt(input.value))) {
      input.value = 0;
    }
  });
});

function adicionarMateria(nome) {
  const container = document.getElementById('materias');
  const label = document.createElement('label');

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.value = nome;

  label.appendChild(input);
  label.appendChild(document.createTextNode(` ${nome}`));

  container.appendChild(label);
}

const btnEditar = document.getElementById('btnEditar');
btnEditar.addEventListener('click', async () => {
  const get_settings = await chrome.storage.local.get(['settings']);
  if (!get_settings.settings) return;

  await chrome.storage.local.set({ "preload_settings": get_settings.settings });
  await chrome.storage.local.remove(['settings']);
  window.location.reload();
});

document.getElementById('btnIrParaAulas').addEventListener('click', () => {
    const urlPlataforma = "https://app.professorferretto.com.br/turmas/curso-completo?semana=0";
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.update(tabs[0].id, { url: urlPlataforma });
        window.close();
    });
});

document.getElementById('btnAtualizeAPagina').addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.reload(tabs[0].id);
    menus.primeira_vez.style.display = "none";
    menus.carregando.style.display = "block";
    setTimeout(() => {
      load(tabs);
    }, 4000);
  });
});

/**
 * Exibe um alerta personalizado com estilo moderno
 * @param {string} mensagem - O texto a ser exibido
 */
function mostrarAlerta(mensagem) {
    const modal = document.getElementById('customAlert');
    const msgParaUsuario = document.getElementById('modalMessage');
    const btnFechar = document.getElementById('modalClose');

    msgParaUsuario.innerHTML = mensagem;
    modal.style.display = 'flex';

    // Fecha ao clicar no botão
    btnFechar.onclick = () => {
        modal.style.display = 'none';
    };

    // Fecha ao clicar no fundo (overlay)
    modal.onclick = (e) => {
        if (e.target === modal) modal.style.display = 'none';
    };
}