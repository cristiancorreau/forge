# CLAUDE.md — forge

> Generado por forge. Actualizar project.yaml para cambiar la configuración.

## Misión del proyecto

Framework de desarrollo agéntico multi-runtime (19 runtimes: 4 nativos + 15 basados en reglas). CLI TypeScript + legacy Python en migración.

## Stack

- **Lenguaje**: mixed
- **Backend**: N/A
- **Frontend**: N/A
- **Base de datos**: N/A
- **Testing**: node-test, pytest

## Agentes y su scope

| Agente | Scope | Cuándo usarlo |
|--------|-------|---------------|
| `forge-cli-engineer` | `/` | tareas de su dominio (ver `.claude/agents/forge-cli-engineer.md`) |
| `forge-docs-engineer` | `/` | tareas de su dominio (ver `.claude/agents/forge-docs-engineer.md`) |
| `forge-migration-engineer` | `/` | tareas de su dominio (ver `.claude/agents/forge-migration-engineer.md`) |
| `forge-init-specialist` | `/` | tareas de su dominio (ver `.claude/agents/forge-init-specialist.md`) |
| `forge-audit-specialist` | `/` | tareas de su dominio (ver `.claude/agents/forge-audit-specialist.md`) |
| `forge-catalog-specialist` | `/` | tareas de su dominio (ver `.claude/agents/forge-catalog-specialist.md`) |
| `forge-quality-reviewer` | `/` | tareas de su dominio (ver `.claude/agents/forge-quality-reviewer.md`) |

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
