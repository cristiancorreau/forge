# project.yaml — Fuente de verdad del proyecto para forge
# Renombrar a project.yaml en la raíz del repositorio del proyecto

project:
  name: "Mi Proyecto"
  slug: "mi-proyecto"            # lowercase, sin espacios (usado en rutas)
  description: "Descripción breve del proyecto"
  language: "typescript"         # typescript | python | ruby | go | php | mixed
  mode: "standard"               # startup | standard | enterprise  [nuevo en v2]
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
  orm: null                      # "drizzle" | "prisma" | "sqlalchemy" | "active-record" | null  [nuevo en v2]
  cache: null                    # "redis" | "memcached" | null
  package_manager: null          # "npm" | "pnpm" | "yarn" | "bun" | "pip" | "poetry" | null  [nuevo en v2]
  monorepo: null                 # "turborepo" | "nx" | "lerna" | null  [nuevo en v2]
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
  # nuevo en v2: mapeo rol → modelo específico de Claude
  by_role:
    orchestrator: null            # ej: claude-opus-4-7
    senior-backend: null          # ej: claude-sonnet-4-6
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
  provider: null                 # "vercel" | "railway" | "fly" | "aws" | "github-actions" | "custom"
  branch: "main"                 # branch que trigerea el deploy
  project_id: null               # ID del proyecto en la plataforma (ej: prj_xxx en Vercel)  [nuevo en v2]
  production_url: null           # https://mi-proyecto.vercel.app  [nuevo en v2]
  # Para Vercel:
  # team_id: "team_..."
  # Para Fly.io:
  # app_name: "mi-app"
  # Para custom:
  # check_command: "kubectl rollout status deploy/mi-app"
  smoke_tests: []                # Tests de humo post-deploy  [nuevo en v2]
  # Ejemplo de smoke tests:
  # smoke_tests:
  #   - url: /api/health
  #     expect_status: 200
  #     expect_json:
  #       status: ok
  #   - url: https://mi-proyecto.vercel.app
  #     expect_status: 200

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

# ---------------------------------------------------------------------------
# Secciones nuevas en v2
# ---------------------------------------------------------------------------

mcp:                             # [nuevo en v2] Servidores MCP del proyecto
  servers: []
  # Ejemplo:
  # servers:
  #   - name: supabase
  #     auto_approve:
  #       - list_tables
  #       - execute_sql
  #   - name: github
  #     auto_approve:
  #       - list_issues

github:                          # [nuevo en v2] Integración con GitHub Projects
  project:
    number: null                 # Número del GitHub Project (entero)
    owner: null                  # usuario u organización (ej: "mi-org")
    repo: null                   # nombre del repositorio (ej: "mi-proyecto")
    status_field_id: null        # ID del campo Status en el GitHub Project
    status_in_progress: null     # Valor para tareas en progreso (ej: "In Progress")
    status_done: null            # Valor para tareas completadas (ej: "Done")

rules:                           # [nuevo en v2] Guardrails y reglas de desarrollo
  forbidden_in_production:
    - "console.log"              # no dejar logs de debug
    - "TODO:"                    # no dejar TODOs sin resolver
    - "FIXME:"
  required_review_before_ship: false   # true → requiere revisión humana antes de ship
  require_spec_before_implementation: false  # true → requiere spec aprobada
  conventional_commits: true     # enforza Conventional Commits
  forbidden_patterns: []         # regex evaluadas por el hook pre-edit-check
  # Ejemplo de forbidden_patterns:
  # forbidden_patterns:
  #   - "process\\.env\\.[A-Z_]+\\s*=\\s*['\"][^'\"]+['\"]"  # hardcoded env values
  #   - "eval\\("                # uso de eval prohibido

scripts:                         # [nuevo en v2] Comandos de verificación post-turno
  check: null                    # ej: "pnpm typecheck && pnpm lint"
                                 # Ejecutado por post-turn-check.sh si está configurado
