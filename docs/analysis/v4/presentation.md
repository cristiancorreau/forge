# forge v2.0 — Analisis Dual + Benchmark (v4)

**Marco de gobernanza de agentes IA para equipos**
Analisis independiente — Mayo 2026

---

## Metodologia: dos agentes independientes + benchmark competitivo

**Analisis critico**
- Auditoria del codigo fuente linea a linea
- Verificacion de consistencia documentacion / codigo
- Referencias precisas a archivos y numeros de linea
- Hallazgos presentados como hechos, no opiniones

**Analisis positivo / benchmark**
- Evaluacion de forge vs. 5 alternativas del ecosistema
- 10 criterios cuantificados en escala 1-5
- Casos de uso donde cada herramienta es superior
- Evidencia desde el codigo fuente

**Ambos analisis: independientes, sobre el mismo commit**

---

## ¿Que es forge? Estado actual

Framework de **gobernanza de agentes IA** para equipos de desarrollo.

| Dimension | Estado |
|---|---|
| Profiles de stack | 13 (hono-drizzle, nextjs-admin, fastapi, expo, rails, nestjs, go-gin, django, vuenuxt, sveltekit, astro, express, playwright-crawler) |
| Agentes core (Tier 1) | 7 |
| Tests automatizados | 358 (2.86s) |
| MCP servers en catalogo | 20 |
| Runtimes soportados | 3 (Claude Code, OpenCode, Kiro) |
| Commits / autores | 44 / 1 |

**Propuesta de valor:** `project.yaml` como unica fuente de verdad para agentes, stack, compliance y sprint en todos los runtimes.

---

## Benchmark: forge vs. alternativas

| Criterio | forge | aider | Cursor rules | cline/Roo | OpenHands | DIY |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Setup < 10 min | 5 | 5 | 4 | 4 | 3 | 1 |
| Especializacion por stack | **5** | 1 | 2 | 2 | 1 | 3 |
| Multi-runtime | **5** | 1 | 1 | 1 | 2 | 2 |
| CLI interactivo | **5** | 4 | 1 | 3 | 4 | 1 |
| Auditoria de agentes | **5** | 1 | 1 | 1 | 1 | 1 |
| Catalogo MCP | **5** | 1 | 1 | 3 | 2 | 1 |
| Tests del framework | **5** | 3 | 1 | 3 | 4 | 1 |
| Sin vendor lock-in | 5 | 5 | 1 | 4 | 4 | 5 |
| Comunidad activa | 2 | 5 | 4 | 5 | 5 | — |
| Gobernanza y compliance | **5** | 1 | 1 | 1 | 2 | 2 |

_Escala 1-5_

---

## forge lidera en 8 de 10 criterios

**Criterios donde forge es el mejor del benchmark:**

- Especializacion por stack (13 profiles con instrucciones precisas)
- Multi-runtime desde una sola fuente de verdad
- CLI interactivo sin dependencias externas
- Auditoria de agentes con exit code CI
- Catalogo MCP con instalacion guiada
- Tests del framework (358 casos)
- Gobernanza y compliance (GDPR, Ley 21.719)
- Setup en menos de 10 minutos (empate con aider)

**Criterios donde NO lidera:**
- Comunidad activa: aider (44.3k estrellas), cline (61.3k), OpenHands (72.6k) vs. forge (proyecto joven)
- Vendor lock-in real: el orchestrator usa APIs exclusivas de Claude Code

---

## Bugs confirmados en el codigo

Estos son hechos verificados, no estimaciones de riesgo.

**Bug 1 — Severidad ALTA: Campo `summary` inexistente en JSON de auditoria**
`forge-audit.py --json` no emite campo `summary`.
`README.md` linea 173, `docs/guide.md` linea 332 y `forge.py` lineas 696/967 usan `jq '.summary.errors == 0'`.
En `jq`, un campo inexistente devuelve `null` sin error.
**Resultado: la integracion CI documentada nunca falla aunque haya errores criticos.**

**Bug 2 — Severidad MEDIA: Flag `--forge` documentada pero no implementada**
`docs/guide.md` la cita 5 veces. El script la ignora silenciosamente.

**Bug 3 — Severidad MEDIA: Opcion `--only` del menu no implementada**
`forge.py` linea 712 invoca `--only`. El script ejecuta siempre el audit completo.

**Bug 4 — Severidad BAJA: Documentacion desactualizada**
Tres archivos dicen "9 profiles". El repositorio tiene 13.

---

## Fortalezas reales — evidencia del codigo

**Profiles especializados con profundidad real**
`admin-engineer.md`: Next.js 15 App Router, shadcn/ui + Tailwind 4 (prohibicion explicita de Tailwind 3), TanStack Query (prohibicion de SWR), 4 estados de UI obligatorios, WCAG 2.1 AA, dark mode, gestion de PII. No existe equivalente empaquetado en ninguna alternativa.

**Auditoria con umbrales calibrados**
`SIMILARITY_WARN=0.80`, `SIMILARITY_OUTDATED=0.50`. Detecta 6 tipos de problemas. Exit code 1 en CI.

**Test suite inusual para este tipo de framework**
358 casos: auditoria, wizard, integracion completa, adapters, teardown, profiles, CLI. 2.86 segundos.

**CLI sin dependencias**
TUI completa (pills, bordes, cursor, panel de descripcion) en Python puro.

---

## Limitaciones persistentes

**Lock-in con Claude Code a nivel de orchestrator**
`orchestrator.md` usa `Agent()`, `subagent_type`, `run_in_background`, `SendMessage`, `isolation: worktree`.
APIs exclusivas de Claude Code. Los adapters de OpenCode y Kiro no resuelven la brecha de comportamiento.
La promesa de agnosticismo es nominal en el componente central.

**Modelo de instalacion por submodule**
Sin versioning semantico. Sin releases etiquetados. Actualizacion: 6 pasos manuales documentados.
`forge-teardown.py` ignora errores silenciosamente si el submodule ya fue removido.

**Bus factor 1**
44 commits, 1 autor, 0 PRs externos visibles.
Riesgo operativo real para adopcion enterprise.

**Stacks sin profile**
Laravel y Angular en el wizard. No existen profiles para ninguno.
El wizard termina con `profiles: []` despues de 10 pantallas.

---

## Cuando usar forge — casos ideales

**Equipo 2-8 personas, Claude Code activo, multiples proyectos**
El caso de uso principal. Profiles reutilizables sin duplicar instrucciones por proyecto.

**Multiples stacks en el mismo equipo**
Un backend FastAPI, un admin Next.js, una app Expo, un crawler Playwright: un `project.yaml` por proyecto, profiles correspondientes, coherencia garantizada.

**Requisitos de compliance (GDPR, Ley 21.719)**
`compliance.frameworks` en `project.yaml` activa `compliance-reviewer` con `opus` obligatorio y propaga reglas al steering de Kiro. Sin equivalente en el ecosistema.

**Onboarding de desarrolladores nuevos**
El wizard con modos `startup`, `standard` y `enterprise` genera configuracion correcta sin conocimiento previo del framework.

---

## Cuando NO usar forge — alternativas mas adecuadas

| Situacion | Alternativa | Razon |
|---|---|---|
| Pair programming interactivo puro | **aider** | Mas directo, comunidad 50x mayor, repomap real |
| Desarrollador individual, un proyecto | **DIY manual o Cursor rules** | Overhead del submodule no justificado |
| Migracion planificada de Claude Code a otro runtime | **Esperar** | Orchestrator no portable |
| Equipo enterprise con necesidad de SLA | **No adoptar aun** | Bus factor 1 inaceptable |
| Stack Laravel o Angular | **DIY manual** | Sin profile; wizard no produce resultado util |
| Agentes autonomos a gran escala en nube | **OpenHands** | Infraestructura de ejecucion que forge no tiene |
| Flujo centrado en VS Code | **cline o Roo Code** | Integracion nativa con el editor |

---

## Veredicto por perfil

| Perfil | Veredicto |
|---|---|
| Equipo 2-8, Claude Code, multiples proyectos | ADOPTAR (corregir bug `summary` primero) |
| Equipo con compliance GDPR / Ley 21.719 | ADOPTAR |
| Desarrollador individual, un proyecto | NO adoptar — DIY es suficiente |
| Migracion de runtime planificada | ESPERAR |
| Enterprise con SLA requerido | NO adoptar aun |
| Stack Laravel / Angular | NO adoptar — sin profile |
| Pair programming puro | aider es mejor |
| Autonomia a escala en nube | OpenHands es mejor |

**forge v2.0 es el framework mas completo para gobernanza de agentes en equipos que usan Claude Code.**
**El bug del campo `summary` debe corregirse antes de cualquier adopcion en produccion.**

---

## Proximos pasos recomendados

**Inmediatos (bloquean adopcion):**
1. Corregir bug `summary` en `forge-audit.py --json` y ejemplos en README, guide.md, forge.py
2. Implementar o eliminar flags `--forge` y `--only` de la documentacion

**Corto plazo (mejoran calidad):**
3. Actualizar documentacion a 13 profiles en forge.py, README y templates
4. Agregar tests del contrato JSON en `test_forge_audit.py`

**Medio plazo (reducen friccion de adopcion):**
5. Evaluar paquete pip o releases etiquetados en lugar de submodule
6. Desarrollar profiles para Laravel y Angular o eliminarlos del wizard
7. Plan de gobernanza para escalar mas alla de un maintainer

**forge tiene la arquitectura correcta. Los bugs son corregibles. La comunidad es el desafio mas largo.**
