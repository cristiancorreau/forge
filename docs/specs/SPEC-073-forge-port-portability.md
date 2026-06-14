# SPEC-073 `forge port` — portabilidad entre runtimes + reporte

> Estado: APPROVED
> Responsable: forge maintainers
> Creada: 2026-06-14 | Actualizada: 2026-06-14

## Contexto

Un post de la comunidad (Jaime Hernández) planteó la pregunta que todo equipo se
hace antes de casarse con un CLI de IA: los CLIs (Claude Code, Codex, Copilot
Agent, OpenCode, Cursor…) son el nuevo "arnés" del flujo de desarrollo, y MCP se
perfila como el estándar ganador para herramientas — pero hooks, memoria y
automatizaciones siguen siendo vendor-specific. *¿Cuánto de lo que configuras en
uno es portable al otro? ¿Estamos construyendo expertise en el arnés correcto o
acumulando deuda de configuración propietaria?*

forge ya responde esa pregunta por construcción: `project.yaml` es la única
fuente de verdad y la config nativa de cada runtime se **genera** (no se escribe a
mano) vía `registry.ts` → `descriptor.surfaces(config)`. Pero esa respuesta no
está expuesta como herramienta ni cuantificada. Falta el comando que la demuestre.

## Decisión

1. **Lib pura `lib/portability.ts`** con `portabilityMatrix(config, descriptor)`
   → `{target, targetLabel, surfaces[], dimensions[], summary}`. Clasifica cada
   dimensión en tres baldes honestos: `portable` (mismo artefacto sin cambios),
   `adapted` (regenerado por runtime, misma semántica) y `vendor` (sin equivalente,
   manual o se pierde). Target-aware: hooks/context degradan a `vendor` en runtimes
   rules-based; compliance solo aparece si hay frameworks declarados. Incluye
   `renderPortabilityReport()` que produce Markdown determinístico (versión
   inyectada para no romper pureza).
2. **Comando `forge port <runtime> [--report] [--json] [--dry-run] [--force]`**.
   Por defecto genera la config nativa del destino (delegando en `forge generate`,
   mismo code path: hooks, fallback `.githooks`, `.forge/state`) y escribe el
   reporte en `.forge/port/<runtime>-report.md`. `--report` solo reporta; `--json`
   emite la matriz legible por máquina. Registrado en `cli.ts` y en el help (ES+EN).
3. **Doc `docs/portability.md`** que explica las tres categorías y la matriz.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Reescribir `project.yaml` (runtimes.active) automáticamente al portar | Fija el destino | Round-trip de YAML pierde comentarios/formato; muta la fuente sin pedirlo | Riesgoso; se sugiere el edit en su lugar |
| Clasificación binaria portable/vendor | Simple | Deshonesta: borra el caso "adapted" que es el grueso de forge | No refleja la arquitectura real |
| Solo reporte, sin generar config | Menos código | Pierde el valor de "portar de verdad" en un comando | El usuario pidió implementar, no solo describir |

## Criterios de aceptación

- [ ] `portabilityMatrix()` es puro y determinístico; `summary` suma exactamente `total`.
- [ ] `forge port <runtime>` genera la config nativa del destino + el reporte; exit 0.
- [ ] `forge port <runtime> --report` escribe el reporte y NO la config nativa.
- [ ] `forge port <runtime> --json` emite la matriz como JSON estable.
- [ ] Hooks/contexto son `adapted` en runtimes nativos y `vendor` en rules-based.
- [ ] La dimensión compliance solo aparece si hay frameworks declarados.
- [ ] Runtime desconocido o `project.yaml` ausente → exit 1.
- [ ] Tests sobre la matriz y la generación de archivos. Suite completa verde.

## Impacto de compliance

Ninguno. Lee `project.yaml` local y escribe config/reporte en el repo. Sin red, sin LLM.
