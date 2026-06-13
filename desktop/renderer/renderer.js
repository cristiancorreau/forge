'use strict';

// Renderer vanilla. NO tiene acceso a Node: solo usa window.forge.runAction y
// window.forge.writeAnswers, expuestos por preload.js via contextBridge.
// Toda la logica de generacion vive en la CLI.

// ===== Helpers de UI: SVG inline por referencia =====
function svgUse(id, cls) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', cls || 'ic');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', '#' + id);
  svg.appendChild(use);
  return svg;
}

// ===== Panel de salida =====
const output = document.getElementById('output');
const statusEl = document.getElementById('status');
const terminalCmd = document.getElementById('terminal-cmd');

const STATUS_ICONS = {
  ok: 'ic-check',
  err: 'ic-x',
  running: 'ic-loader',
  warn: 'ic-alert-triangle',
};

function setStatus(kind, text) {
  statusEl.className = 'badge ' + kind;
  statusEl.textContent = '';
  if (!kind) return;
  if (STATUS_ICONS[kind]) statusEl.appendChild(svgUse(STATUS_ICONS[kind]));
  statusEl.appendChild(document.createTextNode(text));
}

function setButtonsDisabled(disabled) {
  document
    .querySelectorAll('button.primary, button.secondary, .option')
    .forEach((b) => {
      b.disabled = disabled;
    });
}

function appendLine(text, cls) {
  const span = document.createElement('span');
  if (cls) span.className = cls;
  span.textContent = text + '\n';
  output.appendChild(span);
}

function renderResult(result) {
  output.textContent = '';
  if (result.args && result.args.length) {
    terminalCmd.textContent = 'forge ' + result.args.join(' ');
    appendLine('$ forge ' + result.args.join(' '), 'line-cmd');
    appendLine('');
  }
  let stdout = result.stdout || '';
  // audit --json: intentar pretty-print
  if (
    result.args &&
    result.args[0] === 'audit' &&
    stdout.trim().startsWith('{')
  ) {
    try {
      stdout = JSON.stringify(JSON.parse(stdout), null, 2);
    } catch (_e) {
      /* texto plano */
    }
  }
  if (stdout) appendLine(stdout.replace(/\s+$/, ''));
  if (result.stderr) {
    if (output.childNodes.length) appendLine('');
    appendLine(result.stderr.replace(/\s+$/, ''), 'line-err');
  }
  if (!stdout && !result.stderr) appendLine('(sin salida)', 'line-empty');

  if (result.ok) setStatus('ok', 'Listo (exit ' + result.exitCode + ')');
  else setStatus('err', 'Error (exit ' + result.exitCode + ')');
}

async function run(action, payload) {
  setButtonsDisabled(true);
  setStatus('running', 'Ejecutando');
  output.textContent = '';
  try {
    const result = await window.forge.runAction(action, payload);
    renderResult(result);
    return result;
  } catch (err) {
    setStatus('err', 'Error');
    output.textContent = String((err && err.message) || err);
    return { ok: false };
  } finally {
    setButtonsDisabled(false);
  }
}

// ===== Navegacion de vistas =====
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    const view = document.getElementById('view-' + tab.dataset.view);
    if (view) view.classList.add('active');
  });
});

// ===== Slug =====
function slugify(name) {
  return (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ===== Catalogos =====
const BACKEND_BY_LANG = {
  node: [
    ['express', 'Express'],
    ['nestjs', 'NestJS'],
    ['hono-drizzle', 'Hono + Drizzle'],
  ],
  python: [
    ['fastapi', 'FastAPI'],
    ['flask', 'Flask'],
    ['django', 'Django'],
  ],
  php: [
    ['laravel', 'Laravel'],
    ['wordpress', 'WordPress'],
  ],
  ruby: [['rails', 'Rails']],
  go: [['go-gin', 'Gin']],
  java: [['springboot', 'Spring Boot']],
  rust: [['rust', 'Rust']],
};
const FRONTEND_FRAMEWORKS = [
  ['nextjs-admin', 'Next.js'],
  ['sveltekit', 'SvelteKit'],
  ['vuenuxt', 'Vue / Nuxt'],
  ['astro', 'Astro'],
];
const PM_BY_LANG = {
  node: ['npm', 'pnpm', 'yarn', 'bun'],
  typescript: ['npm', 'pnpm', 'yarn', 'bun'],
  python: ['pip', 'poetry'],
  php: ['composer'],
  rust: ['cargo'],
  go: ['go-mod'],
};
const TESTING_OPTIONS = [
  'vitest',
  'jest',
  'node-test',
  'pytest',
  'playwright',
  'phpunit',
  'rspec',
  'go-test',
];
const PROFILE_CATALOG = [
  'astro',
  'django',
  'expo',
  'express',
  'fastapi',
  'flask',
  'flutter',
  'go-gin',
  'hono-drizzle',
  'laravel',
  'nestjs',
  'nextjs-admin',
  'playwright-crawler',
  'rails',
  'rust',
  'springboot',
  'sveltekit',
  'vuenuxt',
  'wordpress',
];
const SKILL_CATALOG = ['deploy-check', 'security-review', 'wiki', 'review'];

// ===== Estado del wizard =====
const state = {
  step: 0,
  name: '',
  type: '',
  backend: null,
  frontend: null,
  database: 'none',
  orm: 'none',
  packageManager: 'npm',
  testing: [],
  mode: 'standard',
  runtime: 'claude-code',
  profiles: [],
  skills: [],
};
const TOTAL_STEPS = 7;

// ----- Construir chips multi (testing / profiles / skills) -----
function buildChips(containerId, values, selectedSet) {
  const el = document.getElementById(containerId);
  el.textContent = '';
  values.forEach((val) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option' + (selectedSet.has(val) ? ' selected' : '');
    btn.dataset.value = val;
    btn.setAttribute('role', 'checkbox');
    btn.setAttribute('aria-checked', selectedSet.has(val) ? 'true' : 'false');
    const title = document.createElement('span');
    title.className = 'opt-title';
    title.textContent = val;
    btn.appendChild(title);
    btn.appendChild(svgUse('ic-check', 'chip-check'));
    btn.addEventListener('click', () => {
      if (selectedSet.has(val)) selectedSet.delete(val);
      else selectedSet.add(val);
      btn.classList.toggle('selected');
      btn.setAttribute('aria-checked', selectedSet.has(val) ? 'true' : 'false');
    });
    el.appendChild(btn);
  });
}

const testingSet = new Set();
const profilesSet = new Set();
const skillsSet = new Set();

// ----- Single-select (option-grid radiogroup) -----
function wireRadioGrid(gridId, onSelect, current) {
  const grid = document.getElementById(gridId);
  grid.querySelectorAll('.option').forEach((opt) => {
    if (opt.dataset.value === current) {
      opt.classList.add('selected');
      opt.setAttribute('aria-checked', 'true');
    }
    opt.addEventListener('click', () => {
      grid.querySelectorAll('.option').forEach((o) => {
        o.classList.remove('selected');
        o.setAttribute('aria-checked', 'false');
      });
      opt.classList.add('selected');
      opt.setAttribute('aria-checked', 'true');
      onSelect(opt.dataset.value);
    });
    opt.addEventListener('keydown', (e) => {
      const opts = Array.from(grid.querySelectorAll('.option'));
      const i = opts.indexOf(opt);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        opts[(i + 1) % opts.length].focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        opts[(i - 1 + opts.length) % opts.length].focus();
      }
    });
  });
}

// ===== Paso 1: tipo + nombre =====
wireRadioGrid('grid-type', (v) => {
  state.type = v;
  applyTypeVisibility();
  updateNav();
});

const nameInput = document.getElementById('w-name');
const slugValue = document.getElementById('slug-value');
const nameError = document.getElementById('name-error');
const nameField = nameInput.closest('.field');
const nameWrap = nameInput.closest('.input-wrap');

function validateName() {
  const raw = nameInput.value;
  const slug = slugify(raw);
  state.name = raw.trim();
  state.slug = slug;
  slugValue.textContent = slug || '—';
  let ok = true;
  nameError.textContent = '';
  nameField.classList.remove('invalid');
  nameWrap.classList.remove('valid');
  if (raw.trim() === '') {
    ok = false;
  } else if (slug === '') {
    ok = false;
    nameError.textContent = 'El nombre debe tener letras o números.';
    nameField.classList.add('invalid');
  } else {
    nameWrap.classList.add('valid');
  }
  return ok;
}
nameInput.addEventListener('input', () => {
  validateName();
  updateNav();
});

// ===== Paso 2: stack =====
const beLang = document.getElementById('w-be-lang');
const beFw = document.getElementById('w-backend');
const feLang = document.getElementById('w-fe-lang');
const feFw = document.getElementById('w-frontend');
const mobileFw = document.getElementById('w-mobile');
const derivedProfiles = document.getElementById('derived-profiles');

function fillSelect(select, pairs, keepFirst) {
  const first = keepFirst ? select.options[0] : null;
  select.textContent = '';
  if (first) select.appendChild(first);
  pairs.forEach(([val, label]) => {
    const o = document.createElement('option');
    o.value = val;
    o.textContent = label;
    select.appendChild(o);
  });
}

beLang.addEventListener('change', () => {
  const list = BACKEND_BY_LANG[beLang.value] || [];
  fillSelect(beFw, list, true);
  refreshPackageManagers();
  recomputeStack();
});
beFw.addEventListener('change', recomputeStack);
feLang.addEventListener('change', () => {
  fillSelect(feFw, feLang.value ? FRONTEND_FRAMEWORKS : [], true);
  refreshPackageManagers();
  recomputeStack();
});
feFw.addEventListener('change', recomputeStack);
mobileFw.addEventListener('change', recomputeStack);

function recomputeStack() {
  if (state.type === 'mobile') {
    state.backend = null;
    state.frontend = mobileFw.value || null;
  } else {
    state.backend = beFw.value || null;
    state.frontend = feFw.value || null;
  }
  // Derivar profiles
  const derived = [];
  if (state.backend) derived.push(state.backend);
  if (state.frontend) derived.push(state.frontend);
  // mantener profiles del catalogo elegidos manualmente + derivados
  profilesSet.forEach((p) => {
    if (!derived.includes(p)) derived.push(p);
  });
  derivedProfiles.textContent = derived.length ? derived.join(', ') : '—';
  updateNav();
}

function applyTypeVisibility() {
  const t = state.type;
  const bBack = document.getElementById('block-backend');
  const bFront = document.getElementById('block-frontend');
  const bMobile = document.getElementById('block-mobile');
  bMobile.hidden = t !== 'mobile';
  bBack.hidden = t === 'mobile';
  bFront.hidden = t === 'mobile';
  bBack.classList.toggle('dimmed', t === 'frontend');
  bFront.classList.toggle('dimmed', t === 'backend' || t === 'cli' || t === 'library');
  recomputeStack();
}

function refreshPackageManagers() {
  const langs = new Set();
  if (beLang.value) langs.add(beLang.value);
  if (feLang.value) langs.add(feLang.value);
  let pms = [];
  langs.forEach((l) => {
    (PM_BY_LANG[l] || []).forEach((pm) => {
      if (!pms.includes(pm)) pms.push(pm);
    });
  });
  if (!pms.length) pms = ['npm', 'pnpm', 'yarn', 'bun'];
  const pmSel = document.getElementById('w-pm');
  const prev = pmSel.value;
  fillSelect(
    pmSel,
    pms.map((p) => [p, p === 'go-mod' ? 'go mod' : p]),
    false
  );
  pmSel.value = pms.includes(prev) ? prev : pms[0];
  state.packageManager = pmSel.value;
}

// ===== Paso 3: datos =====
const dbSel = document.getElementById('w-database');
const ormSel = document.getElementById('w-orm');
const pmSel = document.getElementById('w-pm');
dbSel.addEventListener('change', () => {
  state.database = dbSel.value;
  if (dbSel.value === 'none') {
    ormSel.value = 'none';
    ormSel.disabled = true;
    state.orm = 'none';
  } else {
    ormSel.disabled = false;
  }
});
ormSel.addEventListener('change', () => {
  state.orm = ormSel.value;
});
pmSel.addEventListener('change', () => {
  state.packageManager = pmSel.value;
});
buildChips('grid-testing', TESTING_OPTIONS, testingSet);

// ===== Paso 4 / 5 =====
wireRadioGrid('grid-mode', (v) => {
  state.mode = v;
}, state.mode);
wireRadioGrid('grid-runtime', (v) => {
  state.runtime = v;
}, state.runtime);

// ===== Paso 6 =====
buildChips('grid-profiles', PROFILE_CATALOG, profilesSet);
buildChips('grid-skills', SKILL_CATALOG, skillsSet);

// ===== Construir WizardResult =====
function buildResult() {
  // sincronizar sets -> arrays
  state.testing = Array.from(testingSet);
  state.skills = Array.from(skillsSet);
  // profiles: derivados + manuales
  const profiles = new Set();
  if (state.backend) profiles.add(state.backend);
  if (state.frontend) profiles.add(state.frontend);
  profilesSet.forEach((p) => profiles.add(p));
  state.profiles = Array.from(profiles);

  return {
    name: state.name,
    slug: state.slug || slugify(state.name),
    type: state.type,
    backend: state.backend,
    frontend: state.frontend,
    database: state.database,
    orm: state.orm,
    packageManager: state.packageManager,
    testing: state.testing,
    mode: state.mode,
    runtime: state.runtime,
    profiles: state.profiles,
    skills: state.skills,
  };
}

// ===== Resumen =====
function fmt(v) {
  if (v == null || v === '' || v === 'none') return null;
  if (Array.isArray(v)) return v.length ? v.join(', ') : null;
  return String(v);
}
function renderSummary() {
  const r = buildResult();
  const groups = [
    ['Identidad', [['name', r.name], ['slug', r.slug], ['type', r.type]]],
    ['Stack', [['backend', r.backend], ['frontend', r.frontend]]],
    [
      'Datos',
      [
        ['database', r.database],
        ['orm', r.orm],
        ['packageManager', r.packageManager],
        ['testing', r.testing],
      ],
    ],
    ['Config', [['mode', r.mode], ['runtime', r.runtime]]],
    ['Extras', [['profiles', r.profiles], ['skills', r.skills]]],
  ];
  const summary = document.getElementById('summary');
  summary.textContent = '';
  groups.forEach(([title, rows]) => {
    const g = document.createElement('div');
    g.className = 'summary-group';
    const h = document.createElement('h5');
    h.textContent = title;
    g.appendChild(h);
    rows.forEach(([k, val]) => {
      const row = document.createElement('div');
      row.className = 'summary-row';
      const ks = document.createElement('span');
      ks.className = 'k';
      ks.textContent = k;
      const vs = document.createElement('span');
      const f = fmt(val);
      vs.className = 'v' + (f == null ? ' empty' : '');
      vs.textContent = f == null ? '—' : f;
      row.appendChild(ks);
      row.appendChild(vs);
      g.appendChild(row);
    });
    summary.appendChild(g);
  });
  document.getElementById('answers-json').textContent = JSON.stringify(r, null, 2);
}

// ===== Copiar answers.json =====
document.getElementById('btn-copy').addEventListener('click', () => {
  const text = document.getElementById('answers-json').textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
});

// ===== Stepper / navegacion =====
const stepNodes = Array.from(document.querySelectorAll('.step-node'));
const wizardSteps = Array.from(document.querySelectorAll('.wizard-step'));
const stepCounter = document.getElementById('step-counter');
const btnBack = document.getElementById('btn-back');
const btnNext = document.getElementById('btn-next');
const btnCreate = document.getElementById('btn-create');
const btnPreview = document.getElementById('btn-preview');

function stepValid(step) {
  if (step === 0) return state.type !== '' && validateNameSilent();
  if (step === 1) {
    if (state.type === 'fullstack') return !!(state.backend || state.frontend);
    if (state.type === 'mobile') return !!state.frontend;
    if (state.type === 'backend' || state.type === 'cli' || state.type === 'library')
      return true; // framework opcional
    if (state.type === 'frontend') return true;
    return true;
  }
  return true;
}
function validateNameSilent() {
  return state.name.trim() !== '' && slugify(state.name) !== '';
}

function showStep(n) {
  state.step = n;
  wizardSteps.forEach((s) => s.classList.toggle('active', Number(s.dataset.step) === n));
  stepNodes.forEach((node, i) => {
    node.classList.toggle('active', i === n);
    node.classList.toggle('done', i < n);
  });
  stepCounter.textContent = 'Paso ' + (n + 1) + ' de ' + TOTAL_STEPS;
  btnBack.disabled = n === 0;
  const last = n === TOTAL_STEPS - 1;
  btnNext.hidden = last;
  btnCreate.hidden = !last;
  btnPreview.hidden = !last;
  if (last) renderSummary();
  updateNav();
}

function updateNav() {
  const last = state.step === TOTAL_STEPS - 1;
  if (!last) {
    btnNext.disabled = !stepValid(state.step);
    // Penultimo: el boton dice "Revisar"
    btnNext.firstChild &&
      (btnNext.childNodes[0].textContent =
        state.step === TOTAL_STEPS - 2 ? 'Revisar ' : 'Siguiente ');
  }
}

btnNext.addEventListener('click', () => {
  if (!stepValid(state.step)) {
    if (state.step === 0) {
      validateName();
      if (state.type === '') {
        nameError.textContent = nameError.textContent || 'Elige un tipo de proyecto.';
      }
    }
    return;
  }
  if (state.step < TOTAL_STEPS - 1) showStep(state.step + 1);
});
btnBack.addEventListener('click', () => {
  if (state.step > 0) showStep(state.step - 1);
});
stepNodes.forEach((node, i) => {
  node.addEventListener('click', () => {
    if (i < state.step) showStep(i);
  });
});

// ===== Crear / Previsualizar via writeAnswers + init --from =====
async function runWizardInit(dryRun) {
  const answers = buildResult();
  setButtonsDisabled(true);
  setStatus('running', 'Ejecutando');
  output.textContent = '';
  let file;
  try {
    const res = await window.forge.writeAnswers(answers);
    if (!res || !res.ok) {
      setStatus('err', 'Error');
      output.textContent =
        'No se pudo escribir el archivo de respuestas. ' +
        ((res && res.error) || '');
      setButtonsDisabled(false);
      return;
    }
    file = res.file;
  } catch (err) {
    setStatus('err', 'Error');
    output.textContent = String((err && err.message) || err);
    setButtonsDisabled(false);
    return;
  }
  setButtonsDisabled(false);
  const payload = { from: file };
  if (dryRun) payload.dryRun = true;
  await run('init', payload);
}

btnCreate.addEventListener('click', () => runWizardInit(false));
btnPreview.addEventListener('click', () => runWizardInit(true));

// ===== Modo avanzado (answers.json manual) =====
function initFrom() {
  return document.getElementById('init-from').value.trim();
}
document.getElementById('btn-init-preview').addEventListener('click', () => {
  const from = initFrom();
  if (!from) {
    setStatus('err', 'Falta el archivo');
    output.textContent = 'Indica la ruta del archivo --from antes de previsualizar.';
    return;
  }
  run('init', { from, dryRun: true });
});
document.getElementById('btn-init-apply').addEventListener('click', () => {
  const from = initFrom();
  if (!from) {
    setStatus('err', 'Falta el archivo');
    output.textContent = 'Indica la ruta del archivo --from antes de crear el proyecto.';
    return;
  }
  run('init', { from });
});

// ===== Adoptar =====
document.getElementById('btn-adopt-preview').addEventListener('click', () => {
  run('adopt', { dryRun: true });
});
document.getElementById('btn-adopt-apply').addEventListener('click', () => {
  run('adopt', {});
});

// ===== Diagnostico =====
document.getElementById('btn-doctor').addEventListener('click', () => {
  run('doctor', {});
});
document.getElementById('btn-audit').addEventListener('click', () => {
  run('audit', {});
});

// ===== Init =====
const versionChip = document.getElementById('version-chip');
if (versionChip && window.forge && window.forge.appVersion) {
  versionChip.textContent = 'v' + window.forge.appVersion;
}
applyTypeVisibility();
refreshPackageManagers();
showStep(0);
