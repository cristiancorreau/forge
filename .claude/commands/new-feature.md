# new-feature

> **Atajo de orquestación.** Este comando NO es un flujo competidor: es un wrapper que delega
> en el pipeline SDD canónico `/plan` → `/work` → `/review` → `/ship`. Usa el mismo template de
> spec (`core/templates/spec-template.md`) y la misma máquina de estados
> (`DRAFT` → `REVIEW` → `APPROVED` → `IMPLEMENTED`). No dupliques aquí lógica de esos comandos:
> invocá cada uno en su etapa.

Inicia la implementación de una nueva feature siguiendo SDD (Spec-Driven Development).

Argumentos: $ARGUMENTS — nombre de la feature o ruta a la spec existente.

1. **Spec** — Si no existe spec para "$ARGUMENTS" en `docs/specs/`, ejecutar `/plan <fase> "$ARGUMENTS"` para crearla (queda en `APPROVED`). Si ya existe, leerla.
2. **Implementación** — Ejecutar `/work` para implementar la spec aprobada. Propone el team, espera aprobación e implementa con tests junto a la implementación, no al final. `/work` marca la spec como `IMPLEMENTED` y completa "Notas de implementación".
3. **Review** — Ejecutar `/review` para obtener el veredicto vinculante (persiste en `.claude/review-status.json`).
4. **Ship** — Si el review resultó `APPROVED` y el usuario lo pide, ejecutar `/ship` para el deploy.
