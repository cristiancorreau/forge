# CLAUDE.md — forge

> Generado por forge. Actualizar project.yaml para cambiar la configuración.

## Misión del proyecto

Framework de desarrollo agéntico multi-runtime (Claude Code, OpenCode, Codex, Kiro). CLI TypeScript + legacy Python en migración.

## Stack

- **Lenguaje**: mixed
- **Backend**: N/A
- **Frontend**: N/A
- **Base de datos**: N/A
- **Testing**: vitest, pytest

## Agentes y su scope

| Agente | Scope | Cuándo usarlo |
|--------|-------|---------------|
| `forge-cli-engineer` | `/` | implementación |
| `forge-docs-engineer` | `/` | implementación |
| `forge-migration-engineer` | `/` | implementación |
| `forge-init-specialist` | `/` | implementación |
| `forge-audit-specialist` | `/` | implementación |
| `forge-catalog-specialist` | `/` | implementación |
| `forge-quality-reviewer` | `/` | implementación |

> Invocar el agente del scope correcto, no el orchestrator, para tareas acotadas.

## Estructura

```
forge/
├── CLAUDE.md                    ← Estás acá
├── AGENTS.md                    ← Convenciones del agent team
├── project.yaml                 ← Config de forge (fuente de verdad)
├── .claude/
│   ├── agents/                  ← Agentes instalados
│   ├── hooks/                   ← Hooks de guardrail (JS, sin Python)
│   ├── commands/                ← Slash commands del flujo SDD
│   └── architecture.rules       ← Convenciones de arquitectura del proyecto
├── docs/specs/                ← Specs de features (requeridas antes de implementar)
└── docs/progress.html              ← Dashboard de progreso
```

## Cómo trabajar (SDD)

1. **Identificá la spec.** Si no está en `docs/specs/`, pará y pedí que se cree.
2. **Leé la spec correspondiente.**
3. **Proponé opciones** para decisiones no cubiertas por la spec.
4. **Esperá aprobación** antes de generar código.
5. **Tests** junto con la implementación, no al final.
6. **Antes de cerrar**: `# ver documentación`, `# ver documentación`.

## Phases activas y estado

- **Sprint actual:** Sprint 1
- **Completadas:** —
- **En curso:** —
- **Pendientes:** —

## Comandos frecuentes

```bash
# ver documentación     # Desarrollo
# ver documentación    # Tests
# ver documentación    # Lint
# ver documentación   # Build
```

## Qué NO hacer

- No implementar sin spec en `docs/specs/`
- No hardcodear tokens, passwords o secrets
- No commits con `console.log` o `print` de depuración
- No hacer force push a main/master
