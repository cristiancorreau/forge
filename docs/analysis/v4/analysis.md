# forge v2.0 — Análisis dual + Benchmark comparativo (v4)

> Síntesis de dos análisis independientes + benchmark vs. ecosistema.
> Versión analizada: forge v2.0, 44 commits. Fecha: 2026-05-03.

---

## Resumen ejecutivo

Este documento sintetiza dos análisis independientes realizados sobre forge v2.0 post-mejoras (versión 4 del ciclo de análisis). El primer análisis auditó el código fuente en busca de problemas estructurales y encontró cuatro áreas críticas con bugs concretos. El segundo comparó forge con las cinco alternativas más relevantes del ecosistema y concluyó que ocupa un nicho sin competidor directo para equipos que gobiernan agentes IA en Claude Code.

La síntesis no concilia artificialmente las dos visiones: donde un análisis encontró bugs confirmados en el código, esos bugs son hechos documentados. Donde el otro encontró ventajas estructurales respecto a las alternativas, esas ventajas también están respaldadas por evidencia. El veredicto final es diferenciado por perfil de equipo.

forge ha madurado considerablemente: 358 tests, 13 profiles que cubren los principales ecosistemas modernos, modo CI, un CLI navegable y adaptadores para tres runtimes. Al mismo tiempo, mantiene cuatro problemas estructurales sin resolver —uno de los cuales implica un bug en el contrato de CI que genera falsa seguridad en producción.

---

## Bugs confirmados en el código

Los siguientes no son opiniones ni estimaciones de riesgo: son inconsistencias verificadas entre el código fuente y la documentación, con referencias precisas a líneas.

### Bug 1 — Campo `summary` ausente en el JSON de auditoría (severidad: alta)

El comando `forge-audit.py --json` emite un JSON con cuatro campos: `project`, `agents`, `opportunities` y `orphans`. No existe campo `summary`.

Sin embargo, los siguientes archivos documentan la integración CI usando ese campo inexistente:

- `README.md`, línea 173: `jq -e '.summary.errors == 0'`
- `docs/guide.md`, línea 332: `jq -e '.summary.errors == 0'`
- `forge.py`, líneas 696 y 967: `jq '.summary'` y `jq '.summary.errors'`

En `jq`, acceder a un campo inexistente devuelve `null` sin error. Un pipeline de CI construido con los ejemplos del README nunca fallaría aunque haya errores críticos de auditoría. Ningún test en `test_forge_audit.py` verifica la estructura del JSON de salida.

Consecuencia práctica: cualquier equipo que implemente la integración CI documentada tendrá un pipeline que genera falsa seguridad.

### Bug 2 — Flag `--forge` documentada pero no implementada

`docs/guide.md` referencia el flag `--forge .agentic` en cinco ocasiones (líneas 112, 146, 180, 205, 282). El script `forge-audit.py` no implementa ese parámetro. Al ejecutar el comando documentado, el flag se ignora silenciosamente y el audit corre sin él —sin ningún mensaje de error al usuario.

### Bug 3 — Opción `--only` del menú no implementada

`forge.py`, línea 712, llama a `forge-audit.py --only={agent}`. El script no implementa `--only`: ejecuta siempre el audit completo. La opción del menú describe auditar "sin revisar el roster completo" y hace lo contrario.

### Bug 4 — Documentación desactualizada en tres archivos

`forge.py` (línea 754) describe "9 profiles" cuando el repositorio tiene 13. `README.md` no lista astro, django, vuenuxt, go-gin ni sveltekit en la tabla Tier 2. `templates/project.yaml.tpl` no incluye los cuatro profiles nuevos. La causa: la documentación no se actualizó al agregar los profiles en v2.0.

---

## Benchmark comparativo

### Herramientas evaluadas

El ecosistema de desarrollo con agentes IA incluye dos categorías: herramientas de pair programming (aider, Cursor rules, cline/Roo Code) y plataformas de agentes autónomos (OpenHands). forge ocupa un tercer nicho: gobernanza de equipos de agentes especializados.

| Criterio | forge | aider | Cursor rules | cline/Roo | OpenHands | DIY manual |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Setup en < 10 min | **5** | 5 | 4 | 4 | 3 | 1 |
| Especialización por stack | **5** | 1 | 2 | 2 | 1 | 3 |
| Multi-runtime (Claude/OpenCode/Kiro) | **5** | 1 | 1 | 1 | 2 | 2 |
| CLI interactivo | **5** | 4 | 1 | 3 | 4 | 1 |
| Auditoría de agentes | **5** | 1 | 1 | 1 | 1 | 1 |
| Catálogo MCP integrado | **5** | 1 | 1 | 3 | 2 | 1 |
| Tests del framework | **5** | 3 | 1 | 3 | 4 | 1 |
| Sin vendor lock-in | 5 | 5 | 1 | 4 | 4 | **5** |
| Comunidad activa | 2 | 5 | 4 | **5** | 5 | — |
| Gobernanza y compliance | **5** | 1 | 1 | 1 | 2 | 2 |

_Escala 1-5. Fuente: análisis comparativo independiente, mayo 2026._

forge lidera en 8 de 10 criterios. Las dos excepciones son significativas: comunidad activa (donde aider, cline y OpenHands tienen comunidades 10-50 veces más grandes) y vendor lock-in real (donde el informe crítico identificó que el agente `orchestrator.md` usa APIs exclusivas de Claude Code que no tienen equivalente en otros runtimes, a pesar de la existencia de adapters).

### Análisis del benchmark

Las herramientas comparadas no resuelven el mismo problema que forge. aider es una herramienta de edición asistida por sesión, sin estado persistente entre proyectos. Cursor rules son configuración por directorio sin propagación a otros runtimes. cline y Roo Code dependen de VS Code y no tienen profiles de stack predefinidos. OpenHands es una plataforma de ejecución autónoma a escala, no un framework de gobernanza.

La ventaja diferencial de forge es concreta: permite definir en `project.yaml` el roster de agentes, el stack, los requisitos de compliance y el sprint, y obtener desde ahí configuraciones nativas para Claude Code, OpenCode y Kiro. Los 13 profiles son instrucciones especializadas por stack que nadie en el ecosistema provee empaquetadas: un `admin-engineer` que prohíbe explícitamente Tailwind 3 y SWR, que exige WCAG 2.1 AA, que no trabaja fuera de `packages/admin/`.

---

## Fortalezas con evidencia

**Arquitectura de tres tiers con fuente de verdad única.** El sistema Tier 1 (core) / Tier 2 (profiles) / Tier 3 (dominio) con regla de colisión precisa garantiza que la especialización por stack no rompe el roster base. `forge-init.py` instala profiles primero, core después, sin sobreescribir.

**Auditoría como ciudadano de primera clase.** `forge-audit.py` detecta frontmatter incompleto, modelo incorrecto por tier, similitud fuera de umbrales (`SIMILARITY_WARN=0.80`, `SIMILARITY_OUTDATED=0.50`), agentes huérfanos y profiles no usados. El flag `--json` devuelve exit code 1 ante errores críticos. Ninguna herramienta comparada ofrece esto. (El bug del campo `summary` no invalida la capacidad de auditoría; invalida la integración CI documentada.)

**358 tests en 2.86 segundos.** Cobertura de auditoría, wizard, integración completa de init, adapters, teardown, profiles y CLI. Inusual para un framework de este tipo.

**CLI con calidad de producto.** Pills de categoría, bordes redondeados, cursor con selección y panel de descripción contextual, en Python puro sin dependencias de TUI.

**20 MCP servers con instalación guiada.** Catálogo integrado en el CLI con parámetros configurados en `settings.json`.

**Compliance propagado.** El campo `compliance.frameworks` activa el `compliance-reviewer` con modelo `opus` obligatorio y propaga las reglas al steering de Kiro.

---

## Limitaciones con evidencia

**Lock-in con Claude Code a nivel de orchestrator.** El agente central usa `Agent()`, `subagent_type`, `run_in_background`, `SendMessage` e `isolation: worktree` —APIs exclusivas de Claude Code. Los adapters de OpenCode y Kiro generan configuraciones de roster pero no resuelven la brecha de comportamiento. Un equipo en OpenCode no accede al mecanismo de coordinación que el orchestrator asume.

**Bug de CI en producción.** El campo `summary` no existe en el JSON de `forge-audit.py`. Cualquier pipeline construido con los ejemplos del README genera falsa seguridad. Es el problema más urgente de resolver.

**Modelo de instalación por submodule.** Sin versioning semántico, sin releases etiquetados, sin script de actualización automatizado. El proceso de actualización requiere 6 pasos manuales. `forge-teardown.py` ignora silenciosamente errores si el submodule ya fue removido manualmente.

**Bus factor 1.** 44 commits, un único autor, cero PRs externos visibles. Para un framework que gestiona configuración de agentes en producción, esto es un riesgo operativo real.

**Tests estructurales, no de flujo real.** Los 358 tests verifican que los archivos se copian correctamente, que el frontmatter existe, que el YAML contiene ciertos strings. No hay tests end-to-end del flujo wizard → init → audit → update, ni tests que verifiquen que los agentes instalados son interpretados correctamente por ningún runtime.

**Stacks sin profile.** El wizard ofrece Laravel y Angular como opciones. No existen profiles para ninguno de los dos. Un equipo que los seleccione obtiene `profiles: []` después de 10 pantallas del wizard.

---

## Matriz de decisión

| Perfil | Recomendación | Razon |
|---|---|---|
| Equipo 2-8 personas, Claude Code activo, multiples proyectos | **Usar forge** | Maximo beneficio de profiles y auditoria |
| Equipo con requisitos GDPR / Ley 21.719 | **Usar forge** | Compliance propagado sin equivalente en alternativas |
| Desarrollador individual, un proyecto, sin compliance | **DIY manual o Cursor rules** | Overhead no justificado |
| Equipo que necesita migrar de Claude Code a otro runtime | **Esperar** | Lock-in en orchestrator no resuelto |
| Equipo enterprise evaluando fork o contribuciones | **Evaluar con cautela** | Bus factor 1, proceso de contribucion sin comunidad |
| Stack Laravel o Angular | **DIY manual** | Sin profile; wizard termina sin resultado util |
| Pair programming interactivo puro | **aider** | Mas directo, comunidad 50x mayor, repomap superior |
| Agentes autonomos a gran escala en nube | **OpenHands** | Infraestructura de ejecucion que forge no tiene |
| Flujo centrado en VS Code con supervision granular | **cline o Roo Code** | Integracion nativa con el editor |

---

## Conclusion

### Para quien es forge ideal hoy

Equipos de 2 a 8 personas que usan Claude Code de forma activa, trabajan con multiples proyectos que comparten patrones de stack (Next.js, FastAPI, Expo, Rails), y necesitan coherencia reproducible entre proyectos sin escribir instrucciones de agente desde cero en cada uno. Especialmente para equipos con requisitos de compliance (GDPR, Ley 21.719 chilena) donde la propagacion automatica de reglas a todos los runtimes tiene valor operativo real.

### Para quien no es forge adecuado hoy

Desarrolladores individuales sin necesidad de coordinacion (el overhead de `project.yaml` y el submodule no se justifica). Equipos que planean migrar de Claude Code a OpenCode o Kiro en el corto plazo (el orchestrator no es portable). Equipos enterprise que necesitan un vendor con soporte, SLA o comunidad activa (bus factor 1 es un riesgo inaceptable en ese contexto). Equipos con Laravel o Angular como stack principal.

### Veredicto diferenciado

forge v2.0 es el framework mas completo del ecosistema para gobernanza de agentes IA en equipos que usan Claude Code. Su ventaja es real y documentada. Sus bugs tambien son reales y documentados. El bug del campo `summary` en el JSON de CI debe corregirse antes de cualquier adopcion en produccion: es una linea de codigo con consecuencias operativas desproporcionadas. Corregido ese bug, forge es la eleccion mas racional para el perfil de equipo descrito.

Para quienes no encajan en ese perfil, las alternativas son mejores en sus propios dominios: aider para pair programming, OpenHands para autonomia a escala, cline para integracion con VS Code. La eleccion no es "forge vs. todo": es "forge para gobernanza de equipos en Claude Code, las otras herramientas para todo lo demas".
