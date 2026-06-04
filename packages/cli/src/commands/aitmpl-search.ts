import { bold, dim, green, cyan, gray } from '../ui/colors.js';
import { box } from '../ui/box.js';

const HELP = `Usage: forge aitmpl-search <query> [options]

Search the curated offline catalog of frameworks, MCP servers, profiles,
tools and resources for AI agent development. Works fully offline.

Arguments:
  <query>     Search term (matches name, description, tags, language)

Options:
  -c, --category <cat>   Filter by category:
                         framework, mcp-server, profile, tool, resource
  --limit <n>            Max results (default: 20)
  --json                 Output results as JSON
  --list-categories      List available categories and item counts
  -h, --help             Show this help

Examples:
  forge aitmpl-search fastapi
  forge aitmpl-search "mcp postgres"
  forge aitmpl-search --category mcp-server
  forge aitmpl-search --category profile
  forge aitmpl-search rails --json
  forge aitmpl-search --list-categories
`;

interface InstallParam {
  key: string;
  label: string;
  default?: string;
}

interface InstallEnv {
  key: string;
  label: string;
  default?: string;
}

interface InstallSpec {
  slug: string;
  command: string;
  args: string[];
  params: InstallParam[];
  env: InstallEnv[];
}

interface CatalogItem {
  name: string;
  description: string;
  category: string;
  tags: string[];
  url: string;
  language: string;
  install?: InstallSpec;
}

const CATALOG: CatalogItem[] = [
  // ── Frameworks ──────────────────────────────────────────────────────────
  {
    name: 'cristiancorreau/forge',
    description:
      'Framework de desarrollo con agentes IA para equipos. Profiles para Next.js, Astro, FastAPI, Rails, NestJS, Express, Expo y más. Wizard CLI interactivo.',
    category: 'framework',
    tags: ['claude-code', 'agents', 'typescript', 'python', 'ruby', 'nextjs', 'astro', 'fastapi', 'rails', 'nestjs', 'express', 'expo'],
    url: 'https://github.com/cristiancorreau/forge',
    language: 'Python',
  },
  {
    name: 'paul-gauthier/aider',
    description:
      'Pair programming con LLMs en la terminal. Soporta Claude, GPT-4, Gemini. Edita archivos directamente y hace commits automáticos.',
    category: 'framework',
    tags: ['claude', 'gpt4', 'pair-programming', 'git', 'terminal'],
    url: 'https://github.com/paul-gauthier/aider',
    language: 'Python',
  },
  {
    name: 'BuilderIO/micro-agent',
    description:
      'Agente IA que escribe código hasta que los tests pasan. TDD automático: genera código iterativamente hasta lograr green tests.',
    category: 'framework',
    tags: ['tdd', 'testing', 'code-generation', 'claude', 'openai'],
    url: 'https://github.com/BuilderIO/micro-agent',
    language: 'TypeScript',
  },
  {
    name: 'anthropics/anthropic-quickstarts',
    description:
      'Quickstarts oficiales de Anthropic: customer support agent, computer use, multi-agent portfolio. Ejemplos de referencia.',
    category: 'framework',
    tags: ['claude', 'anthropic', 'multi-agent', 'computer-use', 'quickstart'],
    url: 'https://github.com/anthropics/anthropic-quickstarts',
    language: 'Python',
  },
  {
    name: 'anthropics/claude-code-action',
    description:
      'GitHub Action oficial para usar Claude Code en CI/CD. Permite que Claude revise PRs, corrija bugs y responda issues automáticamente.',
    category: 'framework',
    tags: ['claude-code', 'github-actions', 'ci-cd', 'pr-review'],
    url: 'https://github.com/anthropics/claude-code-action',
    language: 'TypeScript',
  },

  // ── MCP Servers — oficiales ──────────────────────────────────────────────
  {
    name: 'MCP — filesystem',
    description:
      'Acceso seguro al sistema de archivos local con control de directorios permitidos. Leer, escribir, listar y buscar archivos.',
    category: 'mcp-server',
    tags: ['filesystem', 'files', 'read', 'write', 'mcp', 'oficial'],
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    language: 'TypeScript',
    install: {
      slug: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '{ALLOWED_DIR}'],
      params: [{ key: 'ALLOWED_DIR', label: 'Directorio permitido', default: '.' }],
      env: [],
    },
  },
  {
    name: 'MCP — git',
    description:
      'Operaciones git: leer historial, diffs, commits, branches y status. Integración completa con repositorios git locales.',
    category: 'mcp-server',
    tags: ['git', 'version-control', 'commits', 'diff', 'mcp', 'oficial'],
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/git',
    language: 'Python',
    install: {
      slug: 'git',
      command: 'uvx',
      args: ['mcp-server-git', '--repository', '{REPO_PATH}'],
      params: [{ key: 'REPO_PATH', label: 'Ruta del repositorio git', default: '.' }],
      env: [],
    },
  },
  {
    name: 'MCP — github',
    description:
      'Integración con la API de GitHub: repos, issues, PRs, branches, commits, búsqueda de código. Requiere GITHUB_TOKEN.',
    category: 'mcp-server',
    tags: ['github', 'issues', 'pull-requests', 'api', 'mcp', 'oficial'],
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    language: 'TypeScript',
    install: {
      slug: 'github',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      params: [],
      env: [{ key: 'GITHUB_TOKEN', label: 'GitHub personal access token (ghp_...)' }],
    },
  },
  {
    name: 'MCP — postgres',
    description:
      'Acceso read-only a bases de datos PostgreSQL. Ejecutar queries, explorar schemas y tablas. Ideal para análisis de datos.',
    category: 'mcp-server',
    tags: ['postgres', 'postgresql', 'database', 'sql', 'mcp', 'oficial'],
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
    language: 'TypeScript',
    install: {
      slug: 'postgres',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres', '{CONNECTION_STRING}'],
      params: [{ key: 'CONNECTION_STRING', label: 'PostgreSQL connection string', default: 'postgresql://localhost/mydb' }],
      env: [],
    },
  },
  {
    name: 'MCP — sqlite',
    description:
      'Interacción con bases de datos SQLite: queries, introspección de schema, gestión de datos. Memo de conocimiento incorporado.',
    category: 'mcp-server',
    tags: ['sqlite', 'database', 'sql', 'local', 'mcp', 'oficial'],
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite',
    language: 'Python',
    install: {
      slug: 'sqlite',
      command: 'uvx',
      args: ['mcp-server-sqlite', '--db-path', '{DB_PATH}'],
      params: [{ key: 'DB_PATH', label: 'Ruta del archivo SQLite', default: './data.db' }],
      env: [],
    },
  },
  {
    name: 'MCP — fetch',
    description:
      'Fetch de URLs y conversión a Markdown. Permite a Claude leer páginas web, documentación y APIs HTTP.',
    category: 'mcp-server',
    tags: ['http', 'fetch', 'web', 'scraping', 'markdown', 'mcp', 'oficial'],
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
    language: 'Python',
    install: {
      slug: 'fetch',
      command: 'uvx',
      args: ['mcp-server-fetch'],
      params: [],
      env: [],
    },
  },
  {
    name: 'MCP — brave-search',
    description:
      'Búsqueda web con Brave Search API. Web search y local search con privacidad. Requiere BRAVE_API_KEY.',
    category: 'mcp-server',
    tags: ['search', 'web-search', 'brave', 'internet', 'mcp', 'oficial'],
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
    language: 'TypeScript',
    install: {
      slug: 'brave-search',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      params: [],
      env: [{ key: 'BRAVE_API_KEY', label: 'Brave Search API key' }],
    },
  },
  {
    name: 'MCP — slack',
    description:
      'Integración con Slack: enviar mensajes, leer canales, gestionar usuarios. Requiere Slack Bot Token.',
    category: 'mcp-server',
    tags: ['slack', 'messaging', 'communication', 'mcp', 'oficial'],
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
    language: 'TypeScript',
    install: {
      slug: 'slack',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-slack'],
      params: [],
      env: [
        { key: 'SLACK_BOT_TOKEN', label: 'Slack Bot Token (xoxb-...)' },
        { key: 'SLACK_TEAM_ID', label: 'Slack Team ID' },
      ],
    },
  },
  {
    name: 'MCP — puppeteer',
    description:
      'Automatización de browser con Puppeteer: navegar, hacer screenshots, rellenar formularios y ejecutar JavaScript.',
    category: 'mcp-server',
    tags: ['puppeteer', 'browser', 'automation', 'screenshot', 'scraping', 'mcp', 'oficial'],
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
    language: 'TypeScript',
    install: {
      slug: 'puppeteer',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
      params: [],
      env: [],
    },
  },
  {
    name: 'MCP — sequential-thinking',
    description:
      'Herramienta de razonamiento paso a paso con revisión y backtracking. Para problemas complejos que requieren análisis estructurado.',
    category: 'mcp-server',
    tags: ['reasoning', 'thinking', 'analysis', 'chain-of-thought', 'mcp', 'oficial'],
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
    language: 'TypeScript',
    install: {
      slug: 'sequential-thinking',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
      params: [],
      env: [],
    },
  },
  {
    name: 'MCP — memory',
    description:
      'Grafo de conocimiento persistente. Claude puede guardar y recuperar información entre conversaciones con entidades y relaciones.',
    category: 'mcp-server',
    tags: ['memory', 'knowledge-graph', 'persistence', 'mcp', 'oficial'],
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    language: 'TypeScript',
    install: {
      slug: 'memory',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
      params: [],
      env: [],
    },
  },
  {
    name: 'MCP — everything',
    description:
      'Servidor MCP de referencia con prompts, tools y resources de ejemplo. Útil para probar clientes MCP y aprender el protocolo.',
    category: 'mcp-server',
    tags: ['reference', 'testing', 'demo', 'mcp', 'oficial'],
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/everything',
    language: 'TypeScript',
    install: {
      slug: 'everything',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
      params: [],
      env: [],
    },
  },

  // ── MCP Servers — comunidad ───────────────────────────────────────────────
  {
    name: 'MCP — supabase (comunidad)',
    description:
      'Integración con Supabase: ejecutar queries SQL, gestionar tablas, auth y storage via MCP.',
    category: 'mcp-server',
    tags: ['supabase', 'postgres', 'database', 'auth', 'storage', 'mcp'],
    url: 'https://github.com/supabase-community/supabase-mcp',
    language: 'TypeScript',
    install: {
      slug: 'supabase',
      command: 'npx',
      args: ['-y', '@supabase/mcp-server-supabase', '--access-token', '{ACCESS_TOKEN}'],
      params: [{ key: 'ACCESS_TOKEN', label: 'Supabase personal access token' }],
      env: [],
    },
  },
  {
    name: 'MCP — Cloudflare',
    description:
      'Gestión de Workers, KV, R2, D1, AI Gateway y Vectorize de Cloudflare via MCP. Oficial de Cloudflare.',
    category: 'mcp-server',
    tags: ['cloudflare', 'workers', 'kv', 'r2', 'd1', 'edge', 'mcp'],
    url: 'https://github.com/cloudflare/mcp-server-cloudflare',
    language: 'TypeScript',
    install: {
      slug: 'cloudflare',
      command: 'npx',
      args: ['-y', '@cloudflare/mcp-server-cloudflare'],
      params: [],
      env: [{ key: 'CLOUDFLARE_API_TOKEN', label: 'Cloudflare API token' }],
    },
  },
  {
    name: 'MCP — Vercel',
    description:
      'Gestión de proyectos, deploys, dominios y logs de Vercel via MCP. Integración oficial.',
    category: 'mcp-server',
    tags: ['vercel', 'deploy', 'serverless', 'hosting', 'mcp'],
    url: 'https://github.com/vercel/mcp-server',
    language: 'TypeScript',
    install: {
      slug: 'vercel',
      command: 'npx',
      args: ['-y', '@vercel/mcp-adapter'],
      params: [],
      env: [{ key: 'VERCEL_TOKEN', label: 'Vercel API token' }],
    },
  },
  {
    name: 'MCP — Linear',
    description:
      'Integración con Linear: crear y consultar issues, proyectos y cycles. Para equipos que usan Linear como tracker.',
    category: 'mcp-server',
    tags: ['linear', 'project-management', 'issues', 'mcp'],
    url: 'https://github.com/linear/linear-mcp',
    language: 'TypeScript',
    install: {
      slug: 'linear',
      command: 'npx',
      args: ['-y', '@linear/mcp-server'],
      params: [],
      env: [{ key: 'LINEAR_API_KEY', label: 'Linear API key' }],
    },
  },
  {
    name: 'MCP — Playwright',
    description:
      'Automatización de browser con Playwright via MCP. Navegación, screenshots, testing E2E e interacción con páginas web.',
    category: 'mcp-server',
    tags: ['playwright', 'browser', 'e2e', 'testing', 'automation', 'mcp'],
    url: 'https://github.com/microsoft/playwright-mcp',
    language: 'TypeScript',
    install: {
      slug: 'playwright',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      params: [],
      env: [],
    },
  },
  {
    name: 'MCP — Sentry',
    description:
      'Consulta issues, eventos y trazas de Sentry. Permite a Claude diagnosticar errores de producción directamente.',
    category: 'mcp-server',
    tags: ['sentry', 'errors', 'monitoring', 'debugging', 'mcp'],
    url: 'https://github.com/getsentry/sentry-mcp',
    language: 'Python',
    install: {
      slug: 'sentry',
      command: 'uvx',
      args: ['mcp-server-sentry'],
      params: [],
      env: [{ key: 'SENTRY_AUTH_TOKEN', label: 'Sentry auth token' }],
    },
  },
  {
    name: 'MCP — Docker',
    description:
      'Gestión de contenedores, imágenes y volúmenes Docker via MCP. Ejecutar y gestionar el ciclo de vida de containers.',
    category: 'mcp-server',
    tags: ['docker', 'containers', 'devops', 'infrastructure', 'mcp'],
    url: 'https://github.com/ckreiling/mcp-server-docker',
    language: 'Python',
    install: {
      slug: 'docker',
      command: 'uvx',
      args: ['mcp-server-docker'],
      params: [],
      env: [],
    },
  },
  {
    name: 'MCP — AWS (aws-kb-retrieval)',
    description:
      'Retrieval desde AWS Knowledge Base. Para proyectos en AWS que usan Bedrock Knowledge Bases.',
    category: 'mcp-server',
    tags: ['aws', 'bedrock', 'knowledge-base', 'rag', 'mcp', 'oficial'],
    url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/aws-kb-retrieval-server',
    language: 'TypeScript',
    install: {
      slug: 'aws-kb',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-aws-kb-retrieval'],
      params: [],
      env: [
        { key: 'AWS_ACCESS_KEY_ID', label: 'AWS Access Key ID' },
        { key: 'AWS_SECRET_ACCESS_KEY', label: 'AWS Secret Access Key' },
        { key: 'AWS_REGION', label: 'AWS Region', default: 'us-east-1' },
      ],
    },
  },

  // ── Profiles de forge ─────────────────────────────────────────────────────
  {
    name: 'forge profile — hono-drizzle',
    description:
      'Agente api-engineer especializado en Hono + Drizzle ORM + TypeScript. Incluye rutas, schemas, migraciones y tests.',
    category: 'profile',
    tags: ['hono', 'drizzle', 'typescript', 'api', 'orm', 'edge'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/hono-drizzle',
    language: 'TypeScript',
  },
  {
    name: 'forge profile — nextjs-admin',
    description:
      'Agente admin-engineer para dashboards con Next.js 15 + shadcn/ui. Componentes, tablas de datos y gestión interna.',
    category: 'profile',
    tags: ['nextjs', 'shadcn', 'react', 'dashboard', 'admin', 'typescript'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/nextjs-admin',
    language: 'TypeScript',
  },
  {
    name: 'forge profile — astro',
    description:
      'Agente frontend-engineer para sitios con Astro. SSG/SSR, islands architecture, Content Collections y Tailwind.',
    category: 'profile',
    tags: ['astro', 'ssg', 'ssr', 'islands', 'typescript', 'tailwind', 'static'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/astro',
    language: 'TypeScript',
  },
  {
    name: 'forge profile — fastapi',
    description:
      'Agente api-engineer para FastAPI + Python. Endpoints async, Pydantic schemas, SQLAlchemy y pytest.',
    category: 'profile',
    tags: ['fastapi', 'python', 'async', 'pydantic', 'sqlalchemy', 'pytest'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/fastapi',
    language: 'Python',
  },
  {
    name: 'forge profile — flask',
    description:
      'Agente api-engineer para Flask 3 + Python. Application factory, blueprints, SQLAlchemy, marshmallow/pydantic y pytest.',
    category: 'profile',
    tags: ['flask', 'python', 'blueprints', 'sqlalchemy', 'marshmallow', 'pytest'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/flask',
    language: 'Python',
  },
  {
    name: 'forge profile — springboot',
    description:
      'Agente api-engineer para Spring Boot 3 (Java/Kotlin). Spring Web, Spring Data JPA/Hibernate, Bean Validation, Flyway y JUnit 5.',
    category: 'profile',
    tags: ['spring-boot', 'java', 'kotlin', 'jpa', 'hibernate', 'jvm', 'rest-api'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/springboot',
    language: 'Java',
  },
  {
    name: 'forge profile — rust',
    description:
      'Agente api-engineer para Rust. Axum + Tokio + sqlx/SeaORM, errores con thiserror/anyhow y tests con cargo. Variantes Actix/Rocket.',
    category: 'profile',
    tags: ['rust', 'axum', 'tokio', 'sqlx', 'actix', 'rocket', 'rest-api'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/rust',
    language: 'Rust',
  },
  {
    name: 'forge profile — flutter',
    description:
      'Agente mobile-engineer para Flutter 3 + Dart 3. Widgets, Riverpod/Bloc, go_router, freezed y flutter test/analyze.',
    category: 'profile',
    tags: ['flutter', 'dart', 'mobile', 'ios', 'android', 'riverpod', 'bloc'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/flutter',
    language: 'Dart',
  },
  {
    name: 'forge profile — rails',
    description:
      'Agente fullstack-engineer para Ruby on Rails. Modelos, migraciones, controllers, views y RSpec.',
    category: 'profile',
    tags: ['rails', 'ruby', 'activerecord', 'rspec', 'fullstack'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/rails',
    language: 'Ruby',
  },
  {
    name: 'forge profile — nestjs',
    description:
      'Agente api-engineer para NestJS + TypeScript. Módulos, guards, decorators y arquitectura escalable.',
    category: 'profile',
    tags: ['nestjs', 'typescript', 'node', 'api', 'modules', 'guards'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/nestjs',
    language: 'TypeScript',
  },
  {
    name: 'forge profile — express',
    description:
      'Agente api-engineer para Express + Node.js + TypeScript. Middleware, rutas, validación y Jest.',
    category: 'profile',
    tags: ['express', 'nodejs', 'typescript', 'middleware', 'api'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/express',
    language: 'TypeScript',
  },
  {
    name: 'forge profile — expo',
    description:
      'Agente mobile-engineer para React Native con Expo. Navegación, componentes nativos y EAS.',
    category: 'profile',
    tags: ['expo', 'react-native', 'mobile', 'ios', 'android', 'typescript'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/expo',
    language: 'TypeScript',
  },
  {
    name: 'forge profile — playwright-crawler',
    description:
      'Agente scanner-engineer para scraping y crawling con Playwright. Extracción de datos, screenshots y automatización.',
    category: 'profile',
    tags: ['playwright', 'scraping', 'crawler', 'browser', 'automation', 'typescript'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/playwright-crawler',
    language: 'TypeScript',
  },
  {
    name: 'forge profile — django',
    description:
      'Agente api-engineer para Django 4.x + DRF + PostgreSQL + pytest-django. Modelos, migraciones, serializers, viewsets y tests.',
    category: 'profile',
    tags: ['django', 'python', 'drf', 'postgresql', 'rest-api', 'pytest'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/django',
    language: 'Python',
  },
  {
    name: 'forge profile — vuenuxt',
    description:
      'Agente frontend-engineer para Nuxt 3 + Vue 3 + Pinia + TypeScript. Pages, componentes, composables y SSR.',
    category: 'profile',
    tags: ['nuxt', 'vue', 'typescript', 'pinia', 'ssr', 'tailwind'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/vuenuxt',
    language: 'TypeScript',
  },
  {
    name: 'forge profile — go-gin',
    description:
      'Agente api-engineer para Go + Gin/Echo + sqlc + PostgreSQL + testify. Handlers, services, repositories e migrations.',
    category: 'profile',
    tags: ['go', 'golang', 'gin', 'echo', 'sqlc', 'postgresql', 'rest-api'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/go-gin',
    language: 'Go',
  },
  {
    name: 'forge profile — sveltekit',
    description:
      'Agente frontend-engineer para SvelteKit 2 + Svelte 5 + TypeScript + Tailwind. Routes, components, load functions y form actions.',
    category: 'profile',
    tags: ['sveltekit', 'svelte', 'typescript', 'tailwind', 'ssr', 'vite'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/sveltekit',
    language: 'TypeScript',
  },
  {
    name: 'forge profile — laravel',
    description:
      'Tres agentes para proyectos Laravel: api-engineer (Sanctum + Eloquent + Form Requests), fullstack-engineer (Blade + Livewire 3 o Inertia) y migration-specialist (upgrade L6→L13 paso a paso con breaking changes por versión).',
    category: 'profile',
    tags: ['laravel', 'php', 'eloquent', 'sanctum', 'livewire', 'blade', 'inertia', 'migration', 'upgrade'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/laravel',
    language: 'PHP',
  },
  {
    name: 'forge profile — wordpress',
    description:
      'Tres agentes para proyectos WordPress: wp-engineer (FSE + bloques Gutenberg + Interactivity API + WP REST API), divi-engineer (Divi Theme Builder + módulos ET_Builder_Module + Dynamic Content) y elementor-engineer (Elementor Pro + widgets personalizados + Dynamic Tags + Loop Grid).',
    category: 'profile',
    tags: ['wordpress', 'php', 'gutenberg', 'fse', 'divi', 'elementor', 'page-builder', 'blocks', 'theme-builder'],
    url: 'https://github.com/cristiancorreau/forge/tree/main/profiles/wordpress',
    language: 'PHP',
  },

  // ── Tools ────────────────────────────────────────────────────────────────
  {
    name: 'anthropics/claude-code (CLI)',
    description:
      'Claude Code oficial — CLI para desarrollo con agentes IA directamente en la terminal. Instalación: npm i -g @anthropic-ai/claude-code',
    category: 'tool',
    tags: ['claude-code', 'cli', 'terminal', 'official'],
    url: 'https://docs.anthropic.com/claude-code',
    language: 'TypeScript',
  },
  {
    name: 'modelcontextprotocol/inspector',
    description:
      'Inspector visual para servidores MCP. Permite probar y depurar servers MCP en una interfaz web interactiva.',
    category: 'tool',
    tags: ['mcp', 'debugging', 'inspector', 'testing', 'development'],
    url: 'https://github.com/modelcontextprotocol/inspector',
    language: 'TypeScript',
  },

  // ── Resources ─────────────────────────────────────────────────────────────
  {
    name: 'modelcontextprotocol/servers (todos)',
    description:
      'Repositorio oficial con todos los servers MCP de referencia: filesystem, git, github, postgres, sqlite, fetch, slack, puppeteer, memory y más.',
    category: 'resource',
    tags: ['mcp', 'servers', 'reference', 'official'],
    url: 'https://github.com/modelcontextprotocol/servers',
    language: 'TypeScript',
  },
  {
    name: 'punkpeye/awesome-mcp-servers',
    description:
      'Lista curada de servidores MCP de la comunidad. Cubre bases de datos, APIs, herramientas de desarrollo, comunicación y más.',
    category: 'resource',
    tags: ['mcp', 'awesome', 'curated', 'list', 'community'],
    url: 'https://github.com/punkpeye/awesome-mcp-servers',
    language: '',
  },
  {
    name: 'Documentación oficial MCP',
    description:
      'Documentación del Model Context Protocol: guías para construir servers y clients, especificación del protocolo y ejemplos.',
    category: 'resource',
    tags: ['mcp', 'docs', 'specification', 'protocol', 'official'],
    url: 'https://modelcontextprotocol.io',
    language: '',
  },
  {
    name: 'Documentación Claude Code',
    description:
      'Docs oficiales de Claude Code: hooks, slash commands, configuración de agentes, CLAUDE.md, MCP y más.',
    category: 'resource',
    tags: ['claude-code', 'docs', 'hooks', 'agents', 'official'],
    url: 'https://docs.anthropic.com/claude-code',
    language: '',
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  framework: 'Framework',
  'mcp-server': 'MCP Server',
  skill: 'Skill',
  tool: 'Herramienta',
  profile: 'Profile forge',
  resource: 'Recurso',
};

const CATEGORIES: string[] = [...new Set(CATALOG.map(item => item.category))].sort();

interface ScoredItem {
  score: number;
  item: CatalogItem;
}

function searchLocal(query: string, category?: string): CatalogItem[] {
  const terms = query ? query.toLowerCase().split(/\s+/).filter(Boolean) : [];
  const results: ScoredItem[] = [];

  for (const item of CATALOG) {
    if (category && item.category !== category) continue;

    if (terms.length === 0) {
      results.push({ score: 0, item });
      continue;
    }

    const haystack = [
      item.name,
      item.description,
      item.category,
      item.tags.join(' '),
      item.language,
    ]
      .join(' ')
      .toLowerCase();

    const score = terms.reduce((acc, t) => (haystack.includes(t) ? acc + 1 : acc), 0);
    if (score > 0) results.push({ score, item });
  }

  results.sort((a, b) => b.score - a.score);
  return results.map(r => r.item);
}

function wrapText(text: string, width: number, indent: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ' ' + word;
    } else {
      lines.push(indent + current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(indent + current);
  return lines;
}

function printResults(results: CatalogItem[]): void {
  if (results.length === 0) {
    console.log(dim('Sin resultados. Prueba con otro término o usa --list-categories.'));
    return;
  }

  results.forEach((item, idx) => {
    const cat = CATEGORY_LABELS[item.category] ?? item.category;
    const num = String(idx + 1).padStart(2, ' ');

    console.log(`${gray(num + '.')} ${bold(item.name)}`);

    if (item.description) {
      for (const line of wrapText(item.description, 68, '     ')) {
        console.log(dim(line));
      }
    }

    if (item.tags.length > 0) {
      const tagStr = item.tags
        .slice(0, 8)
        .map(t => cyan('#' + t))
        .join('  ');
      console.log(`     ${tagStr}`);
    }

    const metaParts = [`[${cat}]`];
    if (item.language) metaParts.push(item.language);
    console.log(`     ${gray(metaParts.join('  '))}`);
    console.log(`     ${green(item.url)}`);
    console.log('');
  });
}

function getOptionValue(args: string[], names: string[]): string | undefined {
  for (const name of names) {
    const idx = args.indexOf(name);
    if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  }
  return undefined;
}

export async function aitmplSearch(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }

  const jsonMode = args.includes('--json');

  if (args.includes('--list-categories')) {
    if (jsonMode) {
      const data = CATEGORIES.map(cat => ({
        category: cat,
        label: CATEGORY_LABELS[cat] ?? cat,
        count: CATALOG.filter(item => item.category === cat).length,
      }));
      console.log(JSON.stringify({ categories: data, total: CATALOG.length }, null, 2));
      return 0;
    }
    console.log(cyan(bold('Categorías disponibles')) + '\n');
    for (const cat of CATEGORIES) {
      const count = CATALOG.filter(item => item.category === cat).length;
      const label = CATEGORY_LABELS[cat] ?? cat;
      console.log(`  ${bold(cat.padEnd(16))} ${dim(label)} ${gray(`(${count} items)`)}`);
    }
    console.log('\n' + box('Total catálogo', [`${CATALOG.length} items`]));
    return 0;
  }

  const category = getOptionValue(args, ['--category', '-c']);
  if (category && !CATEGORIES.includes(category)) {
    console.error(`ERROR: categoría desconocida '${category}'. Válidas: ${CATEGORIES.join(', ')}`);
    return 1;
  }

  const limitRaw = getOptionValue(args, ['--limit']);
  let limit = 20;
  if (limitRaw !== undefined) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      console.error(`ERROR: --limit debe ser un entero positivo`);
      return 1;
    }
    limit = parsed;
  }

  const flagsWithValue = new Set(['--category', '-c', '--limit']);
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (flagsWithValue.has(arg)) {
      i++; // skip the value
      continue;
    }
    if (arg.startsWith('-')) continue; // skip other flags (--json, etc.)
    positional.push(arg);
  }
  const query = positional.join(' ');

  if (!query && !category) {
    process.stdout.write(HELP);
    return 1;
  }

  let results = searchLocal(query, category);
  results = results.slice(0, limit);

  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
    return 0;
  }

  console.log(cyan(bold('forge aitmpl-search')) + dim(` — ${results.length} resultado(s) (catálogo local)`) + '\n');
  printResults(results);

  return 0;
}
