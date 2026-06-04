# forge — Guía de uso

> Última actualización: 2026-06-03

---

## Qué es forge

Framework reutilizable de agentes, skills y workflows para proyectos de software.
Tecnología agnóstica (TypeScript, Python, Ruby, Go). Se integra en cada proyecto como
**git submodule** en `.agentic/` y se configura con un único archivo `project.yaml`.

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

La CLI expone los siguientes comandos. Todos corren sobre Node/Bun, sin dependencias de Python.[^python-deprecated]

[^python-deprecated]: Todos los comandos son TypeScript desde la v2.8.0. El `forge.py` y los `scripts/*.py` legacy están deprecados en v2.x y serán removidos en v3.0.0; ver [MIGRATION.md](../MIGRATION.md).

| Comando | Qué hace | Flags principales |
|---------|----------|-------------------|
| `forge init` | Wizard interactivo que genera `project.yaml` e instala agentes, comandos y skills. Al terminar abre un **dashboard post-install** interactivo. | — |
| `forge generate` | Regenera la configuración nativa de cada runtime activo a partir de `project.yaml`. | `--runtime <id>`, `--dry-run`, `--force` |
| `forge audit` | Audita los agentes del proyecto contra forge (frontmatter, secciones, similitud, oportunidades). | `--json`, `--only <agente>` |
| `forge validate` | Valida la estructura y el esquema de `project.yaml`. | `--json` |
| `forge doctor` | Detecta los runtimes instalados (binario + versión) y valida `project.yaml` v2. | — |
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
| `forge: Install` | `git submodule add ...` |

### Flujo de audit con selector de oportunidades

Cuando el audit detecta profiles o skills disponibles que el proyecto no usa, la extensión muestra un **QuickPick multi-select** con descripción de cada ítem. Al confirmar la selección:

1. Llama a `scripts/forge-add-opportunities.py` para actualizar `project.yaml`
2. Ofrece "Initialize Agents" para instalar los nuevos agentes inmediatamente

### Configuración

En `Settings > forge`:

| Setting | Por defecto | Descripción |
|---------|-------------|-------------|
| `forge.forgePath` | `.agentic` | Ruta a la instalación de forge (relativa al workspace) |
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

### Paso 1 — Crear repositorio e integrar forge

```bash
git init mi-proyecto && cd mi-proyecto
git submodule add https://github.com/cristiancorreau/forge .agentic
pip3 install -r .agentic/requirements.txt   # pyyaml
```

### Paso 2 — Configurar project.yaml

```bash
cp .agentic/templates/project.yaml.tpl project.yaml
```

Editar el archivo con los datos del proyecto. Secciones clave:

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

### Paso 3 — Inicializar

```bash
python3 .agentic/scripts/forge-init.py --tool claude-code
```

Esto:
- Instala agentes Tier 2 (profiles) → Tier 1 (core) en `.claude/agents/`
- Genera `AGENTS.md` con el roster completo
- Instala slash commands activos en `.claude/commands/`
- Crea `docs/wiki/` si los skills wiki están activos

### Paso 4 — Instalar pre-commit hook (opcional pero recomendado)

```bash
cp .agentic/hooks/pre-commit .githooks/pre-commit
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks
```

### Paso 5 — Commit inicial

```bash
git add .
git commit -m "chore: init project with forge framework"
```

### Paso 6 — Verificar con forge-audit

```bash
python3 .agentic/scripts/forge-audit.py --forge .agentic
```

Un proyecto nuevo recién inicializado debería mostrar **0 gaps**.

---

## Parte 2 — Proyecto existente (ya tiene estructura)

### Paso 1 — Agregar forge como submodule

```bash
# En la raíz del proyecto existente
git submodule add https://github.com/cristiancorreau/forge .agentic
pip3 install -r .agentic/requirements.txt
```

### Paso 2 — Crear project.yaml desde el template

```bash
cp .agentic/templates/project.yaml.tpl project.yaml
# Editar con los datos reales del proyecto
```

Puntos críticos al configurar un proyecto existente:

- `agents.active` → listar los agentes que ya tenés en `.claude/agents/`
- `agents.profiles` → si ya tenés api-engineer, admin-engineer, etc., declarar los profiles correspondientes
- `agents.specialized` → listar los agentes Tier 3 propios del proyecto
- `skills.active` → solo los skills que querés usar activamente

### Paso 3 — Auditar el estado actual (SIN inicializar todavía)

```bash
python3 .agentic/scripts/forge-audit.py --forge .agentic
```

El audit muestra:
- **Gaps de frontmatter**: agentes sin campo `tier:` o `model:`
- **Secciones faltantes**: `## Tu trabajo`, `## Reglas`, `## No hagas`
- **Similitud con forge**: qué tan parecidos son tus agentes a la versión forge
- **Oportunidades**: skills o profiles de forge que no estás usando

### Paso 4 — Inicializar (sin --force para preservar lo existente)

```bash
python3 .agentic/scripts/forge-init.py --tool claude-code
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
python3 .agentic/scripts/forge-audit.py --forge .agentic
# Objetivo: 0 errores (✗). Las advertencias (⚠) son opcionales.
```

---

## Parte 3 — Cuando forge tiene actualizaciones

### Cuándo actualizar forge en un proyecto

- Al agregar un nuevo skill a forge y querer usarlo
- Al corregir un bug en un agente core
- Periódicamente (por sprint) para no quedar muy atrás

### Proceso de actualización (sin romper nada)

#### Paso 1 — Actualizar el submodule

```bash
git -C .agentic pull origin main
```

#### Paso 2 — Auditar antes de aplicar cambios

```bash
python3 .agentic/scripts/forge-audit.py --forge .agentic
```

Leer el output con atención:
- **info → (extendido)**: tu agente tiene más contenido que forge → no actualizar, es fork intencional
- **warn ⚠ (contenido diferente)**: posiblemente hay mejoras en forge → revisar manualmente
- **error ✗ (desactualizado)**: tu agente es más corto y muy diferente → candidato a actualizar

#### Paso 3 — Actualizar agentes selectivamente

**NUNCA** hacer `forge-init.py --force` sin revisar primero. Solo actualizar lo que el audit señala como desactualizado:

```bash
# Actualizar un agente específico
python3 .agentic/scripts/forge-init.py --tool claude-code --force --only=docs-writer

# Ver qué cambió antes de aceptar
git diff .claude/agents/docs-writer.md
```

Si el diff es positivo (forge agrega contenido útil), aceptar. Si borra personalizaciones del proyecto, revertir y fusionar manualmente.

#### Paso 4 — Instalar nuevos slash commands o skills

Si forge agregó comandos o skills nuevos que querés usar:

```bash
# 1. Activar en project.yaml
#    skills.active: - nuevo-skill

# 2. Reinstalar comandos
python3 .agentic/scripts/forge-init.py --tool claude-code

# 3. Si hay estructura nueva (ej. wiki)
#    forge-init.py la crea automáticamente si no existe
```

#### Paso 5 — Commit del bump de submodule

```bash
# Agrupar en el mismo commit: submodule + agentes actualizados
git add .agentic .claude/agents/ .claude/commands/ project.yaml
git commit -m "chore(forge): bump submodule to <hash> + update <agents>"
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

1. **`--force` requiere audit previo.** Correr forge-audit antes de cualquier `--force`.

2. **Actualizar submodule y agentes en commits separados** si hay muchos cambios. Un commit para el bump de `.agentic`, otro para los agentes actualizados. Facilita el revert si algo falla.

3. **Los agentes "extendidos" son fork intencional.** Si tu versión tiene más líneas que forge, es porque la personalizaste. forge-audit lo muestra como `→ info` (no error). No hay que "arreglarlo".

4. **Nunca editar agentes Tier 1/2 directamente** sin antes pensar si el cambio debería ir en forge. Si el cambio es universal → llevarlo a forge. Si es específico del proyecto → documentarlo como fork intencional con un comentario en el agente.

5. **Mantener `project.yaml` actualizado.** Cada vez que agregas un agente Tier 3, declararlo en `agents.specialized`. Cada vez que activas un skill, declararlo en `skills.active`. Esto permite que forge-audit tenga un panorama correcto.

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
├── scripts/
│   ├── forge-init.py
│   ├── forge-audit.py
│   ├── forge-wizard.py
│   ├── forge-scaffold-profile.py
│   ├── forge-teardown.py
│   ├── forge-add-opportunities.py  ← aplica profiles/skills seleccionados
│   ├── aitmpl-search.py            ← catálogo curado (MCP, profiles, tools)
│   └── token-stats.py
├── vscode-extension/    ← extensión oficial para VS Code
│   ├── src/extension.ts
│   └── package.json
└── docs/
    ├── agent-standard.md
    └── guide.md         ← estás aquí
```
