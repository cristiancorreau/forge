# SPEC-066 Guard de consistencia de gestor de paquetes

> Estado: APPROVED
> Responsable: forge maintainers
> Creada: 2026-06-13 | Actualizada: 2026-06-13

## Contexto

Del análisis vs Open GSD: su `gsd-test-runner` usa un "sentinel" de versión de
imagen que cierra la clase de fallo "herramienta stale produce resultado
incorrecto en silencio". forge no guarda versiones en `project.yaml` (solo
nombres de herramienta), así que el sentinel de versión exacto no aplica. Pero
sí aplica la **misma clase de fallo** con los gestores de paquetes: si el
proyecto declara `pnpm` y un comando corre `npm install`, se genera un lockfile
distinto y resultados inconsistentes.

## Decisión

Extender el hook `core/hooks/pre-bash-check.js` con una verificación **advisory**
(nunca bloquea, exit 0): si un comando que afecta el lockfile (`install/i/ci/add/update`)
usa un gestor de paquetes distinto al declarado en `stack.package_manager`,
emite una advertencia. No toca la lógica destructiva existente.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Sentinel de versión exacta (como GSD) | Cierra el caso completo | `project.yaml` no guarda versiones | Sin datos para implementarlo |
| Bloquear el comando inconsistente | Fuerte | Falsos positivos legítimos | Es advisory, no destructivo |

## Criterios de aceptación

- [ ] Comando con PM distinto al declarado → advertencia (exit 0).
- [ ] Comando con el PM declarado, o sin `stack.package_manager` → sin ruido.
- [ ] No altera el comportamiento de bloqueo destructivo existente.
- [ ] Test que cubre match y no-match.

## Impacto de compliance

Ninguno.
