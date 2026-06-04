# SPEC-033 Panel interactivo de forge

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-04 | Actualizada: 2026-06-04

## Contexto

Hoy la CLI de forge es básicamente un wizard de `init` más algunos comandos de
inspección sueltos (`audit`, `doctor`, `skills`). Un usuario que ya tiene un
proyecto configurado no tiene una vista unificada para entender su estado:
debe correr varios comandos, leer su salida y reconstruir mentalmente el cuadro
completo (configuración, salud, skills disponibles, hooks instalados,
templates).

Queremos convertir la CLI en un **panel interactivo navegable** con cinco
secciones — Configuración, Monitoreo, Búsqueda de skills, Hooks y Templates —
reutilizando la infraestructura OpenTUI que ya existe para el wizard y el
dashboard post-install. Si no la hacemos, la información del proyecto sigue
fragmentada y la curva de aprendizaje del framework sigue alta.

## Decisión

Agregar un comando `forge panel` y hacer que una invocación pelada `forge` (sin
subcomando) abra el panel **cuando existe `project.yaml`** (si no existe, se
mantiene el help/quick-start actual).

El panel tiene dos modos de render:

- **Full-screen OpenTUI (Bun)**: se reutiliza el patrón de `tui/dashboard.ts`
  (header con banner FORGE, nav `SelectRenderable` a la izquierda, panel de
  contenido a la derecha, barra inferior de atajos). Implementado en
  `tui/panel.ts`. Si la CLI corre bajo Node con `bun` disponible y TTY, se
  re-lanza bajo Bun (mismo mecanismo que `init`).
- **Fallback Node (@clack/prompts)**: menú de secciones; al elegir una se
  imprime su contenido. La búsqueda de skills se hace con un prompt de texto.
  Nunca crashea si no hay Bun.

Toda la lógica de datos vive en una capa NO interactiva y testeable:

- `lib/panel-data.ts` — `searchSkills`, `listInstalledHooks`, `listTemplates`,
  `getConfigSummary`.
- `commands/audit.ts` expone `runAudit(root): AuditReport` (el comando sigue
  imprimiendo igual).
- `commands/doctor.ts` expone `runDoctor(root): DoctorReport` (idem).

### Secciones

1. **Configuración** — resumen estructurado de `project.yaml` (mode, stack,
   agentes active/specialized/compliance, skills, runtimes, compliance, deploy).
   View-first. En el fallback Node se ofrece abrir `project.yaml` en `$EDITOR`.
   El toggle de skills queda fuera de alcance de esta spec (view-only).
2. **Monitoreo** — corre `runAudit` + `runDoctor` y muestra el resumen
   (conteos OK/info/warn/error, hooks instalados, runtimes detectados, estado
   del manifest).
3. **Skills** — navega el catálogo completo con búsqueda/filtro en vivo por
   nombre, categoría, comando y trigger; muestra purpose + trigger y marca las
   activas en `project.yaml`.
4. **Hooks** — lista los hooks de `.claude/hooks/` y del registry
   (`core/hooks/hooks-registry.yaml`): evento, matcher, qué hace y a qué mode
   pertenecen.
5. **Templates** — lista templates disponibles (wiki, spec, modes, claude-md)
   con descripción corta.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Panel solo OpenTUI (sin fallback) | Una sola UI | Crashea sin Bun; rompe Node puro | Requisito explícito de fallback |
| Reescribir audit/doctor desde cero | Limpio | Riesgo de regresión en comandos en uso | Preferimos extraer función y conservar el CLI |
| Toggling de skills editando project.yaml | Más potente | Riesgo de corromper YAML del usuario, fuera de scope | View-first en esta iteración |

## Criterios de aceptación

- [ ] `forge panel` existe, está registrado en `cli.ts` y aparece en el HELP.
- [ ] `forge` sin args abre el panel si hay `project.yaml`; si no, muestra help.
- [ ] Sin Bun, `forge panel` usa el fallback clack y no crashea.
- [ ] `runAudit` y `runDoctor` devuelven datos estructurados; `forge audit` /
      `forge doctor` siguen funcionando igual.
- [ ] `searchSkills` filtra por nombre/categoría/comando/trigger y marca activas.
- [ ] `listInstalledHooks` combina `.claude/hooks/` + registry con evento/matcher.
- [ ] `listTemplates` lista wiki/spec/modes/claude-md con descripción.
- [ ] Tests del data layer pasan en `npm test` (verde completo).

## Impacto de compliance

No aplica — la feature es de tooling de CLI, sin manejo de PII ni datos de
usuario.

## Dependencias

- Reutiliza `resolveForgeRoot()` / `findProjectYaml()`.
- Reutiliza el patrón OpenTUI de `tui/dashboard.ts`.

## Notas de implementación

- El render OpenTUI es Bun-only (igual que wizard/dashboard) y no se testea de
  forma automática; lo testeado es la capa de datos.
- La sección Configuración quedó view-only en OpenTUI; el fallback Node ofrece
  abrir `project.yaml` en `$EDITOR`.
