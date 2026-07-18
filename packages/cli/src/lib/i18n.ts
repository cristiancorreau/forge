/**
 * Minimal i18n for the forge CLI — Spanish + English.
 *
 * Language resolution (first match wins):
 *   1. --lang <es|en> / --lang=es flag
 *   2. FORGE_LANG env (es* / en*)
 *   3. system locale (LC_ALL / LC_MESSAGES / LANG starting with "es" → es)
 *   4. default: en
 *
 * cli.ts resolves once at startup, stores the choice in FORGE_LANG (so a Bun
 * relaunch of the TUI inherits it), and every surface reads it via t().
 */
export type Lang = 'es' | 'en';

let current: Lang = 'en';

export function resolveLang(argv: readonly string[] = process.argv): Lang {
  const i = argv.indexOf('--lang');
  if (i >= 0) {
    const v = argv[i + 1];
    if (v === 'es' || v === 'en') return v;
  }
  const eq = argv.find(a => a.startsWith('--lang='));
  if (eq) {
    const v = eq.slice('--lang='.length);
    if (v === 'es' || v === 'en') return v;
  }
  const env = (process.env.FORGE_LANG || '').toLowerCase();
  if (env.startsWith('es')) return 'es';
  if (env.startsWith('en')) return 'en';
  const loc = (process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '').toLowerCase();
  if (loc.startsWith('es')) return 'es';
  return 'en';
}

export function setLang(l: Lang): void { current = l; }
export function getLang(): Lang { return current; }

/** Translate `key` for the active language, interpolating `{var}` placeholders. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const table = MESSAGES[current] ?? MESSAGES.en;
  let s = table[key] ?? MESSAGES.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(String(v));
  return s;
}

const HELP_EN = `Forge AI v{version} — Agentic development framework for AI coding agents

Usage: forge <command> [options]

Setup
  panel          Open the interactive panel (config, monitor, skills, hooks, templates)
  init           Initialize forge (wizard, or --from answers.json for non-interactive/GUI/CI)
  adopt          Onboard forge into an EXISTING codebase (analyze + auto-wiki)
  add            Install a skill from an external source (security pipeline, opt-in network)
  generate       Generate runtime config files from project.yaml
  port           Port the project to another runtime + report how much config carries over
  update         Update managed files to the bundled catalog (--dry-run, --force)
  migrate        Migrate project.yaml from the v1 schema to v2 (--dry-run, --backup)
  scaffold       Scaffold a new agent: Tier 2 profile, or Tier 3 domain agent (--tier 3)
  teardown       Cleanly uninstall forge from a project (manifest-driven)

Inspect
  recommend      Stack-aware advisor: best catalog items for THIS project (--apply to install)
  analyze        Analyze an existing codebase (stack, hotspots, TODOs) — base for the /onboard skill
  spec-probe     Probe a spec for verifiability (acceptance checklist, resolved status) — offline gate
  audit          Audit project against the forge standard
  export         Emit the project's resolved model (agents, skills, MCP) — stable --json
  validate       Validate project.yaml schema (exit 1 on error, CI-safe)
  doctor         Check environment, installed runtimes and project.yaml completeness
  skills         List available forge skills grouped by category
  aitmpl-search  Search the unified offline catalog (skills, profiles, MCP servers, frameworks)

Workflow
  session-start  Open a work session (prints the /session-start skill steps)
  session-close  Close a work session (prints the /session-close skill steps)

Knowledge
  wiki           Manage the project knowledge base (status | ingest | query | lint)
  mcp            Run forge's MCP server (stdio, opt-in): live guardrail_status + wiki_search

Options:
  --lang <es|en>  Interface language (also FORGE_LANG; defaults to your locale)
  -v, --version   Show version
  -h, --help      Show this help

Run forge <command> --help for command-specific options.

Examples:
  npx @cristiancorreau/forge init
  npx @cristiancorreau/forge adopt ./my-existing-repo --yes
  npx @cristiancorreau/forge panel
  npx @cristiancorreau/forge skills
  npx @cristiancorreau/forge migrate --dry-run
  npx @cristiancorreau/forge wiki status
  npx @cristiancorreau/forge doctor
`;

const HELP_ES = `Forge AI v{version} — Framework de desarrollo agéntico para agentes de IA

Uso: forge <comando> [opciones]

Setup
  panel          Abre el panel interactivo (config, monitor, skills, hooks, templates)
  init           Inicializa forge (wizard, o --from answers.json para modo no-interactivo/GUI/CI)
  adopt          Incorpora forge a un codebase EXISTENTE (análisis + auto-wiki)
  add            Instala un skill desde una fuente externa (pipeline de seguridad, red opt-in)
  generate       Genera los archivos de config nativos de cada runtime desde project.yaml
  port           Porta el proyecto a otro runtime + reporta cuánta config se conserva
  update         Actualiza los archivos gestionados al catálogo bundleado (--dry-run, --force)
  migrate        Migra project.yaml del schema v1 al v2 (--dry-run, --backup)
  scaffold       Genera un agente nuevo: profile Tier 2, o agente de dominio Tier 3 (--tier 3)
  teardown       Desinstala forge del proyecto de forma limpia (vía manifest)

Inspección
  recommend      Advisor según el stack: mejores items del catálogo para ESTE proyecto (--apply instala)
  analyze        Analiza un repo existente (stack, hotspots, TODOs) — base para el skill /onboard
  spec-probe     Evalúa si una spec es verificable (checklist de criterios, estado resuelto) — gate offline
  audit          Audita el proyecto contra el estándar forge
  export         Emite el modelo resuelto del proyecto (agentes, skills, MCP) — --json estable
  validate       Valida el schema de project.yaml (exit 1 si falla, apto CI)
  doctor         Verifica el entorno, runtimes instalados y completitud de project.yaml
  skills         Lista los skills de forge agrupados por categoría
  aitmpl-search  Busca en el catálogo offline unificado (skills, profiles, MCP servers, frameworks)

Flujo
  session-start  Abre una sesión de trabajo (imprime los pasos del skill /session-start)
  session-close  Cierra una sesión de trabajo (imprime los pasos del skill /session-close)

Conocimiento
  wiki           Gestiona la base de conocimiento del proyecto (status | ingest | query | lint)
  mcp            Levanta el servidor MCP de forge (stdio, opt-in): guardrail_status + wiki_search

Opciones:
  --lang <es|en>  Idioma de la interfaz (también FORGE_LANG; por defecto, tu locale)
  -v, --version   Muestra la versión
  -h, --help      Muestra esta ayuda

Corré forge <comando> --help para opciones específicas del comando.

Ejemplos:
  npx @cristiancorreau/forge init
  npx @cristiancorreau/forge adopt ./mi-repo --yes
  npx @cristiancorreau/forge panel
  npx @cristiancorreau/forge skills
  npx @cristiancorreau/forge migrate --dry-run
  npx @cristiancorreau/forge wiki status
  npx @cristiancorreau/forge doctor
`;

const MESSAGES: Record<Lang, Record<string, string>> = {
  en: {
    'help.full': HELP_EN,
    'header.tagline': 'Forge AI — configure any project for AI agents',
    'panel.title': ' Sections ',
    'panel.footer': '[↑↓] Section   [Tab] Focus input/list/nav   [Enter] Install (Catalog)   [q/Esc] Quit',
    'panel.footer.nav': '[↑↓] Section   [Tab] Focus   [Enter] Open   [:] Palette   [?] Help   [q/Esc] Quit',
    'panel.footer.filter': '[Type] Filter   [Tab] Move to list   [Esc] Back to nav',
    'panel.footer.palette': '[Type] Filter commands   [Enter] Run   [Esc] Close palette',
    'panel.footer.log': '[Esc] Close log',
    'panel.help.title': ' Key Bindings ',
    'panel.help.close': '[?] or [Esc] to close',
    'panel.sec.config': 'Configuration', 'panel.sec.config.desc': 'project.yaml overview',
    'panel.sec.monitor': 'Monitoring', 'panel.sec.monitor.desc': 'audit + doctor',
    'panel.sec.skills': 'Skills', 'panel.sec.skills.desc': 'catalog skills',
    'panel.sec.catalog': 'Catalog', 'panel.sec.catalog.desc': 'search & install',
    'panel.sec.hooks': 'Hooks', 'panel.sec.hooks.desc': 'installed + registry',
    'panel.sec.templates': 'Templates', 'panel.sec.templates.desc': 'wiki / spec / modes',
    'panel.log.running': 'Running…',
    'panel.log.done': '✓ done',
    'panel.log.error': '✗ error',
    'panel.log.delegate': 'Run in your shell: {cmd}',
    'panel.log.needs-apply': 'Dry-run→apply coming in v2. Run in your shell: {cmd}',
    'panel.palette.title': ' Command Palette ',
    'panel.palette.placeholder': 'Type a command… (e.g. audit, rcm, doc)',
    'panel.footer.filter.list': '[/] Filter   [i] Install selected   [Esc] Back to nav',
    'panel.filter.placeholder': 'Filter…',
    'panel.install.ok': '✓ Installed: {label}',
    'panel.install.fail': '✗ Failed: {msg}',
    'panel.install.already': '{label} is already installed.',
    'panel.sec.home': 'Home', 'panel.sec.home.desc': 'project status + next action',
    'panel.home.state.empty': 'No project configured',
    'panel.home.state.brownfield': 'Existing project — forge not configured',
    'panel.home.state.configured': 'Configured — no skills active',
    'panel.home.state.healthy': 'Healthy',
    'panel.home.state.needs-attention': 'Needs attention',
    'panel.home.next': 'Suggested next action',
    'panel.home.action.init': 'forge init — initialize forge in this project',
    'panel.home.action.adopt': 'forge adopt — onboard forge into this codebase',
    'panel.home.action.recommend': 'forge recommend — get skill recommendations',
    'panel.home.action.audit': 'forge audit — run a project audit',
    'panel.home.action.doctor': 'forge doctor — diagnose environment issues',
    'panel.home.pulse': 'Project pulse',
    'panel.home.loading': 'Loading audit…',
  },
  es: {
    'help.full': HELP_ES,
    'header.tagline': 'Forge AI — configura cualquier proyecto para agentes de IA',
    'panel.title': ' Secciones ',
    'panel.footer': '[↑↓] Sección   [Tab] Foco input/lista/nav   [Enter] Instalar (Catálogo)   [q/Esc] Salir',
    'panel.footer.nav': '[↑↓] Sección   [Tab] Foco   [Enter] Abrir   [:] Palette   [?] Ayuda   [q/Esc] Salir',
    'panel.footer.filter': '[Escribir] Filtrar   [Tab] Ir a lista   [Esc] Volver al nav',
    'panel.footer.palette': '[Escribir] Filtrar comandos   [Enter] Ejecutar   [Esc] Cerrar palette',
    'panel.footer.log': '[Esc] Cerrar log',
    'panel.help.title': ' Atajos de teclado ',
    'panel.help.close': '[?] o [Esc] para cerrar',
    'panel.sec.config': 'Configuración', 'panel.sec.config.desc': 'resumen del project.yaml',
    'panel.sec.monitor': 'Monitoreo', 'panel.sec.monitor.desc': 'audit + doctor',
    'panel.sec.skills': 'Skills', 'panel.sec.skills.desc': 'skills del catálogo',
    'panel.sec.catalog': 'Catálogo', 'panel.sec.catalog.desc': 'buscar e instalar',
    'panel.sec.hooks': 'Hooks', 'panel.sec.hooks.desc': 'instalados + registry',
    'panel.sec.templates': 'Templates', 'panel.sec.templates.desc': 'wiki / spec / modes',
    'panel.log.running': 'Ejecutando…',
    'panel.log.done': '✓ listo',
    'panel.log.error': '✗ error',
    'panel.log.delegate': 'Ejecutá en tu shell: {cmd}',
    'panel.log.needs-apply': 'Dry-run→apply viene en v2. Ejecutá en tu shell: {cmd}',
    'panel.palette.title': ' Paleta de comandos ',
    'panel.palette.placeholder': 'Escribí un comando… (ej: audit, rcm, doc)',
    'panel.footer.filter.list': '[/] Filtrar   [i] Instalar seleccionado   [Esc] Volver al nav',
    'panel.filter.placeholder': 'Filtrar…',
    'panel.install.ok': '✓ Instalado: {label}',
    'panel.install.fail': '✗ Error: {msg}',
    'panel.install.already': '{label} ya está instalado.',
    'panel.sec.home': 'Inicio', 'panel.sec.home.desc': 'estado del proyecto + próxima acción',
    'panel.home.state.empty': 'Proyecto no configurado',
    'panel.home.state.brownfield': 'Proyecto existente — forge no configurado',
    'panel.home.state.configured': 'Configurado — sin skills activas',
    'panel.home.state.healthy': 'Saludable',
    'panel.home.state.needs-attention': 'Requiere atención',
    'panel.home.next': 'Próxima acción sugerida',
    'panel.home.action.init': 'forge init — inicializar forge en este proyecto',
    'panel.home.action.adopt': 'forge adopt — incorporar forge a este codebase',
    'panel.home.action.recommend': 'forge recommend — obtener recomendaciones de skills',
    'panel.home.action.audit': 'forge audit — ejecutar una auditoría del proyecto',
    'panel.home.action.doctor': 'forge doctor — diagnosticar problemas del entorno',
    'panel.home.pulse': 'Pulso del proyecto',
    'panel.home.loading': 'Cargando audit…',
  },
};

/** The full set of message keys (used by the parity test). */
export const MESSAGE_KEYS = Object.keys(MESSAGES.en);
