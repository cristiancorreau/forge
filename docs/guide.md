[English](en/guide.md) · **Español**

# forge — Guía de uso

> Última actualización: 2026-06-03

---

## Qué es forge

Framework reutilizable de agentes, skills y workflows para proyectos de software.
Tecnología agnóstica (TypeScript, Python, Ruby, Go). Se instala en cada proyecto con
`npx @cristiancorreau/forge` y se configura con un único archivo `project.yaml`.

```
proyecto/
├── project.yaml       ← fuente de verdad del proyecto
├── CLAUDE.md          ← generado por forge
├── .forge/            ← manifest de la instalación
└── .claude/
    ├── agents/        ← agentes instalados por forge
    └── commands/      ← slash commands instalados por forge
```

Desde la **v2.8.0** la CLI es 100% TypeScript (sin Python) y se ejecuta con
`npx @cristiancorreau/forge <comando>`.

---

## Comandos

La CLI expone los siguientes comandos. Todos corren sobre Node/Bun (Node.js 20+).

| Comando | Qué hace | Flags principales |
|---------|----------|-------------------|
| `forge init` | Wizard interactivo que genera `project.yaml` e instala agentes, comandos y skills. Al terminar abre un **dashboard post-install** interactivo. | — |
| `forge generate` | Regenera la configuración nativa de cada runtime activo a partir de `project.yaml`. | `--runtime <id>`, `--dry-run`, `--force` |
| `forge audit` | Audita los agentes del proyecto contra forge (frontmatter, secciones, similitud, oportunidades). | `--json`, `--only <agente>` |
| `forge export` | Emite el **modelo resuelto** del proyecto (agentes + tools + skills + comandos + MCP servers por runtime). Con `--json` valida contra `export.schema.json` de `@cristiancorreau/forge-schemas`. | `--json` |
| `forge validate` | Valida la estructura y el esquema de `project.yaml`. | `--json` |
| `forge doctor` | Detecta los runtimes instalados (binario + versión) y valida `project.yaml` v2. | `--json` |
| `forge migrate` | Migra `project.yaml` de v1 a v2. | `--dry-run`, `--backup` |
| `forge wiki` | Gestiona el wiki del proyecto. | `status`, `ingest <file>`, `query <q>`, `lint` |
| `forge skills` | Lista las 14 skills disponibles agrupadas por categoría. | `--json`, `--active` |
| `forge aitmpl-search <query>` | Busca en el catálogo curado de frameworks, MCP servers y profiles. | `<query>` |
| `forge scaffold` | Crea un nuevo agente: profile Tier 2 o agente de dominio Tier 3. | `--tier <2\|3>`, `--name <slug>`, `--engineer <agente>`, `--scope-dir <dir>` |
| `forge teardown` | Desinstala forge del proyecto de forma limpia. | `--dry-run` |
| `forge session-start` | Abre la sesión: detecta estado del repo y enruta. | — |
| `forge session-close` | Cierra la sesión: commit → daily note → sync → PR. | — |

### Dashboard post-install

Al finalizar `forge init`, forge abre un panel interactivo (OpenTUI sobre Bun) navegable por
secciones: Overview, agentes instalados, workflow SDD, skills, runtimes e iconos/tech. En
runtimes sin Bun se muestra un resumen estático. Salir con `q` o `Esc`.

---

## Crear un agente Tier 3

Los agentes **Tier 3** conocen el negocio del proyecto (`dsar-specialist`, `gcm-engineer`,
`policy-engineer`, `banner-engineer`). Viven en `.claude/agents/`, no provienen de forge, y se
registran en `agents.specialized` del `project.yaml`.

### Paso 1 — Generar el archivo del agente

```bash
forge scaffold --tier 3 --name dsar-specialist \
  --description "Maneja DSAR bajo Ley 21.719. Scope: src/dsar." \
  --scope-dir src/dsar
```

Crea `.claude/agents/dsar-specialist.md` con el frontmatter completo
(`name`, `description`, `model`, `tools`, `tier: 3`) y las secciones obligatorias
(`## Tu trabajo`, `## Reglas`, `## No hagas`, `## Workflow`) según `docs/agent-standard.md`,
con comentarios guía para completar.

### Paso 2 — Editar el archivo generado

Reemplazá los placeholders: afiná el `description` en una línea (qué hace + scope exacto),
completá `## Tu trabajo`, `## Reglas` y `## No hagas`. No uses `opus` por defecto: `sonnet`
cubre el 90% de los casos.

### Paso 3 — Registrar en project.yaml

```yaml
agents:
  specialized:
    - dsar-specialist
```

### Paso 4 — Validar la consistencia

```bash
forge validate
```

`forge validate` falla (exit 1, CI-safe) si un agente listado en `agents.specialized` no tiene
su archivo en `.claude/agents/<agente>.md`. `forge audit` también reporta la consistencia entre
los archivos instalados y la lista declarada (y nunca compara los Tier 3 contra forge, porque
son propios del proyecto).

> Si ya tenías agentes Tier 3 en `.claude/agents/`, `forge init` los auto-detecta (por su
> frontmatter `tier: 3`) y pre-llena `agents.specialized` al generar el `project.yaml`.

---

## Extensión VS Code

forge tiene una extensión oficial para VS Code que reemplaza el CLI interactivo cuando trabajás desde el editor.

### Instalación

```bash
# Desde la raíz del repo forge
cd vscode-extension
npx vsce package --no-dependencies
code --install-extension forge-agent-framework-0.1.2.vsix
```

Una vez instalada, aparece el ícono **forge** (robot) en la barra de actividad izquierda.

### Panel lateral

La extensión agrega tres vistas bajo el ícono forge:

**Actions** — botones de acceso rápido a todas las operaciones:
- Setup Wizard
- Initialize Agents
- Run Audit
- Search Catalog (MCP / Profiles)
- Show Project Status

**Project** — información del `project.yaml` activo: nombre del proyecto, stack, profiles activados.

**Agents** — lista de agentes instalados en `.claude/agents/` con un botón de audit inline por agente.

### Comandos (Cmd+Shift+P)

| Comando | Equivalente CLI |
|---------|-----------------|
| `forge: Setup Wizard` | `npx @cristiancorreau/forge init` |
| `forge: Initialize Agents` | `npx @cristiancorreau/forge init` |
| `forge: Run Audit` | `npx @cristiancorreau/forge audit` |
| `forge: Audit Specific Agent` | `npx @cristiancorreau/forge audit --only <agent>` |
| `forge: Search Catalog` | `npx @cristiancorreau/forge aitmpl-search <query>` |
| `forge: Install` | `npx @cristiancorreau/forge init` |

### Flujo de audit con selector de oportunidades

Cuando el audit detecta profiles o skills disponibles que el proyecto no usa, la extensión muestra un **QuickPick multi-select** con descripción de cada ítem. Al confirmar la selección:

1. Actualiza `project.yaml` con los profiles/skills elegidos
2. Ofrece "Initialize Agents" para instalar los nuevos agentes inmediatamente

### Configuración

En `Settings > forge`:

| Setting | Por defecto | Descripción |
|---------|-------------|-------------|
| `forge.tool` | `claude-code` | Runtime target (`claude-code`, `opencode`, `kiro`, `codex`, `all`) |
| `forge.autoAuditOnSave` | `false` | Auditar automáticamente al guardar un archivo de agente |

### Estados de la extensión

| Condición | Comportamiento |
|-----------|----------------|
| forge no instalado (`!forge.installed`) | Muestra botón "Install forge" en el panel |
| forge instalado pero sin `project.yaml` | Muestra botón "Setup Wizard" |
| Proyecto activo pero sin agentes | Muestra botón "Initialize Agents" |
| Proyecto completo | Muestra lista de agentes + botón de audit |

---

## Parte 1 — Proyecto nuevo (desde cero)

### Paso 1 — Crear repositorio

```bash
git init mi-proyecto && cd mi-proyecto
```

### Paso 2 — Correr el wizard

```bash
npx @cristiancorreau/forge init
```

El wizard detecta el stack, te pregunta por agentes, profiles y skills, y genera
`project.yaml` + la configuración del runtime. Si preferís configurar a mano
`project.yaml` antes de inicializar, estas son las secciones clave:

```yaml
project:
  name: "Mi Proyecto"
  slug: "mi-proyecto"
  language: "typescript"

stack:
  backend: "hono"       # hono | fastapi | rails | express | null
  frontend: "nextjs"    # nextjs | nuxt | remix | null
  database: "postgresql"

agents:
  active:
    - orchestrator
    - test-engineer
    - docs-writer
  compliance:
    - compliance-reviewer   # si hay datos de usuarios
  profiles:
    - hono-drizzle          # instala api-engineer
    - nextjs-admin          # instala admin-engineer
  specialized: []           # agentes Tier 3 propios del proyecto

skills:
  active:
    - security-audit
    - db-migrate
    - browser-test          # si tienes agent-browser instalado
    - wiki-ingest           # LLM wiki
    - wiki-query
    - wiki-lint
    - new-feature

compliance:
  frameworks: [ley-21719, gdpr]   # vacío si no aplica
  pii_handling: false
  audit_logs: false
```

### Paso 3 — Regenerar la configuración (si editaste project.yaml a mano)

```bash
npx @cristiancorreau/forge generate
```

Esto:
- Instala agentes Tier 2 (profiles) → Tier 1 (core) en `.claude/agents/`
- Genera `AGENTS.md` con el roster completo
- Instala slash commands activos en `.claude/commands/`
- Crea `wiki/` si los skills wiki están activos

### Paso 4 — Commit inicial

```bash
git add .
git commit -m "chore: init project with forge framework"
```

### Paso 5 — Verificar con forge audit

```bash
npx @cristiancorreau/forge audit
```

Un proyecto nuevo recién inicializado debería mostrar **0 gaps**.

---

## Parte 2 — Proyecto existente (ya tiene estructura)

### Paso 1 — Adoptar forge (brownfield)

```bash
# En la raíz del proyecto existente
npx @cristiancorreau/forge adopt
```

`forge adopt` analiza el codebase, genera `project.yaml` desde lo que detecta
(stack, ORM, testing, monorepo, docker) e instala la config de forge sin pisar
archivos existentes (salvo `--force`).

### Paso 2 — Ajustar project.yaml

`forge adopt` ya generó `project.yaml`; editalo con los datos reales del proyecto.
Puntos críticos al configurar un proyecto existente:

- `agents.active` → listar los agentes que ya tenés en `.claude/agents/`
- `agents.profiles` → si ya tenés api-engineer, admin-engineer, etc., declarar los profiles correspondientes
- `agents.specialized` → listar los agentes Tier 3 propios del proyecto
- `skills.active` → solo los skills que querés usar activamente

### Paso 3 — Auditar el estado actual

```bash
npx @cristiancorreau/forge audit
```

El audit muestra:
- **Gaps de frontmatter**: agentes sin campo `tier:` o `model:`
- **Secciones faltantes**: `## Tu trabajo`, `## Reglas`, `## No hagas`
- **Similitud con forge**: qué tan parecidos son tus agentes a la versión forge
- **Oportunidades**: skills o profiles de forge que no estás usando

### Paso 4 — Regenerar (sin --force para preservar lo existente)

```bash
npx @cristiancorreau/forge generate
```

Con el comportamiento por defecto (**sin** `--force`):
- Los agentes que YA EXISTEN en `.claude/agents/` → se preservan (`[KEEP]`)
- Los agentes que FALTAN y forge los tiene → se instalan (`[OK]`)
- `AGENTS.md` se regenera siempre

### Paso 5 — Resolver gaps del audit manualmente

Para cada gap reportado:

| Tipo de gap | Acción |
|-------------|--------|
| Falta `tier:` en frontmatter | Agregar `tier: 1`, `tier: 2` o `tier: 3` según corresponda |
| Falta sección `## Reglas` | Agregar la sección al archivo del agente |
| Agente muy diferente a forge (error) | Revisar si es intencional o desactualizado |
| Agente extendido (info) | Documentar en comentario por qué tiene más contenido |

### Paso 6 — Verificar el resultado final

```bash
npx @cristiancorreau/forge audit
# Objetivo: 0 errores (✗). Las advertencias (⚠) son opcionales.
```

---

## Parte 3 — Cuando forge tiene actualizaciones

### Cuándo actualizar forge en un proyecto

- Al agregar un nuevo skill a forge y querer usarlo
- Al corregir un bug en un agente core
- Periódicamente (por sprint) para no quedar muy atrás

### Proceso de actualización (sin romper nada)

#### Paso 1 — Usar la última versión de forge

`npx @cristiancorreau/forge@latest <cmd>` siempre resuelve la última versión
publicada en npm. Si instalaste el binario global, actualizalo:

```bash
npm install -g @cristiancorreau/forge@latest
```

#### Paso 2 — Auditar antes de aplicar cambios

```bash
npx @cristiancorreau/forge audit
```

Leer el output con atención:
- **info → (extendido)**: tu agente tiene más contenido que forge → no actualizar, es fork intencional
- **warn ⚠ (contenido diferente)**: posiblemente hay mejoras en forge → revisar manualmente
- **error ✗ (desactualizado)**: tu agente es más corto y muy diferente → candidato a actualizar

#### Paso 3 — Actualizar agentes selectivamente

**NUNCA** hacer `forge generate --force` sin revisar primero. Solo actualizar lo que el audit señala como desactualizado:

```bash
# Regenerar con --force (revisar el diff antes de commitear)
npx @cristiancorreau/forge generate --force

# Ver qué cambió antes de aceptar
git diff .claude/agents/docs-writer.md
```

Si el diff es positivo (forge agrega contenido útil), aceptar. Si borra personalizaciones del proyecto, revertir y fusionar manualmente.

#### Paso 4 — Instalar nuevos slash commands o skills

Si forge agregó comandos o skills nuevos que querés usar:

```bash
# 1. Activar en project.yaml
#    skills.active: - nuevo-skill

# 2. Regenerar la configuración
npx @cristiancorreau/forge generate

# 3. Si hay estructura nueva (ej. wiki)
#    forge la crea automáticamente si no existe
```

#### Paso 5 — Commit de la actualización

```bash
# Agrupar en el mismo commit: agentes y comandos actualizados
git add .claude/agents/ .claude/commands/ project.yaml
git commit -m "chore(forge): update agents to forge <version>"
```

---

## Parte 4 — Reglas anti-conflicto

### La regla de oro: tiers determinan quién puede actualizar

| Tier | Dueño | ¿Forge puede sobreescribir? |
|------|-------|----------------------------|
| **Tier 1** (orchestrator, test-engineer…) | forge | Solo con `--force` + revisión manual |
| **Tier 2** (api-engineer, admin-engineer…) | forge (profile) | Solo con `--force` + revisión manual |
| **Tier 3** (tu dominio) | proyecto | NUNCA — forge no los toca |

### Reglas específicas

1. **`--force` requiere audit previo.** Correr `forge audit` antes de cualquier `--force`.

2. **Actualizar forge y agentes en commits separados** si hay muchos cambios. Un commit para el bump de forge, otro para los agentes actualizados. Facilita el revert si algo falla.

3. **Los agentes "extendidos" son fork intencional.** Si tu versión tiene más líneas que forge, es porque la personalizaste. `forge audit` lo muestra como `→ info` (no error). No hay que "arreglarlo".

4. **Nunca editar agentes Tier 1/2 directamente** sin antes pensar si el cambio debería ir en forge. Si el cambio es universal → llevarlo a forge. Si es específico del proyecto → documentarlo como fork intencional con un comentario en el agente.

5. **Mantener `project.yaml` actualizado.** Cada vez que agregas un agente Tier 3, declararlo en `agents.specialized`. Cada vez que activas un skill, declararlo en `skills.active`. Esto permite que `forge audit` tenga un panorama correcto.

6. **El wiki (`docs/wiki/raw/`) es inmutable.** Nunca editar archivos en `raw/`. Solo agregar nuevos.

---

## Referencia rápida de comandos

```bash
# Inicializar el proyecto (wizard + dashboard post-install)
npx @cristiancorreau/forge init

# Auditar estado del proyecto vs forge
npx @cristiancorreau/forge audit

# Regenerar configs nativas tras cambiar project.yaml
npx @cristiancorreau/forge generate

# Validar project.yaml
npx @cristiancorreau/forge validate

# Detectar runtimes instalados y validar project.yaml v2
npx @cristiancorreau/forge doctor

# Migrar project.yaml v1 → v2
npx @cristiancorreau/forge migrate --backup

# Buscar en el catálogo curado
npx @cristiancorreau/forge aitmpl-search <query>

# Wiki
/wiki-ingest <url|archivo|texto>
/wiki-query <pregunta>
/wiki-lint

# Browser automation
agent-browser open <url>
agent-browser snapshot -i
agent-browser screenshot
```

---

## Clasificaciones de forge-audit

| Ícono | Nivel | Significado |
|-------|-------|-------------|
| ✓ | ok | Al día con forge (similitud ≥80%) |
| → | info | Extendido intencionalmente (proyecto tiene >20% más líneas) |
| ⚠ | warn | Diferente pero comparable — revisar si hay mejoras disponibles |
| ✗ | error | Desactualizado o gap crítico — requiere atención |

---

## Uso en CI/CD (sin terminal interactiva)

El dashboard post-install requiere terminal interactiva. Para pipelines de CI, usa los
subcomandos no interactivos directamente:

| Acción | Comando |
|--------|---------|
| Regenerar configs (todos los runtimes activos) | `npx @cristiancorreau/forge generate` |
| Regenerar un runtime específico | `npx @cristiancorreau/forge generate --runtime claude-code` |
| Regenerar (preview, sin escribir) | `npx @cristiancorreau/forge generate --dry-run` |
| Validar project.yaml | `npx @cristiancorreau/forge validate --json` |
| Auditar (legible) | `npx @cristiancorreau/forge audit` |
| Auditar (JSON para CI) | `npx @cristiancorreau/forge audit --json` |
| Falla si hay errores críticos | `npx @cristiancorreau/forge audit --json \| jq -e '.summary.errors == 0'` |
| Teardown (preview) | `npx @cristiancorreau/forge teardown --dry-run` |

### Ejemplo GitHub Actions

```yaml
- name: Audit forge agents
  run: npx @cristiancorreau/forge audit --json | jq -e '.summary.errors == 0'
```

### Contrato JSON y exit codes (SPEC-083)

Los comandos de inspección aceptan `--json` con salida **versionada y estable**:
todas incluyen el campo `schemaVersion: "1"`. Un orquestador externo (p. ej.
mingako) puede consumirlas sin parsear texto humano.

| Comando | Claves estables del `--json` | Exit codes |
|---------|------------------------------|------------|
| `forge export --json` | Modelo resuelto completo — valida contra `export.schema.json` (`forge://schemas/v4/export` en `@cristiancorreau/forge-schemas`): `project`, `agents[]`, `commands[]`, `skills[]`, `mcpServers[]`, `perRuntime` | `0` export generado · `1` error de ejecución (sin `project.yaml` o inválido) |
| `forge audit --json` | `summary {errors, warnings, ok, info}`, `issues[] {level, check, message}` | `0` sin errores de auditoría · `1` con al menos un error |
| `forge doctor --json` | `ok`, `nodeVersion`, `forgeRootOk`, `assetsOk`, `projectYaml`, `configMode`, `runtimes[] {id, installed, version, active}` | `0` entorno sano (`ok: true`) · `1` algún check falló |
| `forge recommend --json` | `stack {language, backend, frontend, …}`, `recommendations[] {type, id, label, installable, why, signal}` | `0` recomendaciones emitidas · `1` error de ejecución o instalación fallida |
| `forge port <runtime> --json` | Matriz de portabilidad: `target`, `targetLabel`, `surfaces[]`, `dimensions[] {id, portability}`, `summary {portable, adapted, vendor, total}` | `0` matriz emitida · `1` error de ejecución (runtime desconocido, sin `project.yaml`) |
| `forge validate --json` | `valid`, `errors[]`, `warnings[]` | `0` válido · `1` inválido |

> Convención general: `0` = ok, `1` = error de ejecución o hallazgos que fallan
> el comando. `audit` y `doctor` ya usaban `1` para "hallazgos/checks fallidos";
> esa convención se mantiene por compatibilidad (no se usa `2`).

**Round-trip estable**: el manifiesto de `forge export --json` depende solo de
`project.yaml` y de los archivos instalados, no de cuándo se generaron. La
secuencia `project.yaml → export → forge generate --force → export` produce el
mismo JSON byte a byte; un orquestador puede cachear el manifiesto y
regenerar superficies sin invalidarlo. El contrato lo fija el test de
round-trip en `packages/cli/test/spec-083-json-contract.test.mjs`.

Ejemplos:

```bash
# Manifiesto resuelto del proyecto (agentes, skills, MCP por runtime)
npx @cristiancorreau/forge export --json > forge-export.json

# ¿El proyecto está sano antes de lanzar un team de agentes?
npx @cristiancorreau/forge doctor --json | jq -e '.ok'
npx @cristiancorreau/forge audit --json | jq -e '.summary.errors == 0'

# ¿Cuánta config sobrevive un cambio de runtime?
npx @cristiancorreau/forge port codex --json | jq '.summary'
```

---

## Estructura del repo forge (referencia)

```
forge/
├── core/
│   ├── agents/          ← Tier 1: orchestrator, test-engineer, docs-writer,
│   │                       compliance-reviewer, security-auditor,
│   │                       backend-engineer, frontend-engineer
│   └── skills/          ← security-audit, db-migrate, browser-test,
│                           wiki-ingest, wiki-query, wiki-lint,
│                           new-feature, spec, phase-kickoff,
│                           local2prod, obsidian-sync
├── profiles/            ← 15 stacks soportados
│   ├── hono-drizzle/    ← api-engineer (Hono + Drizzle + TypeScript)
│   ├── nextjs-admin/    ← admin-engineer (Next.js + shadcn/ui)
│   ├── expo/            ← mobile-engineer (React Native / Expo)
│   ├── playwright-crawler/ ← scanner-engineer
│   ├── laravel/         ← api-engineer + fullstack-engineer + migration-specialist
│   ├── wordpress/       ← wp-engineer + divi-engineer + elementor-engineer
│   └── ...              ← fastapi, django, rails, express, nestjs,
│                           go-gin, vuenuxt, sveltekit, astro
├── adapters/
│   └── claude-code/
│       └── commands/    ← wiki-ingest.md, wiki-query.md, wiki-lint.md
├── templates/
│   ├── project.yaml.tpl
│   └── wiki/            ← index.md, log.md, _templates por tipo
├── packages/
│   └── cli/             ← CLI TypeScript (publicada como @cristiancorreau/forge)
│       ├── src/         ← commands/ (init, generate, audit, adopt, …), lib/, tui/
│       ├── scripts/     ← build-assets.mjs (empaqueta core/, profiles/, …)
│       └── test/        ← suite node:test (commands, assets, adopt, wizard, …)
├── vscode-extension/    ← extensión oficial para VS Code
│   ├── src/extension.ts
│   └── package.json
└── docs/
    ├── agent-standard.md
    └── guide.md         ← estás aquí
```
