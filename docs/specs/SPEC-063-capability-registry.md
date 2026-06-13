# SPEC-063 Registro declarativo de capacidades con tool-contracts

> Estado: APPROVED
> Responsable: forge maintainers
> Creada: 2026-06-13 | Actualizada: 2026-06-13

## Contexto

Del análisis vs Open GSD: su Unit Registry (ADR-033) mapea cada unidad a
`{template, tool contract, manifest, phase}` con un parity-test, y compila
"tool contracts" antes de invocar al LLM. forge coordina agentes Markdown
estáticos; el frontmatter de cada agente ya declara `tools:`, pero no hay un
contrato verificable ni un parity-test entre el registro y los archivos.

forge no necesita orquestación en vivo para capturar el valor: puede elevar lo
que ya existe (frontmatter `tools:`) a un **contrato estático verificado en
compile/audit time**, coherente con su modelo offline-determinístico.

## Decisión

1. **`core/registry/units.yaml`** — registro declarativo que lista cada agente/skill
   con metadata que el frontmatter no expresa: `scope`, `tools` permitidas,
   `outputs` prometidos, `phase` opcional.
2. **`forge audit` valida**:
   - (a) cada unidad del registro tiene su archivo real (`.md`) presente;
   - (b) los `tools` del frontmatter del agente están dentro del contrato declarado;
   - (c) **parity**: no hay agentes/skills en disco ausentes del registro ni viceversa.
3. **Lib pura `lib/unit-registry.ts`** con `loadUnits()` + `checkUnitParity(dir, units)`
   que devuelve `{ok, errors[]}` — reusable por `audit` y por un test.
4. No se adoptan recovery classification ni routing por fase en vivo (requieren
   orquestador; fuera de scope). `phase` queda como metadata declarativa.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Tool contracts compilados pre-dispatch (como GSD) | Validación en vivo | Requiere runtime de ejecución | Fuera del modelo de forge |
| Dejar solo el frontmatter `tools:` | Cero esfuerzo | Sin parity ni outputs prometidos ni verificación | No captura el valor del registry |

## Criterios de aceptación

- [ ] `core/registry/units.yaml` existe y cubre los agentes/skills core.
- [ ] `loadUnits()` y `checkUnitParity()` son puros y testeados.
- [ ] `forge audit` reporta drift de tools fuera de contrato y faltas de parity.
- [ ] Parity-test que falla si se agrega un agente sin registrarlo.
- [ ] Suite completa verde.

## Impacto de compliance

Ninguno. Validación estática de metadata.
