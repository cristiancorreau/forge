# SPEC-058 Meta-skills de autoría (skill-creator / skill-improver)

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-08 | Actualizada: 2026-06-08
> Origen: análisis de `asm` (skill-creator, skill-auto-improver) · Depende de: SPEC-053 (forge eval)

## Contexto

`forge eval` (SPEC-053) ya mide la calidad de un `SKILL.md` (7 categorías, grade
A–F, gate `overall>=75 AND min(categoría)>=6`). Lo que falta es el **flujo de
autoría** que use ese scorer: cómo crear una skill nueva que pase el gate y cómo
mejorar una existente hasta pasarlo. El análisis de `asm` mostró dos meta-skills
maduras para esto (`skill-creator`, `skill-auto-improver`).

Sin ellas, el autor de una skill tiene la regla (el scorer) pero no el método.
Portarlas como skills propias cierra el ciclo "compile + maintain con calidad
medible": forge no solo evalúa, ahora guía la autoría hacia el estándar.

## Decisión

Dos skills nuevas en `core/skills/`, instalables vía catálogo, que delegan en
`forge eval` (no reimplementan scoring):

1. **`forge-skill-creator`** — flujo guiado para crear un `SKILL.md` desde cero:
   capturar intención → escribir frontmatter + body → `forge eval --json` →
   iterar la categoría más débil hasta pasar el gate.
2. **`forge-skill-improver`** — flujo para mejorar un `SKILL.md` existente:
   baseline con `forge eval --json` → `forge eval --fix` (arreglos mecánicos
   reversibles) → corregir la categoría más débil de a una → re-eval → loop con
   tope de iteraciones y condiciones de parada (pasa / sin avance / cap).

### Reglas
- Las skills **delegan en `forge eval`**; cero scoring nuevo.
- Ambas deben **pasar su propio gate** (`forge eval` ≥75, min categoría ≥6):
  dogfooding verificado por test.
- Se registran en `catalog.ts` (categoría "Desarrollo"), con slash commands en
  `adapters/claude-code/commands/`.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Comandos del CLI (`forge skill-create`) | integrado | el flujo es conversacional, no mecánico | un comando no guía la redacción |
| Portar las 7 skills meta de asm | cobertura total | upstream-pr/index-updater no aplican a forge | fuera de alcance (sin índice de repos) |
| **Dos skills de autoría sobre `forge eval`** | cierra el ciclo, reusa el scorer | mantener 2 SKILL.md | **elegida** |

## Criterios de aceptación
- [ ] `core/skills/forge-skill-creator/SKILL.md` y `forge-skill-improver/SKILL.md` existen y se empaquetan en assets.
- [ ] Ambas registradas en `catalog.ts` y aparecen como `installable` en el catálogo.
- [ ] Ambas **pasan `forge eval`** (gate ≥75 / min ≥6) — test que lo verifica (dogfooding).
- [ ] Slash commands en `adapters/claude-code/commands/`.
- [ ] `installSkill` las instala (agrega a `project.yaml`); test de instalación.
- [ ] `tsc` + `npm test` verdes (incl. Windows).

## No-objetivos
- Reimplementar el scorer (vive en `lib/skill-eval.ts`).
- Portar las meta-skills de catálogo de repos de asm (`skill-index-updater`,
  `refresh-index`, `skill-upstream-pr`): sirven a un modelo que forge no adopta.

## Impacto de compliance
No aplica. Las skills son documentación instalable; `forge eval --fix` es reversible (`.bak`). Sin red ni telemetría.
