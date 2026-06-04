# project.yaml v2 — Referencia completa

`project.yaml` es la fuente de verdad del proyecto para el framework Forge. La versión 2 agrega secciones de configuración de deploy, MCP, GitHub Projects, guardrails y scripts.

---

## Secciones

### `project`

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `name` | string | — | **Requerido.** Nombre legible del proyecto |
| `mode` | string | — | **Requerido (v2).** `startup` \| `standard` \| `enterprise` |
| `slug` | string \| null | null | Identificador lowercase sin espacios (ej: `mi-proyecto`) |
| `description` | string \| null | null | Descripción breve del propósito |
| `language` | string \| null | null | `typescript` \| `python` \| `ruby` \| `go` \| `php` \| `mixed`. Derivado del lenguaje backend (backend/fullstack) o frontend (frontend-only); `mixed` si los lados difieren |
| `type` | string \| null | null | **[SPEC-037]** `frontend` \| `backend` \| `fullstack`. Tipo de proyecto. Opcional; se infiere para archivos antiguos |
| `status` | string \| null | null | `active` \| `paused` \| `maintenance` \| `archived` |

---

### `stack`

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `backend` | string \| null | null | Framework backend: `hono`, `fastapi`, `rails`, `express`, `laravel`, `nestjs`, `django`, `go-gin` |
| `backend_language` | string \| null | null | **[SPEC-037]** Lenguaje del backend: `typescript` \| `python` \| `ruby` \| `go` \| `php`. Permite que back y front difieran |
| `frontend` | string \| null | null | Framework frontend: `nextjs`, `nuxt`, `remix`, `rails-views`, `astro`, `sveltekit` |
| `frontend_language` | string \| null | null | **[SPEC-037]** Lenguaje del frontend: `typescript`. Permite que back y front difieran |
| `database` | string \| null | null | `postgresql` \| `mysql` \| `sqlite` |
| `orm` | string \| null | null | **[v2]** `drizzle` \| `prisma` \| `sequelize` \| `typeorm` \| `sqlalchemy` \| `active-record` |
| `cache` | string \| null | null | `redis` \| `memcached` |
| `package_manager` | string \| null | null | **[v2]** `npm` \| `pnpm` \| `yarn` \| `bun` \| `pip` \| `poetry` \| `bundler` |
| `monorepo` | string \| null | null | **[v2]** `turborepo` \| `nx` \| `lerna` |
| `testing` | array \| null | null | Frameworks de testing: `vitest`, `jest`, `pytest`, `rspec`, `phpunit`, `playwright`, `cypress` |

---

### `agents`

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `active` | array | — | Lista de agentes activos de `core/agents/` |
| `by_role` | object \| null | null | **[v2]** Mapeo `rol → modelo` (ej: `orchestrator: claude-opus-4-7`) |
| `compliance` | array \| null | null | Agentes de compliance opcionales |
| `profiles` | array \| null | null | Profiles stack-específicos Tier 2 |

#### Ejemplo `agents.by_role`

```yaml
agents:
  by_role:
    orchestrator: claude-opus-4-7
    senior-backend: claude-sonnet-4-6
    test-engineer: claude-haiku-4-5
```

---

### `skills`

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `active` | array \| null | null | Lista de skills activos de `core/skills/` |
| `integrations` | array \| null | null | Integraciones opcionales (ej: `obsidian-sync`) |

---

### `deploy` [v2]

Configuración de deploy y smoke tests post-deploy.

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `provider` | string \| null | null | `vercel` \| `railway` \| `fly` \| `aws` \| `github-actions` \| `custom` |
| `branch` | string \| null | null | Branch que trigerea el deploy automático |
| `project_id` | string \| null | null | **[v2]** ID del proyecto en la plataforma (ej: `prj_xxx` en Vercel) |
| `production_url` | string \| null | null | **[v2]** URL de producción (ej: `https://mi-app.vercel.app`) |
| `smoke_tests` | array \| null | null | **[v2]** Lista de smoke tests a ejecutar post-deploy |

#### Ejemplo `deploy`

```yaml
deploy:
  provider: vercel
  branch: main
  project_id: prj_abc123xyz
  production_url: https://mi-proyecto.vercel.app
  smoke_tests:
    - url: /api/health
      expect_status: 200
      expect_json:
        status: ok
    - url: /api/version
      expect_status: 200
    - url: https://mi-proyecto.vercel.app
      expect_status: 200
```

#### `smoke_tests[]`

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `url` | string | Sí | Ruta relativa (`/api/health`) o URL absoluta |
| `expect_status` | integer \| null | No | HTTP status code esperado (100–599) |
| `expect_json` | object \| null | No | Objeto JSON que debe estar contenido en la respuesta |

---

### `mcp` [v2]

Configuración de servidores MCP (Model Context Protocol) usados en el proyecto.

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `servers` | array \| null | null | Lista de servidores MCP configurados |

#### `mcp.servers[]`

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `name` | string | Sí | Nombre del servidor MCP |
| `auto_approve` | array \| null | No | Tool names que se auto-aprueban sin confirmación |

#### Ejemplo `mcp`

```yaml
mcp:
  servers:
    - name: supabase
      auto_approve:
        - list_tables
        - execute_sql
        - get_logs
    - name: github
      auto_approve:
        - list_issues
        - get_pull_request
```

---

### `github` [v2]

Integración con GitHub Projects para tracking automático de tareas.

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `project.number` | integer \| null | null | Número del GitHub Project |
| `project.owner` | string \| null | null | Usuario u organización dueña del repo |
| `project.repo` | string \| null | null | Nombre del repositorio |
| `project.status_field_id` | string \| null | null | ID del campo Status en el Project |
| `project.status_in_progress` | string \| null | null | Valor del campo para tareas en progreso |
| `project.status_done` | string \| null | null | Valor del campo para tareas completadas |

#### Ejemplo `github`

```yaml
github:
  project:
    number: 42
    owner: mi-org
    repo: mi-proyecto
    status_field_id: PVTF_lADOBQjZqs4AhNMvzgMQzlA
    status_in_progress: "In Progress"
    status_done: "Done"
```

---

### `rules` [v2]

Guardrails y reglas de desarrollo enforzadas por hooks de Forge.

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `forbidden_in_production` | array \| null | null | Strings o patrones que no deben aparecer en código de producción |
| `required_review_before_ship` | boolean \| null | null | Requiere revisión humana antes de ship |
| `require_spec_before_implementation` | boolean \| null | null | Requiere spec aprobada antes de implementar |
| `conventional_commits` | boolean \| null | null | Enforza formato Conventional Commits |
| `forbidden_patterns` | array \| null | null | Regex evaluadas por el hook `pre-edit-check` |

#### Ejemplo `rules`

```yaml
rules:
  forbidden_in_production:
    - "console.log"
    - "debugger"
    - "TODO:"
    - "FIXME:"
    - ".env.local"
  required_review_before_ship: true
  require_spec_before_implementation: true
  conventional_commits: true
  forbidden_patterns:
    - "eval\\("
    - "process\\.env\\.[A-Z_]+\\s*=\\s*['\"][^'\"]+['\"]"
    - "password\\s*=\\s*['\"][^'\"]{4,}['\"]"
```

---

### `scripts` [v2]

Comandos de verificación ejecutados automáticamente por hooks de Forge.

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `check` | string \| null | null | Comando ejecutado por `post-turn-check.sh` después de cada turno del agente |

#### Ejemplo `scripts`

```yaml
scripts:
  check: "pnpm typecheck && pnpm lint"
```

Para proyectos Python:

```yaml
scripts:
  check: "ruff check . && mypy src/"
```

---

### `agent_paths`

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `api` | string \| null | null | Directorio del agente backend/API |
| `frontend` | string \| null | null | Directorio del agente frontend |
| `admin` | string \| null | null | Directorio del agente admin |
| `mobile` | string \| null | null | Directorio del agente mobile |
| `scanner` | string \| null | null | Directorio del agente scanner/crawler |

---

### `compliance`

| Campo | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `frameworks` | array \| null | null | Frameworks regulatorios: `gdpr`, `lgpd`, `ley-21719`, `ccpa` |
| `pii_handling` | boolean \| null | null | El proyecto maneja PII |
| `audit_logs` | boolean \| null | null | Requiere logs inmutables de auditoría |

---

## Migración desde v1

Usar el script de migración automática:

```bash
# Ver qué cambiaría (sin modificar el archivo)
python3 .agentic/scripts/forge-migrate-project-yaml.py --dry-run

# Migrar con backup
python3 .agentic/scripts/forge-migrate-project-yaml.py --backup

# Migrar directamente
python3 .agentic/scripts/forge-migrate-project-yaml.py
```

El script:
1. Detecta si el archivo es v1 (ausencia de `rules`, `mcp`, `github` o `project.mode`)
2. Agrega todas las secciones nuevas con valores `null` o defaults razonables
3. Preserva todo el contenido existente sin modificarlo
4. Agrega comentarios explicativos en cada campo nuevo

Después de migrar, validar con:

```bash
python3 .agentic/scripts/forge-validate-project-yaml.py
```

Para output legible por máquina:

```bash
python3 .agentic/scripts/forge-validate-project-yaml.py --json
```

---

## JSON Schema

El schema completo está en `core/schemas/project.schema.json` (Draft-07).

Para validar con `jsonschema` instalado:

```bash
pip install jsonschema
python3 .agentic/scripts/forge-validate-project-yaml.py
```

Sin `jsonschema`, el script hace validación manual de los campos críticos (tipos, enums, campos requeridos, formatos de URL y regex).
