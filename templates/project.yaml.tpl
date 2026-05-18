# project.yaml — Fuente de verdad del proyecto para forge
# Renombrar a project.yaml en la raíz del repositorio del proyecto

# Runtimes habilitados — forge-generate-all.py regenera configs para cada uno.
# Si se omite esta sección, se auto-detecta por archivos presentes en el proyecto:
#   .claude/  → claude-code | .opencode/ → opencode | .kiro/ → kiro | AGENTS.md → codex
runtimes:
  active:
    - claude-code    # siempre incluido — genera CLAUDE.md
    # - opencode     # genera AGENTS.md para OpenCode (comandos seriales, sin teams paralelos)
    # - codex        # genera AGENTS.md para Codex CLI (incluye SDD workflow + autonomy limits)
    # - kiro         # genera .kiro/steering/ (steering docs + 1 hook, sin slash commands)

project:
  name: "Mi Proyecto"
  slug: "mi-proyecto"            # lowercase, sin espacios (usado en rutas)
  description: "Descripción breve del proyecto"
  language: "typescript"         # typescript | python | ruby | go | php | mixed
  status: "active"               # active | paused | maintenance | archived

team:
  name: "Equipo Principal"
  members:
    - name: "Nombre Persona"
      role: "lead"               # lead | backend | frontend | fullstack | qa | design
      email: "persona@empresa.cl"

stack:
  backend: null                  # "hono" | "fastapi" | "rails" | "express" | "laravel" | null
  frontend: null                 # "nextjs" | "nuxt" | "remix" | "rails-views" | null
  database: null                 # "postgresql" | "mysql" | "sqlite" | null
  cache: null                    # "redis" | "memcached" | null
  testing: ["vitest"]            # vitest | jest | pytest | rspec | phpunit | playwright

agents:
  # Seleccionar de core/agents/ los agentes activos para este proyecto
  # El orchestrator siempre está incluido
  active:
    - orchestrator
    - backend-engineer
    - frontend-engineer
    - test-engineer
    - docs-writer
  # Agentes de compliance (activar si aplica)
  compliance:
    - compliance-reviewer         # GDPR, LGPD, Ley 21.719, CCPA
  # Profiles stack-específicos (Tier 2) — reemplazan agentes genéricos con versiones especializadas
  # Profiles disponibles: hono-drizzle | nextjs-admin | astro | expo | playwright-crawler
  #                       fastapi | express | rails | nestjs | django | vuenuxt | go-gin | sveltekit
  profiles: []

sprint:
  current: 1
  length_days: 14
  phases:
    - id: "A"
      name: "Core"
      specs: []
    - id: "B"
      name: "Features"
      specs: []

skills:
  # Skills universales — activos por defecto si el stack aplica
  active:
    - security-audit              # siempre recomendado si hay endpoints de API
    - db-migrate                  # activar si stack.database está configurado
    - local2prod                  # activar si hay deploy automatizado
    - new-feature                 # orquestador de implementación
    # - browser-test              # descomenta si tienes agent-browser instalado (npm i -g agent-browser)
    # Wiki — knowledge base del proyecto (instala /wiki-ingest, /wiki-query, /wiki-lint)
    # - wiki-ingest
    # - wiki-query
    # - wiki-lint
  # Integraciones opcionales — requieren herramienta externa
  integrations: []               # "obsidian-sync" si usas Obsidian + Local REST API

# Wiki — solo si wiki-ingest/wiki-query/wiki-lint están activos
# wiki:
#   path: "docs/wiki"            # default — donde vive el wiki del proyecto

deploy:
  provider: null                 # "vercel" | "railway" | "fly" | "github-actions" | "custom"
  branch: "main"                 # branch que trigerea el deploy
  # Para Vercel:
  # team_id: "team_..."
  # project_id: "prj_..."
  # Para Fly.io:
  # app_name: "mi-app"
  # Para custom:
  # check_command: "kubectl rollout status deploy/mi-app"

compliance:
  frameworks: []                 # gdpr | lgpd | ley-21719 | ccpa
  pii_handling: false            # true si el proyecto maneja PII
  audit_logs: false              # true si requiere logs inmutables

# Paths del proyecto (relativos a la raíz del repo)
paths:
  specs: "docs/specs"
  progress: "docs/progress.html"
  migrations: null               # "packages/api/migrations" | "db/migrate" | null
  tests: null                    # "tests/" | "__tests__/" | null

# Paths de scope por agente — se inyectan en el frontmatter de cada agente al hacer forge-init
# Permite que Claude Code sepa exactamente qué directorio le corresponde a cada agente
agent_paths:
  api: null                      # "src/api" | "packages/api" | "app/Http" | null
  frontend: null                 # "src/app" | "packages/web" | "resources/js" | null
  admin: null                    # "packages/admin" | "src/admin" | null
  mobile: null                   # "apps/mobile" | null
  scanner: null                  # "packages/scanner" | "src/crawlers" | null

# Integraciones (solo configurar si están activas en skills.integrations)
integrations:
  obsidian:
    vault_path: null             # "docs/mi-vault" — relativo a la raíz del repo
    # El token va en .env.local como OBSIDIAN_TOKEN (nunca en este archivo)
    map:                         # área → nota del vault a actualizar
      api: null                  # "03-api/endpoints.md"
      database: null             # "02-base-de-datos/migraciones.md"
      frontend: null             # "01-arquitectura/componentes.md"
      deploy: null               # "06-deploy/ci-cd.md"
      decisions: null            # "08-decisiones/log-decisiones.md"
