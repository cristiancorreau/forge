# forge vs Open GSD — análisis de gaps y plan de mejora (jun 2026)

> Análisis producido por un equipo multi-agente sobre los repos de
> [Open GSD](https://github.com/open-gsd) (`gsd-core`, `gsd-pi`, `gsd-browser`,
> `gsd-test-runner`, docs/marketplace) comparados con forge.

## Qué es Open GSD

Framework agéntico **"Git. Ship. Done"** centrado en **context engineering** y un
**spec-driven flow ejecutable de extremo a extremo**. Núcleo: `gsd-core` (loop de
fases verificado), `gsd-pi` (orquestación de subagentes con contexto fresco +
persistencia del "big picture"), `gsd-browser` (CLI Rust de automatización de
browser para agentes) y un ecosistema (marketplace, test-runner remoto multi-OS).

## Tabla comparativa

| Dimensión | forge | Open GSD | Adelante |
|---|---|---|---|
| SDD / spec flow | Gate de **entrada** (hook bloquea sin spec APPROVED). Binario. | Loop 5 fases ejecutable, Plan Checker, predicados de cobertura, UAT-backward. | GSD |
| Context engineering / big picture | No tiene (wiki factual + manifest = config estática). | Subagentes con 200K limpios, `.planning/` durable, Pyramid of Relevance, compaction 5:1. | GSD |
| Multi-runtime | Compilador `project.yaml`→19 runtimes, generadores determinísticos. | 16 runtimes + convertidores + capability toggles. | Empate / forge leve |
| Calidad de skills | `forge eval` determinístico, 8 categorías, `--fix`, security pipeline. | No tiene scorer de artefactos de skill. | forge |
| Browser automation | Solo skill `browser-test` que delega. | `gsd-browser`: CLI Rust, 90+ comandos CDP, MCP 50+ tools, evidence bundles. | GSD |
| Distribución / marketplace | Catálogo unificado + `recommend` + manifest lock. | Marketplace (prototype) + registry de extensiones + npm/GHCR/plugins. | Empate |
| Verificación / test remoto | No tiene. | `gsd-test-runner`: Go, containers Linux/Win/macOS sobre SSH, imágenes GHCR + sentinel. | GSD |
| Hooks / guardrails | 3 hooks afilados (branch/secret/spec gate). Zero Python. | Lifecycle hooks que miden presión de contexto, hot-reload, recovery classification. | GSD leve |
| Meta-prompting / orquestación | Orchestrator + agentes Markdown estáticos. | Unit Registry declarativo, tool contracts pre-dispatch, routing por fase. | GSD |
| Wizard CLI / onboarding | OpenTUI (Bun-only) + relaunch frágil; se descuadra en Windows PowerShell. | `@clack/prompts` (Node nativo, cross-platform), line-by-line, sin TUI full-screen. | GSD |

**Lectura:** forge gana en su tesis (compilador multi-runtime + scoring determinístico
de calidad). GSD va adelante en context engineering, spec ejecutable, orquestación
declarativa, browser/test runner y robustez del wizard en Windows — pero gran parte
asume un **runtime de ejecución en vivo**, que forge no es (es compilador). Eso define
qué es adoptable.

## Principio rector del plan

forge **no** debe convertirse en orquestador ni reconstruir browser/test-runner
(fuera de scope). Adopta lo que encaja en "compilador desde fuente única,
determinístico y offline": artefactos de estado, contratos estáticos, probes de spec,
robustez del wizard, e **integrar** el ecosistema GSD vía catálogo/MCP en vez de
reconstruirlo.

## Plan de mejora priorizado

| # | Spec | Mejora | Esfuerzo | Prioridad |
|---|---|---|---|---|
| 1 | SPEC-062 | Artefacto `.forge/state/` (STATE/PLAN/CONTEXT) generado desde `project.yaml`+specs, cargado en `session-start`, en el manifest SHA-256. Ataca context rot por la vía de un compilador. | M | now |
| 2 | SPEC-063 | Registro declarativo de capacidades con tool-contract metadata, validado por `forge audit` (parity-test estilo Unit Registry). Eleva `tools:` del frontmatter a contrato verificable en compile-time. | M | now |
| 3 | SPEC-064 | `spec-probe`: gate de SALIDA determinístico (reusa `forge eval`) que valida que los criterios de aceptación de la spec sean verificables. | M | now |
| 4 | SPEC-065 | Wizard confiable en Windows: `@clack/prompts` como default en todos lados, OpenTUI opt-in (`FORGE_ENABLE_OPENTUI=1`), sin relaunch frágil. | M | now |
| 5 | — | Sentinel de versión de herramienta/imagen como guardrail en hooks. | S | next |
| 6 | — | Catalogar `gsd-browser` (MCP) y `gsd-test-runner` en el catálogo + `recommend`. | S | next |
| 7 | — | Hooks PreCompact/Stop que emiten señales de headroom y re-anclan a `.forge/state/`. | S | later |

Las 4 primeras (now) se especifican en `docs/specs/SPEC-062..065` y se ejecutan en paralelo.
