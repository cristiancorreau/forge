# SPEC-065 Wizard confiable en Windows — `@clack` default, OpenTUI opt-in

> Estado: APPROVED
> Responsable: forge maintainers
> Creada: 2026-06-13 | Actualizada: 2026-06-13

## Contexto

El wizard de `forge init` usa OpenTUI (Bun-only, full-screen) y, en Node, hace
fallback a `@clack/prompts` tras una lógica de relaunch bajo Bun
(`lib/bun.ts`, ~200 líneas con gates de terminal Windows). En Windows PowerShell
la decoración se descuadra y la experiencia es frágil (issue #74).

El análisis vs Open GSD confirma que su onboarding usa `@clack/prompts` (Node
nativo, line-by-line, cross-platform) y funciona idéntico en todas las plataformas
sin TUI full-screen ni dependencia de Bun. Es el estándar de la industria
(Astro, Vite, SvelteKit).

## Decisión

1. **`@clack/prompts` pasa a ser el default en todos lados.** `forge init` corre el
   wizard de `lib/wizard.ts` por defecto, sin intentar relaunch bajo Bun.
2. **OpenTUI queda opt-in** vía `FORGE_ENABLE_OPENTUI=1` (y solo si corre bajo Bun en
   una terminal capaz). Sin la env var, nunca se relanza.
3. Se simplifica `tryReLaunchWithBun()` en `commands/init.ts`: solo intenta el
   relaunch cuando `FORGE_ENABLE_OPENTUI=1`. La lógica de detección de terminal
   Windows deja de ser un riesgo en el camino por defecto.
4. La paridad del wizard (mismas preguntas/resultado) entre `@clack` y OpenTUI se
   mantiene; el camino por defecto (`@clack`) es el verificado en CI.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Eliminar OpenTUI por completo | Quita ~200 líneas y la dep de Bun | Pierde el panel full-screen que algunos valoran | Se conserva como opt-in en vez de borrar |
| Dejar OpenTUI como default | Mantiene la "magia" | Frágil en Windows; el bug reportado persiste | Rompe la propuesta cross-platform |

## Criterios de aceptación

- [ ] Sin `FORGE_ENABLE_OPENTUI`, `forge init` usa `@clack` y nunca intenta relaunch bajo Bun.
- [ ] Con `FORGE_ENABLE_OPENTUI=1` bajo Bun + terminal capaz, usa OpenTUI.
- [ ] Tests de `shouldRelaunchUnderBun()` (o equivalente) cubren ambos caminos.
- [ ] El help/docs reflejan que OpenTUI es opt-in.
- [ ] Suite completa verde (incluye `bun-relaunch.test.mjs` actualizado).

## Impacto de compliance

Ninguno.
