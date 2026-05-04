# project.yaml — Stack no cubierto por los profiles existentes
# Para equipos cuyo stack no está entre los 8 profiles de forge:
#   hono-drizzle | nextjs-admin | expo | playwright-crawler
#   fastapi | express | rails | nestjs
#
# Opciones:
#   A) Usar agentes Tier 1 genéricos (backend-engineer, frontend-engineer) sin profile.
#   B) Crear un profile Tier 2 para el nuevo stack (recomendado si el equipo es estable).
#
# Para crear un profile Tier 2:
#   1. Crear el directorio forge/profiles/<tu-stack>/agents/
#   2. Crear forge/profiles/<tu-stack>/agents/<engineer>.md
#      Seguir la anatomía definida en docs/agent-standard.md:
#      frontmatter con name, description, model, tools, tier: 2, profile: <tu-stack>
#      Secciones: Stack, Tu trabajo, Reglas, Workflow, No hagas
#   3. Agregar el profile en agents.profiles (ver abajo)
#   4. Documentar el profile en la tabla Tier 2 de docs/agent-standard.md
#   5. Correr: python3 .agentic/scripts/forge-init.py --tool claude-code
#
# Atajo: usar el scaffold automático:
#   python3 .agentic/scripts/forge-scaffold-profile.py --name <stack> --engineer <agent-name>
#
# Convención de nombres (ver docs/agent-standard.md):
#   El nombre del agente en el profile debe coincidir con el Tier 1 que extiende.
#   Ejemplos válidos: api-engineer, fullstack-engineer, mobile-engineer

project:
  name: "Mi Proyecto"
  slug: "mi-proyecto"
  description: "Descripción breve del proyecto"
  language: "python"               # typescript | python | ruby | go | php | mixed
  status: "active"
  mode: "standard"                 # standard — perfil custom definido abajo

team:
  name: "Equipo Principal"
  members:
    - name: "Nombre Persona"
      role: "lead"
      email: "persona@empresa.cl"

stack:
  backend: null                    # Especificar aunque no sea uno de los 8 profiles
  frontend: null
  database: null
  cache: null
  testing: []

agents:
  active:
    - orchestrator
    - backend-engineer             # Agente Tier 1 genérico — reemplazar con el profile custom
    - test-engineer
    - docs-writer
  compliance: []
  # Una vez creado el profile Tier 2, reemplazar esta lista:
  # profiles: ["<tu-stack>"]
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
  active:
    - new-feature
    # - security-audit
    # - db-migrate
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
