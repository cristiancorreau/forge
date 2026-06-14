// @ts-check
// SPEC-070 — webview front-end (vanilla JS, no frameworks).
// Collects form input, talks to the host via postMessage. The host owns the
// CLI; this script never decides subcommands/flags — it sends {action, payload}.
(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  // --- Validación pura (espejo de src/validation.ts) ---------------------
  const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  function validateName(name) {
    const t = (name || '').trim();
    if (t.length === 0) return { valid: false, error: 'El nombre es obligatorio.' };
    if (t.length > 64) return { valid: false, error: 'El nombre no puede superar los 64 caracteres.' };
    return { valid: true, error: '' };
  }

  function validateSlug(slug) {
    const t = (slug || '').trim();
    if (t.length === 0) return { valid: false, error: 'El slug es obligatorio.' };
    if (t.length < 2 || t.length > 48) return { valid: false, error: 'El slug debe tener entre 2 y 48 caracteres.' };
    if (!SLUG_RE.test(t)) {
      return { valid: false, error: 'Solo minúsculas, números y guiones simples (sin espacios ni guiones al inicio o final).' };
    }
    return { valid: true, error: '' };
  }

  function slugify(name) {
    return (name || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  // --- Helpers -----------------------------------------------------------
  const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const outputEl = $('output');
  const statusBadge = $('status-badge');

  // Ícono por estado para el badge tipo terminal (espejo del desktop).
  const STATUS_ICON = {
    ok: 'ic-check',
    err: 'ic-x',
    run: 'ic-loader',
  };

  function setStatus(kind, text) {
    statusBadge.className = 'badge ' + kind;
    if (!text) {
      statusBadge.textContent = '';
      return;
    }
    const iconId = STATUS_ICON[kind];
    if (iconId) {
      statusBadge.innerHTML =
        '<svg class="ic" aria-hidden="true"><use href="#' + iconId + '" /></svg>';
      statusBadge.appendChild(document.createTextNode(text));
    } else {
      statusBadge.textContent = text;
    }
  }

  function setOutput(text) {
    outputEl.textContent = text || '';
  }

  // --- Abrir terminal con el runtime (post-configuración) ----------------
  const RUNTIME_LABELS = {
    'claude-code': 'Claude Code',
    opencode: 'OpenCode',
    codex: 'Codex',
    gemini: 'Gemini CLI',
  };
  const launchSection = $('launch-actions');
  const launchTerminal = $('launch-terminal');

  function hideLaunch() {
    if (launchSection) launchSection.hidden = true;
  }

  function showLaunch(runtime) {
    if (!launchSection || !launchTerminal) return;
    launchTerminal.textContent = '';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'primary';
    b.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#ic-terminal" /></svg>';
    const label = RUNTIME_LABELS[runtime];
    b.appendChild(document.createTextNode(label ? 'Abrir terminal con ' + label : 'Abrir terminal'));
    b.addEventListener('click', () => vscode.postMessage({ type: 'openTerminal', runtime: runtime || '' }));
    launchTerminal.appendChild(b);
    launchSection.hidden = false;
  }

  function csvToArray(v) {
    return (v || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // --- Correlación de requests -------------------------------------------
  let reqCounter = 0;
  const pending = new Map();

  function request(message) {
    const requestId = 'r' + ++reqCounter;
    message.requestId = requestId;
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      vscode.postMessage(message);
    });
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || !msg.requestId) return;
    const entry = pending.get(msg.requestId);
    if (!entry) return;
    pending.delete(msg.requestId);
    if (msg.type === 'error') {
      entry.reject(new Error(msg.message));
    } else {
      entry.resolve(msg);
    }
  });

  // --- Tabs --------------------------------------------------------------
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.getAttribute('data-view');
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
      tab.classList.add('active');
      $('view-' + view).classList.add('active');
    });
  });

  // ======================================================================
  // Vista 1: Proyecto nuevo (multi-paso)
  // ======================================================================
  const nameEl = /** @type {HTMLInputElement} */ ($('name'));
  const slugEl = /** @type {HTMLInputElement} */ ($('slug'));
  let slugTouched = false;
  let currentStep = 0;
  const TOTAL_STEPS = 3;

  function validateIdentity() {
    const nameRes = validateName(nameEl.value);
    const slugRes = validateSlug(slugEl.value);
    $('name-error').textContent = nameRes.valid ? '' : nameRes.error;
    $('slug-error').textContent = slugRes.valid ? '' : slugRes.error;
    nameEl.classList.toggle('invalid', !nameRes.valid && nameEl.value.length > 0);
    slugEl.classList.toggle('invalid', !slugRes.valid && slugEl.value.length > 0);
    // Check verde en el wrap cuando el campo es válido (sistema visual ember).
    const nameWrap = nameEl.closest('.input-wrap');
    const slugWrap = slugEl.closest('.input-wrap');
    if (nameWrap) nameWrap.classList.toggle('valid', nameRes.valid && nameEl.value.length > 0);
    if (slugWrap) slugWrap.classList.toggle('valid', slugRes.valid && slugEl.value.length > 0);
    return nameRes.valid && slugRes.valid;
  }

  nameEl.addEventListener('input', () => {
    if (!slugTouched) {
      slugEl.value = slugify(nameEl.value);
    }
    validateIdentity();
  });
  slugEl.addEventListener('input', () => {
    slugTouched = true;
    validateIdentity();
  });

  function showStep(n) {
    currentStep = n;
    document.querySelectorAll('#view-new .step').forEach((s) => {
      s.classList.toggle('active', Number(s.getAttribute('data-step')) === n);
    });
    // Stepper ember: el paso actual = active, los anteriores = done.
    document.querySelectorAll('#view-new .step-node').forEach((node) => {
      const i = Number(node.getAttribute('data-dot'));
      node.classList.toggle('active', i === n);
      node.classList.toggle('done', i < n);
    });
    const counter = $('step-counter');
    if (counter) counter.textContent = 'Paso ' + (n + 1) + ' de ' + TOTAL_STEPS;
    $('new-prev').toggleAttribute('disabled', n === 0);
    const last = n === TOTAL_STEPS - 1;
    $('new-next').classList.toggle('hidden', last);
    $('new-preview').classList.toggle('hidden', !last);
    $('new-apply').classList.toggle('hidden', !last);
  }

  $('new-next').addEventListener('click', () => {
    if (currentStep === 0 && !validateIdentity()) return;
    if (currentStep < TOTAL_STEPS - 1) showStep(currentStep + 1);
  });
  $('new-prev').addEventListener('click', () => {
    if (currentStep > 0) showStep(currentStep - 1);
  });

  function collectAnswers() {
    const answers = {
      name: nameEl.value.trim(),
      slug: slugEl.value.trim(),
      type: /** @type {HTMLSelectElement} */ ($('type')).value,
      language: /** @type {HTMLSelectElement} */ ($('language')).value,
      mode: /** @type {HTMLSelectElement} */ ($('mode')).value,
      runtime: /** @type {HTMLSelectElement} */ ($('runtime-new')).value,
      testing: csvToArray(/** @type {HTMLInputElement} */ ($('testing')).value),
      skills: csvToArray(/** @type {HTMLInputElement} */ ($('skills')).value),
    };
    const frontend = /** @type {HTMLInputElement} */ ($('frontend')).value.trim();
    const backend = /** @type {HTMLInputElement} */ ($('backend')).value.trim();
    const database = /** @type {HTMLInputElement} */ ($('database')).value.trim();
    if (frontend) answers.frontend = frontend;
    if (backend) answers.backend = backend;
    if (database) answers.database = database;
    return answers;
  }

  async function runNew(dryRun) {
    if (!validateIdentity()) {
      showStep(0);
      return;
    }
    setStatus('run', dryRun ? 'previsualizando…' : 'creando…');
    setOutput('');
    hideLaunch();
    try {
      const written = await request({ type: 'writeAnswers', answers: collectAnswers() });
      const res = await request({
        type: 'run',
        action: 'runInit',
        payload: { answersFile: written.path, dryRun: !!dryRun },
      });
      renderResult(res);
      if (!dryRun && res && res.code === 0) {
        showLaunch(/** @type {HTMLSelectElement} */ ($('runtime-new')).value);
      }
    } catch (err) {
      setStatus('err', 'error');
      setOutput(String(err && err.message ? err.message : err));
    }
  }

  $('new-preview').addEventListener('click', () => runNew(true));
  $('new-apply').addEventListener('click', () => runNew(false));

  // ======================================================================
  // Vista 2: Adoptar existente
  // ======================================================================
  function adoptPayload(dryRun) {
    return {
      runtime: /** @type {HTMLSelectElement} */ ($('runtime-adopt')).value,
      mode: /** @type {HTMLSelectElement} */ ($('mode-adopt')).value,
      wiki: /** @type {HTMLInputElement} */ ($('wiki-adopt')).checked,
      dryRun: !!dryRun,
    };
  }

  async function runAdopt(dryRun) {
    setStatus('run', dryRun ? 'previsualizando…' : 'aplicando…');
    setOutput('');
    hideLaunch();
    try {
      const res = await request({ type: 'run', action: 'runAdopt', payload: adoptPayload(dryRun) });
      renderResult(res);
      if (!dryRun && res && res.code === 0) {
        showLaunch(/** @type {HTMLSelectElement} */ ($('runtime-adopt')).value);
      }
    } catch (err) {
      setStatus('err', 'error');
      setOutput(String(err && err.message ? err.message : err));
    }
  }

  $('adopt-preview').addEventListener('click', () => runAdopt(true));
  $('adopt-apply').addEventListener('click', () => runAdopt(false));

  // ======================================================================
  // Vista 3: Diagnóstico
  // ======================================================================
  $('diag-run').addEventListener('click', async () => {
    setStatus('run', 'diagnosticando…');
    setOutput('');
    $('diag-summary').classList.add('hidden');
    $('diag-list').innerHTML = '';
    try {
      const [audit, doctor] = await Promise.all([
        request({ type: 'run', action: 'runAudit', payload: {} }),
        request({ type: 'run', action: 'runDoctor', payload: {} }),
      ]);
      renderDiagnostics(audit, doctor);
    } catch (err) {
      setStatus('err', 'error');
      setOutput(String(err && err.message ? err.message : err));
    }
  });

  function renderDiagnostics(audit, doctor) {
    let parsed = null;
    try {
      parsed = JSON.parse(audit.stdout);
    } catch (_) {
      parsed = null;
    }

    const summaryEl = $('diag-summary');
    const listEl = $('diag-list');

    if (parsed && parsed.summary) {
      const s = parsed.summary;
      summaryEl.innerHTML =
        `<span class="pill">${s.ok || 0} OK</span>` +
        `<span class="pill">${s.warnings || 0} advertencias</span>` +
        `<span class="pill">${s.errors || 0} errores</span>`;
      summaryEl.classList.remove('hidden');
    }

    const issues = (parsed && Array.isArray(parsed.issues)) ? parsed.issues : [];
    for (const issue of issues) {
      const li = document.createElement('li');
      const level = issue.level === 'warn' ? 'warn' : issue.level === 'error' ? 'error' : 'ok';
      li.className = level;
      const check = document.createElement('span');
      check.className = 'check';
      check.textContent = issue.check || level;
      li.appendChild(check);
      li.appendChild(document.createTextNode(issue.message || ''));
      listEl.appendChild(li);
    }

    const errors = parsed && parsed.summary ? (parsed.summary.errors || 0) : 0;
    const ok = audit.code === 0 && doctor.code === 0 && errors === 0;
    setStatus(ok ? 'ok' : 'err', ok ? 'OK' : 'con problemas');
    setOutput(['--- doctor ---', doctor.stdout, doctor.stderr].filter(Boolean).join('\n'));
  }

  // ======================================================================
  function renderResult(res) {
    const ok = res.code === 0;
    setStatus(ok ? 'ok' : 'err', ok ? 'OK (exit 0)' : 'exit ' + res.code);
    setOutput([res.stdout, res.stderr].filter(Boolean).join('\n'));
  }

  // Init
  showStep(0);
  setStatus('run', 'listo');
  statusBadge.textContent = '';
})();
