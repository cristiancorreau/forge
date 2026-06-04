<!--
  Plantilla de PR de forge — flujo spec-first (SDD).
  Ver docs/spec-gate-flow.md para el gate completo.
-->

## Spec

<!-- Referenciá la spec aprobada que respalda este cambio. Formato: docs/specs/<id>-<slug>.md -->

- Spec: `docs/specs/XXX-titulo.md`
- [ ] La spec referenciada está en estado **APPROVED**

## Review status

- [ ] Ejecuté `/review` y el veredicto es **APPROVED** (sin veto de compliance activo)

## Cambios

<!-- Qué cambiaste y cómo lo verificaste (tests, build, etc.) -->

## Checklist

- [ ] Los tests pasan localmente (`cd packages/cli && bun run build:all && bun run test`)
- [ ] El cambio respeta el alcance de la spec (sin features fuera de spec)
- [ ] Conventional Commits en los mensajes

<!--
  El check "spec-gate" de CI es informativo (no bloqueante) por defecto.
  Para volverlo obligatorio, ver "Hacerlo required" en docs/spec-gate-flow.md.
-->
