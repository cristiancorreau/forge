'use strict';

// Renderer vanilla. NO tiene acceso a Node: solo usa window.forge.runAction,
// expuesto por preload.js via contextBridge. Toda la logica vive en la CLI.

const output = document.getElementById('output');
const statusEl = document.getElementById('status');

function setStatus(kind, text) {
  statusEl.className = 'status ' + kind;
  statusEl.textContent = text;
}

function setButtonsDisabled(disabled) {
  document.querySelectorAll('button.primary, button.secondary').forEach((b) => {
    b.disabled = disabled;
  });
}

function renderResult(result) {
  const lines = [];
  if (result.args && result.args.length) {
    lines.push('$ forge ' + result.args.join(' '));
    lines.push('');
  }
  if (result.stdout) lines.push(result.stdout.trimEnd());
  if (result.stderr) {
    if (lines.length) lines.push('');
    lines.push(result.stderr.trimEnd());
  }
  if (!result.stdout && !result.stderr) {
    lines.push('(sin salida)');
  }
  output.textContent = lines.join('\n');

  if (result.ok) {
    setStatus('ok', 'Listo (exit ' + result.exitCode + ')');
  } else {
    setStatus('err', 'Error (exit ' + result.exitCode + ')');
  }
}

async function run(action, payload) {
  setButtonsDisabled(true);
  setStatus('running', 'Ejecutando...');
  output.textContent = '';
  try {
    const result = await window.forge.runAction(action, payload);
    renderResult(result);
  } catch (err) {
    setStatus('err', 'Error');
    output.textContent = String((err && err.message) || err);
  } finally {
    setButtonsDisabled(false);
  }
}

// --- Navegacion de vistas ---
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    tab.classList.add('active');
    const view = document.getElementById('view-' + tab.dataset.view);
    if (view) view.classList.add('active');
  });
});

// --- Proyecto nuevo (init --from) ---
function initFrom() {
  return document.getElementById('init-from').value.trim();
}

document.getElementById('btn-init-preview').addEventListener('click', () => {
  const from = initFrom();
  if (!from) {
    setStatus('err', 'Falta el archivo de respuestas');
    output.textContent = 'Indica la ruta del archivo --from antes de previsualizar.';
    return;
  }
  run('init', { from, dryRun: true });
});

document.getElementById('btn-init-apply').addEventListener('click', () => {
  const from = initFrom();
  if (!from) {
    setStatus('err', 'Falta el archivo de respuestas');
    output.textContent = 'Indica la ruta del archivo --from antes de crear el proyecto.';
    return;
  }
  run('init', { from });
});

// --- Adoptar (adopt) ---
document.getElementById('btn-adopt-preview').addEventListener('click', () => {
  run('adopt', { dryRun: true });
});
document.getElementById('btn-adopt-apply').addEventListener('click', () => {
  run('adopt', {});
});

// --- Diagnostico (doctor / audit) ---
document.getElementById('btn-doctor').addEventListener('click', () => {
  run('doctor', {});
});
document.getElementById('btn-audit').addEventListener('click', () => {
  run('audit', {});
});
