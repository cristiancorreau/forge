# SPEC-069 `forge init --from` — init no-interactivo (habilitador GUI/CI)

> Estado: APPROVED
> Responsable: forge maintainers
> Creada: 2026-06-13 | Actualizada: 2026-06-13

## Contexto

Del análisis del modo GUI (`docs/analysis/forge-vs-gsd-2026-06.md` y el research
de la extensión): `forge init` es hoy **wizard-only** — siempre lanza
`@clack`/OpenTUI y no acepta respuestas por archivo/flags. Una GUI (webview de la
extensión VS Code y/o app Electron) no puede "pilotear un TTY" de forma testeable.
Se necesita un modo no-interactivo que consuma las mismas respuestas que produce
`runWizard()`. Bonus: habilita `init` en CI.

## Decisión

1. **`forge init --from <answers.json>`**: si se pasa el flag, `init` lee el JSON
   (un `WizardResult`), **salta el wizard** y sigue el mismo camino (buildProjectYaml
   + installers). No relanza bajo Bun ni usa OpenTUI.
2. **Defaults tolerantes** (`lib/init-answers.ts`, función pura `loadAnswers(json)`):
   - `slug` derivado de `name` si falta; `mode`→`standard`, `runtime`→`claude-code`,
     `language`→`typescript` si faltan; arrays (`testing`, `skills`, `profiles`) → `[]`.
   - `profiles` derivado de los frameworks (backend/frontend/mobile) si no viene,
     vía un mapeo compartido en `lib/wizard-flow.ts`.
3. El answers-schema queda documentado (= `WizardResult`). El flag se ignora si ya
   existe `project.yaml` (mismo comportamiento que hoy).

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Pasar cada respuesta como flag | Sin archivo temporal | Decenas de flags, frágil | Un answers-file es más limpio para la GUI |
| Pilotear el TTY del wizard desde la GUI | Sin cambios CLI | No testeable/confiable | Rompe la paridad determinística |

## Criterios de aceptación

- [ ] `forge init --from answers.json` crea `project.yaml` + `.claude/*` sin prompts.
- [ ] `loadAnswers()` es pura: aplica defaults y deriva slug/profiles.
- [ ] El resultado es idéntico al de un wizard con las mismas respuestas (paridad).
- [ ] Sin `--from`, el comportamiento interactivo no cambia.
- [ ] Tests del enabler (answers→project.yaml; defaults; derivación de profiles).

## Impacto de compliance

Ninguno.
