# project.yaml — Modo enterprise (9+ personas)
# Roster completo, compliance activo, fases de sprint con specs, CI habilitado.
# Renombrar a project.yaml en la raíz del repositorio.
#
# CI: ejecutar forge audit con --json para integrar en pipelines:
#   npx @cristiancorreau/forge audit --json | jq '.summary'
# Retorna código de salida 1 si hay errores de severidad "error" o "critical".

project:
  name: "Mi Proyecto Enterprise"
  slug: "mi-proyecto-enterprise"
  description: "Descripción del sistema"
  language: "typescript"           # typescript | python | ruby | go | php | mixed
  status: "active"
  mode: "enterprise"               # Activa validaciones estrictas de compliance y auditoría

team:
  name: "Equipo Principal"
  members:
    - name: "Tech Lead"
      role: "lead"
      email: "lead@empresa.com"
    - name: "Backend Senior"
      role: "backend"
      email: "backend@empresa.com"
    - name: "Frontend Senior"
      role: "frontend"
      email: "frontend@empresa.com"
    - name: "QA Engineer"
      role: "qa"
      email: "qa@empresa.com"
    - name: "Security Engineer"
      role: "backend"
      email: "security@empresa.com"

stack:
  backend: null                    # "hono" | "fastapi" | "rails" | "express" | "laravel" | null
  frontend: null                   # "nextjs" | "nuxt" | "remix" | "rails-views" | null
  database: null                   # "postgresql" | "mysql" | "sqlite" | null
  cache: null                      # "redis" | "memcached" | null
  testing: ["vitest", "playwright"]

agents:
  active:
    - orchestrator
    - backend-engineer
    - frontend-engineer
    - test-engineer
    - docs-writer
  # Compliance y seguridad obligatorios en enterprise
  compliance:
    - compliance-reviewer           # GDPR, LGPD, Ley 21.719, CCPA
    - security-auditor              # Auditoría de vulnerabilidades — obligatorio pre-merge
  profiles: []                     # Ejemplo: [hono-drizzle, nextjs-admin]

sprint:
  current: 1
  length_days: 14
  phases:
    - id: "A"
      name: "Core"
      specs:
        - "docs/specs/A1-autenticacion.md"
        - "docs/specs/A2-modelo-datos.md"
    - id: "B"
      name: "Features"
      specs:
        - "docs/specs/B1-feature-principal.md"
        - "docs/specs/B2-integraciones.md"
    - id: "C"
      name: "Compliance & Security"
      specs:
        - "docs/specs/C1-audit-trail.md"
        - "docs/specs/C2-dsar-flow.md"

skills:
  active:
    - security-audit
    - db-migrate
    - local2prod
    - new-feature
  integrations: []

deploy:
  provider: null                   # "vercel" | "railway" | "fly" | "github-actions" | "custom"
  branch: "main"

# Compliance enterprise: múltiples marcos regulatorios
# forge audit verifica automáticamente los frameworks listados aquí.
# Usar --json en CI: npx @cristiancorreau/forge audit --json
compliance:
  frameworks:
    - gdpr                         # Unión Europea
    - lgpd                         # Brasil
    - ley-21719                    # Chile
    - ccpa                         # California, EE.UU.
  pii_handling: true               # El sistema procesa datos personales
  audit_logs: true                 # Logs inmutables requeridos (append-only, sin UPDATE/DELETE)

paths:
  specs: "docs/specs"
  progress: "docs/progress.html"
  migrations: null                 # "packages/api/migrations" | "db/migrate" | null
  tests: null                      # "tests/" | "__tests__/" | null

integrations:
  obsidian:
    vault_path: null
    map:
      api: null
      database: null
      frontend: null
      deploy: null
      decisions: null
