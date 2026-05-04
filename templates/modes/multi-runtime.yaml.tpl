# project.yaml — Modo multi-runtime
# Para equipos que usan Claude Code, OpenCode y/o Kiro simultáneamente.
# Renombrar a project.yaml en la raíz del repositorio.
#
# Adapters disponibles y cómo instalar cada runtime:
#   Claude Code : forge-init --tool claude-code   → genera .claude/agents/
#   OpenCode    : forge-init --tool opencode       → genera AGENTS.md para OpenCode
#   Kiro        : forge-init --tool kiro           → genera .kiro/steering/
#   Todos       : forge-init --tool all            → instala los tres runtimes a la vez
#
# Ejecutar forge-init una vez por runtime. Los archivos de cada adapter
# no se solapan — pueden coexistir en el mismo repositorio.

project:
  name: "Mi Proyecto"
  slug: "mi-proyecto"
  description: "Descripción breve del proyecto"
  language: "typescript"           # typescript | python | ruby | go | php | mixed
  status: "active"
  mode: "multi-runtime"            # Indica que el proyecto usa más de un runtime de IA

team:
  name: "Equipo Principal"
  members:
    - name: "Nombre Persona"
      role: "lead"
      email: "persona@empresa.cl"

stack:
  backend: null                    # "hono" | "fastapi" | "rails" | "express" | "laravel" | null
  frontend: null                   # "nextjs" | "nuxt" | "remix" | "rails-views" | null
  database: null                   # "postgresql" | "mysql" | "sqlite" | null
  cache: null
  testing: ["vitest"]

agents:
  active:
    - orchestrator
    - backend-engineer
    - frontend-engineer
    - test-engineer
    - docs-writer
  compliance:
    - compliance-reviewer
  profiles: []                     # Mismos profiles aplican a todos los runtimes

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
  active:
    - security-audit
    - db-migrate
    - local2prod
    - new-feature
  integrations: []

deploy:
  provider: null
  branch: "main"

compliance:
  frameworks: []
  pii_handling: false
  audit_logs: false

paths:
  specs: "docs/specs"
  progress: "docs/progress.html"
  migrations: null
  tests: null

integrations:
  obsidian:
    vault_path: null
    map:
      api: null
      database: null
      frontend: null
      deploy: null
      decisions: null
