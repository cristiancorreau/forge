# Portabilidad entre runtimes (`forge port`)

> ¿Cuánto de lo que configuras en un CLI de IA es portable al siguiente?
> En forge la respuesta es estructural: **`project.yaml` es la única fuente de
> verdad**, y la config nativa de cada runtime se *genera*, no se escribe a mano.

```bash
forge port codex            # genera la config nativa de Codex + reporte de portabilidad
forge port cursor --report  # solo el reporte (no escribe config nativa)
forge port codex --json     # matriz legible por máquina (estable, apta para snapshot)
```

## Las tres categorías

forge no clasifica en "portable vs vendor-lock"; clasifica en tres baldes honestos:

| Categoría | Qué significa | Ejemplos |
|-----------|----------------|----------|
| **portable** | El mismo artefacto sirve a todos los runtimes, sin cambios | `project.yaml`, `docs/specs/`, servidores MCP |
| **adapted** | Se regenera automáticamente por runtime; **misma semántica**, formato/ruta nativos | Agentes, skills, prompts de sistema, contexto `.forge/state` |
| **vendor** | No tiene equivalente en el destino; se pierde o requiere setup manual | `.claude/settings.json`, binding de secrets/env nativos |

La clave: **la deuda no está en la configuración propietaria, está en los
generadores** — un único punto de mantenimiento, reutilizable. Si cambias de
runtime, regeneras desde la fuente; no migras config a mano.

## Matriz por dimensión

`forge port <runtime>` evalúa, según tu `project.yaml` y el runtime destino:

- **project.yaml** — portable (es la entrada, no se copia).
- **Agentes / skills / prompts** — adapted (mismo roster, formato nativo: `CLAUDE.md` ≠ `AGENTS.md` ≠ `.cursor/rules/forge.md`).
- **MCP** — portable (protocolo abierto, consumible por todo runtime con soporte MCP).
- **Hooks / guardrails** — adapted en runtimes nativos (hooks nativos o fallback `.githooks/pre-commit`); **vendor** en runtimes rules-based (sin mecanismo de hooks).
- **Memoria / contexto** — `.forge/state/` es agnóstico; adapted en nativos, vendor en rules-based (no lo inyectan solos).
- **Specs / SDD** — portable (Markdown compartido, nunca se materializa por runtime).
- **Compliance** — adapted cuando declaras frameworks; el enforcement por agente es nativo de Claude Code.
- **Config específica del runtime** — vendor (los settings nativos de cada runtime son su superficie irreducible).

El reporte se escribe en `.forge/port/<runtime>-report.md`.

## Por qué importa

Un equipo con forge mantiene **una sola definición** de agentes, skills, reglas
y compliance en `project.yaml`, y porta a cualquiera de los 19 runtimes con un
comando. La pregunta "¿estamos atrapados en este arnés?" se responde con datos:
el reporte cuantifica exactamente qué se conserva, qué se adapta y qué se pierde.
