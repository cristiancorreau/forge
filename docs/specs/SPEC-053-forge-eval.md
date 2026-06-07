# SPEC-053 `forge eval` — scorer de calidad determinístico de skills

> Estado: DRAFT
> Responsable: forge-cli-engineer
> Creada: 2026-06-07 | Actualizada: 2026-06-07
> Origen: análisis de `asm` (agent-skill-manager) · Fase: Next (no NOW)

## Contexto

Forge hoy puede **instalar** skills (`forge add` con `skill-security.ts` para el
escaneo de seguridad) y curarlas en el catálogo unificado, pero **no mide su
calidad**. El diferenciador frente a `claude-code-setup` (el recomendador oficial
read-only) es que forge "compila **y mantiene**"; mantener con criterio exige una
señal de calidad objetiva, no un juicio ad-hoc.

El análisis de `asm` mostró un scorer determinístico (`asm eval`) maduro: 7
categorías, grade A–F, `--json`, `--fix`. Es read-only, sin red ni telemetría, y
encaja con la rúbrica del dogfood (SPEC-052) como una **métrica mecánica más**.

Sin esto, el catálogo curado depende de inspección manual y `forge add` instala
skills sin ninguna lectura de calidad.

## Decisión

### Motor (función pura)
`packages/cli/src/lib/skill-eval.ts` exporta una función pura
`evalSkill(skillMd: string, opts?): SkillEval` que puntúa un `SKILL.md` en 7
categorías (0–10 c/u), determinística, sin LLM:

| Categoría | Qué chequea (mecánico) |
|-----------|------------------------|
| `structure` | frontmatter válido, name, description, version, body con headings |
| `description` | largo 8–40 palabras, empieza con verbo, trigger phrase, cláusula negativa ("don't use for") |
| `prompt-engineering` | listas/pasos, bloques de código + "example", voz imperativa, body 80–3000 palabras |
| `context-efficiency` | body 120–1500 palabras, referencia archivos externos (2+), bloques <60 líneas, menciona tokens/budget |
| `safety` | 4+ keywords de seguridad, acciones destructivas con confirm/dry-run, sección de prerequisitos |
| `testability` | outputs verificables, criterios de aceptación, escenarios de error |
| `naming` | naming claro, sin abreviaturas, coincide con propósito |

Devuelve `{ overallScore: 0-100, grade: 'A'|...|'F', categories: [{id, score, max}], notes }`.

### Superficies
1. **CLI**: `forge eval <skill-path|github:owner/repo[:subpath]> [--json] [--fix]`.
   - `--json`: contrato estable (snapshot-test).
   - `--fix`: aplica solo arreglos **mecánicos y reversibles** (deja `.bak`):
     normalizar frontmatter, comillas YAML, mover `author`/`version` a `metadata`.
     Nunca reescribe prosa.
2. **Reuso interno**: `forge add` y `forge audit` llaman a `evalSkill()` para
   anexar el grade al reporte (sin bloquear por sí solo — el bloqueo es SPEC-054).

### Reglas
- Determinístico y offline. Sin LLM, sin red (salvo el fetch que ya hace `add`),
  sin telemetría.
- `--fix` solo toca lo mecánico y deja backup. La prosa es del autor.
- Un solo motor: las superficies delegan en `lib/skill-eval.ts` (un test verifica
  que no hay scoring duplicado).

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Eval con LLM (juez) | más matiz | no determinístico, costo, red, varianza | viola offline/determinismo |
| No evaluar (status quo) | cero trabajo | catálogo sin señal de calidad; `add` a ciegas | no cierra el "maintain" |
| **Scorer determinístico portado de asm-eval** | reproducible, offline, testeable | heurístico (no entiende semántica) | **elegida** |

## Criterios de aceptación
- [ ] `lib/skill-eval.ts` es función pura; `forge eval`, `add` y `audit` delegan en ella.
- [ ] 7 categorías implementadas; `overallScore` + `grade` derivados de forma estable.
- [ ] `--json` con shape estable testeado por snapshot.
- [ ] `--fix` solo aplica arreglos mecánicos, deja `.bak`, no toca prosa.
- [ ] Determinístico: misma entrada → misma salida (test).
- [ ] `tsc` + `npm test` verdes (incl. Windows).

## Dependencias
- Reusa `skill-source.ts` (fetch de `github:owner/repo`) y el modelo de `add`.
- Insumo de SPEC-054 (two-gate) y métrica opcional de SPEC-052 (dogfood).

## Impacto de compliance
No aplica. Read-only/determinístico; `--fix` reversible (`.bak`). Sin red nueva ni telemetría.

## Notas de implementación
Referencia de criterios: `asm/skills/skill-auto-improver/references/category-playbook.md`
y `skill-creator/references/{writing-guide,frontmatter-rules}.md` (material de
autoría aplicable a las skills que forge cura).
