[English](../en/runtimes/README.md) · **Español**

# Runtimes soportados por forge

forge genera configuración nativa para 19 runtimes de IA (4 nativos + 15 basados en reglas).
Cada runtime tiene su propio adapter en `adapters/<runtime>/` que lee `project.yaml` y produce
los archivos que espera ese tool.

## Tabla de soporte

### Runtimes nativos (4)

| Runtime | Tipo | Archivos generados | Nivel de soporte |
|---------|------|--------------------|-----------------|
| [Claude Code](#claude-code) | nativo | `CLAUDE.md`, `.claude/agents/`, `.claude/commands/`, `.claude/settings.json` | Completo |
| [OpenCode](#opencode) | nativo | `AGENTS.md` | Soportado |
| [Codex CLI](#codex-cli) | nativo | `AGENTS.md` | Soportado |
| [Kiro](#kiro) | nativo | `.kiro/steering/*.md` | Monitoring |

### Runtimes basados en reglas (15)

| Runtime | ID | Archivo generado | Tipo |
|---------|----|------------------|------|
| Cursor | `cursor` | `.cursor/rules/forge.md` | rules-based |
| Windsurf | `windsurf` | `.windsurf/rules/forge.md` | rules-based |
| GitHub Copilot | `copilot` | `.github/copilot-instructions.md` | rules-based |
| Gemini CLI | `gemini` | `GEMINI.md` | rules-based |
| Zed | `zed` | `.zed/rules.md` | rules-based |
| Cline | `cline` | `.clinerules` | rules-based |
| Aider | `aider` | `CONVENTIONS.md` | rules-based |
| Continue | `continue` | `.continue/rules/forge.md` | rules-based |
| Roo Code | `roo` | `.roo/rules/forge.md` | rules-based |
| Amp | `amp` | `AGENTS.md` | rules-based |
| Augment Code | `augment` | `.augment/rules/forge.md` | rules-based |
| Google Antigravity | `antigravity` | `.antigravity/rules/forge.md` | rules-based |
| OpenClaw | `openclaw` | `.openclaw/rules/forge.md` | rules-based |
| Pi | `pi` | `.pi/rules/forge.md` | rules-based |
| Hermes | `hermes` | `.hermes/rules/forge.md` | rules-based |

## Detección de runtimes (`forge doctor`)

`forge doctor` detecta qué runtimes tenés instalados localmente buscando su binario en el
`PATH` y leyendo su versión. Así sabés qué runtimes podés activar en `project.yaml` antes de
generar configuración.

| Runtime | Binario detectado | Comprobar manualmente |
|---------|-------------------|-----------------------|
| Claude Code | `claude` | `claude --version` |
| OpenCode | `opencode` | `opencode --version` |
| Codex CLI | `codex` | `codex --version` |
| Kiro | IDE (no expone CLI) | abrir la app de Kiro |

```bash
# Reporta runtimes instalados (binario + versión) y valida project.yaml v2
npx @cristiancorreau/forge doctor
```

> Para que forge **genere** configuración para un runtime no hace falta que esté instalado:
> `forge doctor` solo informa el estado del entorno. La generación se controla con
> `runtimes.active` en `project.yaml` y `forge generate`.

---

## Claude Code

**Soporte: completo — todas las features de forge**

**Instalación:** `npm i -g @anthropic-ai/claude-code` (verificar con `claude --version`)

El runtime principal de forge. Genera:

- `CLAUDE.md` — contexto del proyecto (stack, agentes, SDD workflow, fases)
- `.claude/agents/*.md` — agentes con frontmatter y scope inyectados
- `.claude/commands/*.md` — slash commands para skills activos
- `.claude/settings.json` — permisos pre-configurados según el stack

Soporta todos los agentes de forge (Tier 1 core, Tier 2 profiles, Tier 3 especializados),
slash commands, teams paralelos y todas las integraciones.

Generador: `packages/cli/src/lib/generators/claude-code.ts`

---

## OpenCode

**Soporte: comandos seriales, sin teams paralelos**

**Instalación:** `npm i -g opencode-ai` (verificar con `opencode --version`)

OpenCode lee `AGENTS.md` desde la raíz del repositorio. El adapter genera este archivo con:

- Stack del proyecto
- Reglas globales para todos los agentes
- Roster completo con descripciones leídas desde los `.md` de forge
- Sección de compliance si hay frameworks activos

Limitaciones respecto a Claude Code:
- No soporta teams paralelos de agentes
- No hay slash commands propios de forge (OpenCode tiene su propio sistema de comandos)
- Las instrucciones van en un único `AGENTS.md`, sin archivos separados por agente

Generador: `packages/cli/src/lib/generators/opencode.ts`

---

## Codex CLI

**Soporte: prompt templates, SDD workflow inline, reglas de autonomía**

**Instalación:** `npm i -g @openai/codex` (verificar con `codex --version`)

Codex CLI (OpenAI) lee `AGENTS.md` desde la raíz. El adapter genera un archivo enriquecido
respecto al de OpenCode porque Codex opera autónomamente en terminal:

- Incluye sección "Workflow SDD" con pasos explícitos
- Incluye "Reglas de seguridad" y "Límites de autonomía" inline
- El header identifica explícitamente el archivo como generado para Codex CLI

Limitaciones:
- No soporta slash commands de forge
- No hay scope por agente (todo va en un único AGENTS.md)

Generador: `packages/cli/src/lib/generators/codex.ts`

Referencia: https://github.com/openai/codex

---

## Kiro

**Soporte: monitoring — steering docs + hooks, sin slash commands**

**Instalación:** descargar el IDE desde [kiro.dev](https://kiro.dev) (no expone CLI propio)

Kiro IDE lee archivos desde `.kiro/steering/` como contexto persistente en todas
las conversaciones. El adapter genera:

- `.kiro/steering/product.md` — descripción del producto y stack
- `.kiro/steering/structure.md` — estructura del proyecto y workflow SDD
- `.kiro/steering/agents.md` — roster de agentes y responsabilidades
- `.kiro/steering/compliance.md` — reglas de compliance (solo si hay frameworks activos)

Limitaciones:
- Sin slash commands (Kiro no tiene ese concepto)
- Sin scope por agente en archivos separados
- Los archivos existentes no se sobreescriben por defecto (usar `--force`)

Generador: `packages/cli/src/lib/generators/kiro.ts`

---

## forge generate — Punto de entrada unificado

Después de modificar `project.yaml` (cambio de modo, nuevo agente, nuevo profile), regenerar
la configuración para todos los runtimes activos con un solo comando:

```bash
# Regenerar todos los runtimes detectados automáticamente
npx @cristiancorreau/forge generate

# Regenerar solo un runtime específico
npx @cristiancorreau/forge generate --runtime claude-code
npx @cristiancorreau/forge generate --runtime kiro

# Ver qué se generaría sin escribir archivos
npx @cristiancorreau/forge generate --dry-run

# Sobreescribir archivos existentes
npx @cristiancorreau/forge generate --force
```

### Detección automática de runtimes

El CLI detecta qué runtimes están instalados por los archivos presentes en el proyecto:

| Directorio / archivo | Runtime detectado |
|---------------------|------------------|
| `.claude/` | claude-code |
| `.opencode/` | opencode |
| `.kiro/` | kiro |
| `AGENTS.md` (sin `.claude/` ni `.opencode/`) | codex |

Para declarar los runtimes explícitamente (tienen prioridad sobre la auto-detección),
agregar en `project.yaml`:

```yaml
runtimes:
  active:
    - claude-code
    - kiro
```

### Flujo típico

```
project.yaml cambia
       ↓
npx @cristiancorreau/forge generate
       ↓
  [claude-code] → CLAUDE.md
  [opencode]    → AGENTS.md (formato OpenCode)
  [kiro]        → .kiro/steering/*.md
       ↓
git add -p && git commit
```

### Relación con forge init

`forge init` es para la configuración inicial de un proyecto (corre el wizard, instala
agentes, genera settings.json, copia comandos). `forge generate` es para regenerar la capa
de traducción `project.yaml → configs nativas` después de cambios, sin rehacer el init completo.
