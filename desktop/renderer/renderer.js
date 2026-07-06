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
  hideLaunch();
  try {
    // Toda accion corre en la carpeta elegida por el usuario, nunca en el
    // cwd del proceso Electron (que desde Finder es '/').
    const p = Object.assign({}, payload);
    if (projectDir && !p.cwd) p.cwd = projectDir;
    const result = await window.forge.runAction(action, p);
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

// ===== Carpeta del proyecto (compartida por las tres vistas) =====
let projectDir = '';

function renderDirDisplays() {
  document.querySelectorAll('[data-dir-display]').forEach((el) => {
    el.textContent = projectDir || '—';
  });
}

async function loadDefaultDir() {
  try {
    const r = await window.forge.defaultDir();
    projectDir = (r && r.dir) || '';
  } catch (_e) {
    /* sin default: el usuario puede elegir con el picker */
  }
  renderDirDisplays();
}

document.querySelectorAll('.btn-pick-dir').forEach((btn) => {
  btn.addEventListener('click', async () => {
    try {
      const r = await window.forge.pickDir(projectDir);
      if (r && r.ok && r.dir) {
        projectDir = r.dir;
        renderDirDisplays();
      }
    } catch (_e) {
      /* picker cancelado o no disponible */
    }
  });
});

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
// Catalogo real de skills: etiqueta, descripcion corta y si es recomendada.
const SKILL_CATALOG = [
  { value: 'spec', label: 'spec', desc: 'Redacta specs siguiendo la plantilla forge.', recommended: true },
  { value: 'new-feature', label: 'new-feature', desc: 'Checklist de feature de plan a deploy.', recommended: true },
  { value: 'security-audit', label: 'security-audit', desc: 'Checklist de seguridad de endpoints y auth.', recommended: true },
  { value: 'onboard', label: 'onboard', desc: 'Analiza y documenta un repo existente.', recommended: false },
  { value: 'local2prod', label: 'local2prod', desc: 'Deploy a prod hasta READY/SUCCESS.', recommended: false },
  { value: 'db-migrate', label: 'db-migrate', desc: 'Migración segura de base de datos.', recommended: false },
  { value: 'browser-test', label: 'browser-test', desc: 'Verifica UI en navegador.', recommended: false },
  { value: 'phase-kickoff', label: 'phase-kickoff', desc: 'Arranque de fase/sprint.', recommended: false },
  { value: 'wiki-ingest', label: 'wiki-ingest', desc: 'Ingesta conocimiento al wiki del proyecto.', recommended: false },
  { value: 'wiki-query', label: 'wiki-query', desc: 'Responde citando el wiki.', recommended: false },
];
const RECOMMENDED_SKILLS = SKILL_CATALOG.filter((s) => s.recommended).map((s) => s.value);

// ===== Agentes: Tier 1 por modo, explicaciones y mapa de Tier 2 =====
function defaultAgentsForMode(mode) {
  const startup = ['orchestrator', 'backend-engineer', 'frontend-engineer'];
  const standard = startup.concat(['test-engineer', 'docs-writer']);
  const enterprise = standard.concat(['compliance-reviewer', 'security-auditor']);
  if (mode === 'minimal' || mode === 'startup') return startup;
  if (mode === 'enterprise') return enterprise;
  return standard; // standard (default)
}
const AGENT_EXPLAIN = {
  orchestrator: 'coordina el equipo y delega cada tarea al agente correcto.',
  'backend-engineer': 'endpoints, lógica de negocio y base de datos.',
  'frontend-engineer': 'UI, componentes e integración con la API.',
  'test-engineer': 'tests unitarios, de integración y E2E.',
  'docs-writer': 'documentación, specs y ADRs.',
  'compliance-reviewer': 'revisa GDPR/LGPD/CCPA con poder de veto.',
  'security-auditor': 'auditoría de vulnerabilidades.',
};
// Mapa de profile -> agentes Tier 2 del stack.
const TIER2_BY_PROFILE = {
  'nextjs-admin': ['admin-engineer'],
  laravel: ['api-engineer', 'fullstack-engineer', 'migration-specialist', 'laravel-specialist', 'laravel-test-engineer'],
  rails: ['fullstack-engineer'],
  fastapi: ['api-engineer'],
  express: ['api-engineer'],
  'hono-drizzle': ['api-engineer'],
  nestjs: ['api-engineer'],
  'go-gin': ['api-engineer'],
  springboot: ['api-engineer'],
  flask: ['api-engineer'],
  rust: ['api-engineer'],
  django: ['api-engineer'],
  expo: ['mobile-engineer'],
  flutter: ['mobile-engineer'],
  astro: ['frontend-engineer'],
  sveltekit: ['frontend-engineer'],
  vuenuxt: ['frontend-engineer'],
  wordpress: ['wp-engineer', 'divi-engineer', 'elementor-engineer'],
  'playwright-crawler': ['scanner-engineer'],
};

// Framework -> id de profile de forge (mismo PROFILE_MAP que usa la CLI),
// para valores que llegan como nombre de framework. Los <select> del wizard
// ya usan ids de profile directamente ('hono-drizzle', 'nextjs-admin', …):
// eso lo resuelve profileFor(), que acepta ambas formas.
const FRAMEWORK_TO_PROFILE = {
  hono: 'hono-drizzle',
  nextjs: 'nextjs-admin',
  astro: 'astro',
  fastapi: 'fastapi',
  rails: 'rails',
  laravel: 'laravel',
  expo: 'expo',
  springboot: 'springboot',
  flutter: 'flutter',
  flask: 'flask',
  axum: 'rust',
  actix: 'rust',
  rocket: 'rust',
};

// Deriva el profile de un valor de framework del wizard. Acepta el id de
// profile directo (valores de los <select>) o el nombre de framework
// ('hono', 'nextjs'…). Devuelve null si no mapea, igual que `forge init`
// (no todo framework tiene profile).
function profileFor(fw) {
  if (!fw) return null;
  if (PROFILE_CATALOG.includes(fw)) return fw;
  return FRAMEWORK_TO_PROFILE[fw] || null;
}

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
// Cada item puede ser un string o un objeto { value, label, desc, recommended }.
function buildChips(containerId, values, selectedSet) {
  const el = document.getElementById(containerId);
  el.textContent = '';
  values.forEach((item) => {
    const isObj = item && typeof item === 'object';
    const val = isObj ? item.value : item;
    const label = isObj ? item.label || item.value : item;
    const desc = isObj ? item.desc : null;
    const recommended = isObj ? !!item.recommended : false;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'option' +
      (desc ? ' has-desc' : '') +
      (selectedSet.has(val) ? ' selected' : '');
    btn.dataset.value = val;
    btn.setAttribute('role', 'checkbox');
    btn.setAttribute('aria-checked', selectedSet.has(val) ? 'true' : 'false');

    const title = document.createElement('span');
    title.className = 'opt-title';
    title.textContent = label;
    if (recommended) {
      const rb = document.createElement('span');
      rb.className = 'badge-amber';
      rb.textContent = 'Recomendada';
      title.appendChild(rb);
    }
    btn.appendChild(title);
    if (desc) {
      const sub = document.createElement('span');
      sub.className = 'opt-sub';
      sub.textContent = desc;
      btn.appendChild(sub);
    }
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
  // Derivar profiles: valor del select (id de profile) o framework -> profile.
  const derived = [];
  const pBack = profileFor(state.backend);
  const pFront = profileFor(state.frontend);
  if (pBack && !derived.includes(pBack)) derived.push(pBack);
  if (pFront && !derived.includes(pFront)) derived.push(pFront);
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
// Pre-seleccionar las skills recomendadas por default.
RECOMMENDED_SKILLS.forEach((s) => skillsSet.add(s));
buildChips('grid-skills', SKILL_CATALOG, skillsSet);

// ===== Construir WizardResult =====
function buildResult() {
  // sincronizar sets -> arrays
  state.testing = Array.from(testingSet);
  state.skills = Array.from(skillsSet);
  // profiles: derivados (id de profile o framework -> profile) + manuales
  const profiles = new Set();
  const pBack = profileFor(state.backend);
  const pFront = profileFor(state.frontend);
  if (pBack) profiles.add(pBack);
  if (pFront) profiles.add(pFront);
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

// ===== Equipo de agentes (resumen) =====
// Calcula el equipo a partir del modo y los profiles derivados.
// Devuelve [{ name, tier, why }] deduplicado (Tier 1 gana al colisionar).
function computeAgents(mode, profiles) {
  const tier1 = defaultAgentsForMode(mode);
  const seen = new Set();
  const team = [];
  tier1.forEach((name) => {
    if (seen.has(name)) return;
    seen.add(name);
    team.push({ name, tier: 1, why: AGENT_EXPLAIN[name] || '' });
  });
  (profiles || []).forEach((profile) => {
    const agents = TIER2_BY_PROFILE[profile] || [];
    agents.forEach((name) => {
      if (seen.has(name)) return; // ya esta como Tier 1 u otro Tier 2
      seen.add(name);
      team.push({
        name,
        tier: 2,
        why: AGENT_EXPLAIN[name] || ('especialista del stack ' + profile + '.'),
      });
    });
  });
  return team;
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
  renderAgentsSection(r);
  document.getElementById('answers-json').textContent = JSON.stringify(r, null, 2);
}

// ----- Seccion "Agentes que se crearan" dentro del resumen -----
function renderAgentsSection(r) {
  const host = document.getElementById('summary-agents');
  if (!host) return;
  host.textContent = '';

  const intro = document.createElement('p');
  intro.className = 'agents-intro';
  intro.textContent =
    'En vez de un prompt genérico, Forge AI instala un equipo de agentes con roles claros y reglas por dominio.';
  host.appendChild(intro);

  const team = computeAgents(r.mode, r.profiles);
  const list = document.createElement('div');
  list.className = 'agents-list';
  team.forEach((agent) => {
    const row = document.createElement('div');
    row.className = 'agent-row';

    const head = document.createElement('div');
    head.className = 'agent-head';
    const name = document.createElement('span');
    name.className = 'agent-name';
    name.textContent = agent.name;
    const tier = document.createElement('span');
    tier.className = 'agent-tier tier-' + agent.tier;
    tier.textContent = 'Tier ' + agent.tier;
    head.appendChild(name);
    head.appendChild(tier);

    const why = document.createElement('span');
    why.className = 'agent-why';
    why.textContent = agent.why;

    row.appendChild(head);
    row.appendChild(why);
    list.appendChild(row);
  });
  host.appendChild(list);

  const note = document.createElement('p');
  note.className = 'agents-note';
  note.textContent =
    'Tier 1 = equipo universal (sirve a cualquier stack). Tier 2 = especialistas del framework elegido. Tier 3 = agentes de dominio que agregas después.';
  host.appendChild(note);
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
  const res = await run('init', payload);
  if (!dryRun && res && res.ok) showLaunch(state.runtime);
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
document.getElementById('btn-init-apply').addEventListener('click', async () => {
  const from = initFrom();
  if (!from) {
    setStatus('err', 'Falta el archivo');
    output.textContent = 'Indica la ruta del archivo --from antes de crear el proyecto.';
    return;
  }
  const res = await run('init', { from });
  if (res && res.ok) showLaunch(state.runtime || '');
});

// ===== Adoptar =====
// Chips de deteccion: se llenan parseando el box "Proyecto detectado" que
// imprime `forge adopt` (lineas "Clave: valor"; el output llega sin ANSI
// porque la CLI corre con stdout pipe, pero se limpia igual por robustez).
const DETECT_KEYS = new Set([
  'Proyecto', 'Tipo', 'Lenguaje', 'Ecosistema', 'Backend', 'Frontend',
  'Mobile', 'Datos', 'Testing', 'Package manager',
]);

function renderDetectChips(stdout) {
  const host = document.getElementById('detect-chips');
  if (!host) return;
  const clean = String(stdout || '').replace(/\x1b\[[0-9;]*m/g, '');
  const chips = [];
  clean.split('\n').forEach((line) => {
    const l = line.replace(/[│┃┆┇┊┋╎╏|┌┐└┘─━╭╮╰╯]/g, ' ').trim();
    // Una linea del box puede traer varios pares separados por 2+ espacios:
    // "Tipo: fullstack   Lenguaje: TypeScript   Ecosistema: node"
    l.split(/\s{2,}/).forEach((frag) => {
      const m = frag.match(/^([A-Za-zÁÉÍÓÚáéíóúñ ]+):\s*(.+)$/);
      if (m && DETECT_KEYS.has(m[1].trim())) {
        const v = m[2].trim();
        if (v && v !== '—') chips.push([m[1].trim(), v]);
      }
    });
  });
  host.textContent = '';
  if (!chips.length) {
    const s = document.createElement('span');
    s.className = 'detect-empty';
    s.textContent = 'Sin datos de detección en la última salida.';
    host.appendChild(s);
    return;
  }
  chips.forEach(([k, v]) => {
    const c = document.createElement('span');
    c.className = 'detect-chip';
    const ks = document.createElement('strong');
    ks.textContent = k + ': ';
    c.appendChild(ks);
    c.appendChild(document.createTextNode(v));
    host.appendChild(c);
  });
}

document.getElementById('btn-adopt-preview').addEventListener('click', async () => {
  const res = await run('adopt', { dryRun: true });
  if (res) renderDetectChips(res.stdout || '');
});
document.getElementById('btn-adopt-apply').addEventListener('click', async () => {
  const res = await run('adopt', {});
  if (res) renderDetectChips(res.stdout || '');
  if (res && res.ok) showLaunch('claude-code');
});

// ===== Diagnostico =====
document.getElementById('btn-doctor').addEventListener('click', () => {
  run('doctor', {});
});
document.getElementById('btn-audit').addEventListener('click', () => {
  run('audit', {});
});

// ===== Abrir proyecto (post-configuracion) =====
const RUNTIME_LABELS = {
  'claude-code': 'Claude Code',
  opencode: 'OpenCode',
  codex: 'Codex',
  gemini: 'Gemini CLI',
};
let detectedTools = { editors: [], runtimes: {}, platform: '' };
const launchSection = document.getElementById('launch-actions');
const launchEditors = document.getElementById('launch-editors');
const launchTerminal = document.getElementById('launch-terminal');

async function loadTools() {
  try {
    if (window.forge && window.forge.detectTools) detectedTools = await window.forge.detectTools();
  } catch (_e) {
    /* sin deteccion: la tarjeta igual ofrece "abrir terminal" */
  }
}

function hideLaunch() {
  if (launchSection) launchSection.hidden = true;
}

function showLaunch(runtime) {
  if (!launchSection) return;
  // Editores instalados
  launchEditors.textContent = '';
  if (detectedTools.editors && detectedTools.editors.length) {
    detectedTools.editors.forEach((ed) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'secondary';
      b.appendChild(svgUse('ic-box', 'ic'));
      b.appendChild(document.createTextNode('Abrir en ' + ed.label));
      b.addEventListener('click', () => window.forge.openEditor(ed.id, projectDir));
      launchEditors.appendChild(b);
    });
  } else {
    const span = document.createElement('span');
    span.className = 'launch-empty';
    span.textContent = 'No detectamos editores con CLI en el PATH (code, cursor, windsurf…).';
    launchEditors.appendChild(span);
  }
  // Terminal con el runtime configurado
  launchTerminal.textContent = '';
  const tb = document.createElement('button');
  tb.type = 'button';
  tb.className = 'primary';
  tb.appendChild(svgUse('ic-terminal', 'ic'));
  const rtLabel = RUNTIME_LABELS[runtime];
  const installed = runtime && detectedTools.runtimes && detectedTools.runtimes[runtime];
  tb.appendChild(document.createTextNode(rtLabel ? 'Abrir terminal con ' + rtLabel : 'Abrir terminal'));
  tb.addEventListener('click', () => window.forge.openTerminal(runtime || '', projectDir));
  launchTerminal.appendChild(tb);
  if (rtLabel && !installed) {
    const hint = document.createElement('span');
    hint.className = 'launch-empty';
    hint.textContent = rtLabel + ' no parece instalado; la terminal abrirá igual en la carpeta del proyecto.';
    launchTerminal.appendChild(hint);
  }
  launchSection.hidden = false;
}

// ===== Init =====
const versionChip = document.getElementById('version-chip');
if (versionChip && window.forge && window.forge.appVersion) {
  versionChip.textContent = 'v' + window.forge.appVersion;
}
loadTools();
loadDefaultDir();
applyTypeVisibility();
refreshPackageManagers();
showStep(0);
