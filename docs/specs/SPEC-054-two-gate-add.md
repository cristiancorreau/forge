# SPEC-054 Two-gate calidad+seguridad en `forge add` y catálogo

> Estado: IMPLEMENTED
> Responsable: forge-cli-engineer
> Creada: 2026-06-07 | Actualizada: 2026-06-07
> Origen: análisis de `asm` (skill-auto-improver) · Fase: Next · Depende de: SPEC-053

## Contexto

`forge add` (SPEC-045) ya escanea **seguridad** (`skill-security.ts`) antes de
ingestar un `SKILL.md`. Falta la otra mitad: una lectura de **calidad**. El
análisis de `asm` mostró su patrón `skill-auto-improver`: un skill no se considera
"listo" hasta pasar **dos gates ortogonales** —uno de publish-readiness, otro de
quality floor—, lo que evita que un score global alto esconda una dimensión débil.

Sin un gate de calidad, el catálogo curado y `forge add` aceptan skills sin piso
mínimo; la confianza del catálogo (el foso de forge) depende de revisión manual.

## Decisión

### Los dos gates
Un skill pasa el gate combinado solo si pasan **ambos**:

1. **Gate seguridad (ya existe)** — `skill-security.ts`: sin patrones peligrosos
   (exec/spawn/creds/ofuscación) o, si los hay, el usuario confirma explícitamente.
2. **Gate calidad (nuevo, vía SPEC-053)** — `evalSkill()`:
   `overallScore >= UMBRAL` **AND** `min(categories[*].score) >= PISO`
   (defaults propuestos: `UMBRAL=75`, `PISO=6`; configurables en `project.yaml`).
   El `AND` por-categoría es clave: previene que `safety=3` pase escondido tras un
   global alto.

### Dónde aplica
- **`forge add <source>`**: corre ambos gates **read-only** y muestra el reporte
  (seguridad + grade + categoría más débil). Si falla el gate de calidad:
  **advierte** y pide confirmación (`--force` para override). Si falla seguridad:
  el comportamiento actual (confirmación explícita) se mantiene.
- **Marcar `installable: true` en el catálogo unificado**: el gate de calidad es
  **bloqueante** (un item curado por forge debe cumplir el piso). Verificable por
  un test del catálogo.

### Reglas
- Read-only por default; el gate **informa**, no reescribe (los arreglos son de
  `forge eval --fix`, SPEC-053).
- Umbrales configurables pero con defaults sanos; documentados.
- `--force` permite override consciente en `add` (no en el catálogo curado).

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Solo gate de seguridad (status quo) | simple | sin piso de calidad | no eleva confianza del catálogo |
| Gate único por overall score | fácil | esconde dimensiones débiles (safety baja) | el board valora seguridad explícita |
| **Two-gate (seguridad + calidad por-categoría)** | balance, sin falsos OK | dos criterios que mantener | **elegida** |

## Criterios de aceptación
- [ ] `forge add` corre seguridad + calidad y muestra reporte combinado read-only.
- [ ] Gate de calidad usa `evalSkill()` (SPEC-053): `overall >= UMBRAL AND min(cat) >= PISO`.
- [ ] Fallo de calidad en `add` → advertencia + confirmación; `--force` override.
- [ ] Marcar `installable: true` exige pasar el gate de calidad (test del catálogo).
- [ ] Umbrales configurables en `project.yaml` con defaults documentados.
- [ ] `tsc` + `npm test` verdes (incl. Windows).

## Dependencias
**Bloqueada por SPEC-053** (`evalSkill()`). Reusa `skill-security.ts` existente.

## Impacto de compliance
No aplica. Read-only; no introduce red ni telemetría. Refuerza la cadena
reversible/auditable existente (`add` ya pinnea a commit sha para provenance).

## Notas de implementación
Referencia del patrón: `asm/skills/skill-auto-improver/SKILL.md` (sección Gates).
