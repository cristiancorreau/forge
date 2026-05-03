# project.yaml — Fuente de verdad del proyecto para forge
# Renombrar a project.yaml en la raíz del repositorio del proyecto

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

compliance:
  frameworks: []                  # gdpr | lgpd | ley-21719 | ccpa
  pii_handling: false            # true si el proyecto maneja PII
  audit_logs: false              # true si requiere logs inmutables

# Paths del proyecto (relativos a la raíz del repo)
paths:
  specs: "docs/specs"
  progress: "docs/progress.html"
  migrations: null               # "packages/api/migrations" | "db/migrate" | null
  tests: null                    # "tests/" | "__tests__/" | null
