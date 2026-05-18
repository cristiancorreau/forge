# Runtimes soportados por forge

forge genera configuración nativa para 4 runtimes de IA. Cada runtime tiene su propio adapter
en `adapters/<runtime>/` que lee `project.yaml` y produce los archivos que espera ese tool.

## Tabla de soporte

| Runtime | Generador | Archivos generados | Nivel de soporte |
|---------|-----------|-------------------|-----------------|
| [Claude Code](#claude-code) | `adapters/claude-code/generate-claude-md.py` | `CLAUDE.md`, `.claude/agents/`, `.claude/commands/`, `.claude/settings.json` | Completo |
| [OpenCode](#opencode) | `adapters/opencode/generate-agents-md.py` | `AGENTS.md` | Soportado |
| [Codex CLI](#codex-cli) | `adapters/codex/generate-codex-config.py` | `AGENTS.md` | Soportado |
| [Kiro](#kiro) | `adapters/kiro/generate-steering.py` | `.kiro/steering/*.md` | Monitoring |

---

## Claude Code

**Soporte: completo — todas las features de forge**

El runtime principal de forge. Genera:

- `CLAUDE.md` — contexto del proyecto (stack, agentes, SDD workflow, fases)
- `.claude/agents/*.md` — agentes con frontmatter y scope inyectados
- `.claude/commands/*.md` — slash commands para skills activos
- `.claude/settings.json` — permisos pre-configurados según el stack

Soporta todos los agentes de forge (Tier 1 core, Tier 2 profiles, Tier 3 especializados),
slash commands, teams paralelos y todas las integraciones.

Adapter: `adapters/claude-code/generate-claude-md.py`

---

## OpenCode

**Soporte: comandos seriales, sin teams paralelos**

OpenCode lee `AGENTS.md` desde la raíz del repositorio. El adapter genera este archivo con:

- Stack del proyecto
- Reglas globales para todos los agentes
- Roster completo con descripciones leídas desde los `.md` de forge
- Sección de compliance si hay frameworks activos

Limitaciones respecto a Claude Code:
- No soporta teams paralelos de agentes
- No hay slash commands propios de forge (OpenCode tiene su propio sistema de comandos)
- Las instrucciones van en un único `AGENTS.md`, sin archivos separados por agente

Adapter: `adapters/opencode/generate-agents-md.py`

---

## Codex CLI

**Soporte: prompt templates, SDD workflow inline, reglas de autonomía**

Codex CLI (OpenAI) lee `AGENTS.md` desde la raíz. El adapter genera un archivo enriquecido
respecto al de OpenCode porque Codex opera autónomamente en terminal:

- Incluye sección "Workflow SDD" con pasos explícitos
- Incluye "Reglas de seguridad" y "Límites de autonomía" inline
- El header identifica explícitamente el archivo como generado para Codex CLI

Limitaciones:
- No soporta slash commands de forge
- No hay scope por agente (todo va en un único AGENTS.md)

Adapter: `adapters/codex/generate-codex-config.py`

Referencia: https://github.com/openai/codex

---

## Kiro

**Soporte: monitoring — steering docs + hooks, sin slash commands**

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

Adapter: `adapters/kiro/generate-steering.py`

---

## forge-generate-all.py — Punto de entrada unificado

Después de modificar `project.yaml` (cambio de modo, nuevo agente, nuevo profile), regenerar
la configuración para todos los runtimes activos con un solo comando:

```bash
# Regenerar todos los runtimes detectados automáticamente
python3 scripts/forge-generate-all.py

# Regenerar solo un runtime específico
python3 scripts/forge-generate-all.py --runtime claude-code
python3 scripts/forge-generate-all.py --runtime kiro

# Ver qué se generaría sin escribir archivos
python3 scripts/forge-generate-all.py --dry-run

# Sobreescribir archivos existentes
python3 scripts/forge-generate-all.py --force
```

### Detección automática de runtimes

El script detecta qué runtimes están instalados por los archivos presentes en el proyecto:

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
python3 scripts/forge-generate-all.py
       ↓
  [claude-code] → CLAUDE.md
  [opencode]    → AGENTS.md (formato OpenCode)
  [kiro]        → .kiro/steering/*.md
       ↓
git add -p && git commit
```

### Relación con forge-init.py

`forge-init.py` es para la configuración inicial de un proyecto (instala agentes, genera
settings.json, copia comandos). `forge-generate-all.py` es para regenerar la capa de
traducción `project.yaml → configs nativas` después de cambios, sin rehacer el init completo.
