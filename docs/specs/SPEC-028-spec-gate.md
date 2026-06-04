# SPEC-028 Barrera técnica spec-first (spec gate)

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-03 | Actualizada: 2026-06-03

## Contexto

Forge declara que el desarrollo es "spec-first": ninguna tarea de código debe
arrancar sin una spec APPROVED en `docs/specs/`. Hoy esa regla vive solo como
convención en la documentación de los agentes; no hay barrera técnica que la
respalde (issue #28). Sin un mecanismo automatizado el equipo depende de
disciplina manual, lo que crea riesgo operacional de saltear el flujo SDD.

## Decisión

Agregar un gate spec-first **backward-compatible** y **opt-in**:

1. Extender `core/hooks/pre-edit-check.js` y `core/hooks/pre-edit-check.py` para
   que, al editar código no-documental en una rama feature, verifiquen que
   exista una spec APPROVED en `docs/specs/`.
   - **Por defecto: advertencia** (no bloquea, CI sigue verde).
   - **Escala a bloqueo (exit 2) SOLO** cuando `mode=enterprise` Y
     `rules.require_spec_before_implementation: true`.
2. Registrar el comportamiento en `core/hooks/hooks-registry.yaml` (el hook ya
   está en `universal`; se documenta la nueva responsabilidad).
3. Agregar `.github/pull_request_template.md` con campos para spec y review.
4. Agregar workflow `.github/workflows/spec-gate.yml` **informativo / no
   bloqueante** que recuerda referenciar la spec en el PR. Documentar cómo
   volverlo `required`.
5. Documentar el flujo en `CONTRIBUTING.md` y en `docs/spec-gate-flow.md`.
6. Tests del hook (caso sin spec → warn; con spec APPROVED → ok; enterprise sin
   spec → block).

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Bloquear siempre que falte spec | Garantía fuerte | Rompe CI verde y merges por defecto; no backward-compatible | Viola el requisito de barrera opt-in |
| Solo workflow required en CI | Centralizado | No protege la edición local; fricción alta de entrada | Se prefiere defensa en profundidad warn-first |
| Warn por defecto + block opt-in (elegida) | Backward-compatible, defensa en profundidad, adoptable gradualmente | El bloqueo duro requiere opt-in explícito | — |

## Criterios de aceptación

- [ ] `pre-edit-check.py` y `pre-edit-check.js` validan existencia de spec APPROVED cuando se modifica código en rama feature
- [ ] Por defecto solo advierten; bloquean (exit 2) solo en mode=enterprise con el flag opt-in
- [ ] Template de PR tiene fields para spec y review status
- [ ] Workflow `spec-gate.yml` informativo y no bloqueante por defecto, con instrucciones para volverlo required
- [ ] CONTRIBUTING.md actualizado con el flujo spec-first
- [ ] Docs: `docs/spec-gate-flow.md` explica el gate end-to-end
- [ ] Tests: casos sin spec (warn), con spec APPROVED (ok), enterprise sin spec (block)

## Impacto de compliance

- No aplica (cambio de tooling interno; no procesa datos personales).

## Dependencias

- Ninguna. El hook reutiliza el lector minimal de `project.yaml` ya presente en `pre-bash-check.js`.

## Notas de implementación

- El gate duro es opt-in para no romper el CI verde ni bloquear merges por
  defecto, según el alcance acordado para el issue #28.
- El workflow CI es informativo; `docs/spec-gate-flow.md` documenta cómo
  promoverlo a check `required` vía branch protection.
