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

const HELP_EN = `forge v{version} — Agentic development framework

Usage: forge <command> [options]

Setup
  panel          Open the interactive panel (config, monitor, skills, hooks, templates)
  init           Initialize forge in a project (wizard + post-install dashboard)
  adopt          Onboard forge into an EXISTING codebase (analyze + auto-wiki)
  add            Install a skill from an external source (security pipeline, opt-in network)
  generate       Generate runtime config files from project.yaml
  update         Update managed files to the bundled catalog (--dry-run, --force)
  migrate        Migrate project.yaml from the v1 schema to v2 (--dry-run, --backup)
  scaffold       Scaffold a new agent: Tier 2 profile, or Tier 3 domain agent (--tier 3)
  teardown       Cleanly uninstall forge from a project (manifest-driven)

Inspect
  recommend      Stack-aware advisor: best catalog items for THIS project (--apply to install)
  audit          Audit project against the forge standard
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

const HELP_ES = `forge v{version} — Framework de desarrollo agéntico

Uso: forge <comando> [opciones]

Setup
  panel          Abre el panel interactivo (config, monitor, skills, hooks, templates)
  init           Inicializa forge en un proyecto (wizard + dashboard post-install)
  adopt          Incorpora forge a un codebase EXISTENTE (análisis + auto-wiki)
  add            Instala un skill desde una fuente externa (pipeline de seguridad, red opt-in)
  generate       Genera los archivos de config nativos de cada runtime desde project.yaml
  update         Actualiza los archivos gestionados al catálogo bundleado (--dry-run, --force)
  migrate        Migra project.yaml del schema v1 al v2 (--dry-run, --backup)
  scaffold       Genera un agente nuevo: profile Tier 2, o agente de dominio Tier 3 (--tier 3)
  teardown       Desinstala forge del proyecto de forma limpia (vía manifest)

Inspección
  recommend      Advisor según el stack: mejores items del catálogo para ESTE proyecto (--apply instala)
  audit          Audita el proyecto contra el estándar forge
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
    'header.tagline': 'Configure any project for AI agents',
    'panel.title': ' Sections ',
    'panel.footer': '[↑↓] Section   [Tab] Focus input/list/nav   [Enter] Install (Catalog)   [q/Esc] Quit',
    'panel.footer.nav': '[↑↓] Section   [Tab] Focus   [Enter] Open   [?] Help   [q/Esc] Quit',
    'panel.footer.filter': '[Type] Filter   [Tab] Move to list   [Esc] Back to nav',
    'panel.help.title': ' Key Bindings ',
    'panel.help.close': '[?] or [Esc] to close',
    'panel.sec.config': 'Configuration', 'panel.sec.config.desc': 'project.yaml overview',
    'panel.sec.monitor': 'Monitoring', 'panel.sec.monitor.desc': 'audit + doctor',
    'panel.sec.skills': 'Skills', 'panel.sec.skills.desc': 'catalog skills',
    'panel.sec.catalog': 'Catalog', 'panel.sec.catalog.desc': 'search & install',
    'panel.sec.hooks': 'Hooks', 'panel.sec.hooks.desc': 'installed + registry',
    'panel.sec.templates': 'Templates', 'panel.sec.templates.desc': 'wiki / spec / modes',
  },
  es: {
    'help.full': HELP_ES,
    'header.tagline': 'Configura cualquier proyecto para agentes de IA',
    'panel.title': ' Secciones ',
    'panel.footer': '[↑↓] Sección   [Tab] Foco input/lista/nav   [Enter] Instalar (Catálogo)   [q/Esc] Salir',
    'panel.footer.nav': '[↑↓] Sección   [Tab] Foco   [Enter] Abrir   [?] Ayuda   [q/Esc] Salir',
    'panel.footer.filter': '[Escribir] Filtrar   [Tab] Ir a lista   [Esc] Volver al nav',
    'panel.help.title': ' Atajos de teclado ',
    'panel.help.close': '[?] o [Esc] para cerrar',
    'panel.sec.config': 'Configuración', 'panel.sec.config.desc': 'resumen del project.yaml',
    'panel.sec.monitor': 'Monitoreo', 'panel.sec.monitor.desc': 'audit + doctor',
    'panel.sec.skills': 'Skills', 'panel.sec.skills.desc': 'skills del catálogo',
    'panel.sec.catalog': 'Catálogo', 'panel.sec.catalog.desc': 'buscar e instalar',
    'panel.sec.hooks': 'Hooks', 'panel.sec.hooks.desc': 'instalados + registry',
    'panel.sec.templates': 'Templates', 'panel.sec.templates.desc': 'wiki / spec / modes',
  },
};

/** The full set of message keys (used by the parity test). */
export const MESSAGE_KEYS = Object.keys(MESSAGES.en);
