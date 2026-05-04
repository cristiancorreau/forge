# project.yaml — Modo startup (1-2 personas)
# Overhead mínimo: sin compliance, sin fases de sprint, SDD opcional.
# Renombrar a project.yaml en la raíz del repositorio.

project:
  name: "Mi Proyecto"
  slug: "mi-proyecto"
  description: "Descripción breve del proyecto"
  language: "typescript"           # typescript | python | ruby | go | php | mixed
  status: "active"
  mode: "startup"                  # Indica overhead reducido — sin compliance, sin fases

team:
  name: "Equipo"
  members:
    - name: "Fundador"
      role: "fullstack"
      email: "founder@startup.io"

stack:
  backend: null                    # "hono" | "fastapi" | "rails" | "express" | "laravel" | null
  frontend: null                   # "nextjs" | "nuxt" | "remix" | "rails-views" | null
  database: null                   # "postgresql" | "mysql" | "sqlite" | null
  cache: null
  testing: ["vitest"]

agents:
  # En modo startup se trabaja con el orquestador y UN agente de implementación.
  # Agregar más cuando el equipo crezca o cuando los dominios se separen claramente.
  active:
    - orchestrator
    - backend-engineer             # Reemplazar con un profile Tier 2 si el stack lo tiene
  compliance: []                   # Activar cuando la regulación lo exija
  profiles: []                     # Ejemplo: [hono-drizzle] si usás Hono + Drizzle

sprint:
  current: 1
  # En modo startup no se definen fases formales.
  # Agregar phases cuando el proyecto tenga >1 persona o >2 sprints planificados.

skills:
  active:
    - new-feature
    # - security-audit             # Descomenta antes de ir a producción
    # - db-migrate                 # Activar si stack.database está configurado

deploy:
  provider: null
  branch: "main"

# SDD (Spec-Driven Development) es OPCIONAL en modo startup.
# Se recomienda igual para features que toquen la DB o auth.
# Para habilitarlo, crear docs/specs/ y referenciar specs en sprint.phases[].specs.

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
