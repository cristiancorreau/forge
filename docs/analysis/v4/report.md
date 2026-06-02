# forge v2.0 — Informe Ejecutivo

**Fecha:** 2026-05-03
**Version analizada:** forge v2.0 (44 commits, branch main)
**Metodologia:** Analisis dual independiente + benchmark competitivo

---

## Indice

1. Metodologia
2. Estado del proyecto
3. Hallazgos criticos (bugs confirmados)
4. Benchmark comparativo
5. Fortalezas y limitaciones
6. Recomendaciones por perfil
7. Proximos pasos

---

## 1. Metodologia

Se realizaron dos analisis independientes del codigo fuente de forge v2.0:

- **Analisis critico:** Auditoria del codigo fuente buscando bugs, inconsistencias entre documentacion y codigo, riesgos de adopcion y limitaciones estructurales. Referencias a lineas de codigo especificas.
- **Analisis positivo / benchmark:** Evaluacion de las capacidades de forge respecto a cinco alternativas del ecosistema (aider, Cursor rules, cline/Roo Code, OpenHands, DIY manual) en diez criterios cuantificados.

Ambos analisis se realizaron de forma independiente sobre el mismo commit. Este informe sintetiza sus hallazgos.

---

## 2. Estado del proyecto

| Metrica | Valor |
|---|---|
| Commits | 44 |
| Autores | 1 (Cristian Correa) |
| Tests | 358 (2.86s en CI) |
| Profiles de stack | 13 |
| Agentes core (Tier 1) | 7 |
| MCP servers en catalogo | 20 |
| Runtimes soportados | 3 (Claude Code, OpenCode, Kiro) |
| PRs externos | 0 visibles |

forge es un framework de gobernanza de agentes IA: define, versiona y despliega equipos de agentes especializados por stack en multiples runtimes desde una unica fuente de verdad (`project.yaml`).

---

## 3. Hallazgos criticos — Bugs confirmados en el codigo

Los siguientes son hechos verificados, no estimaciones de riesgo.

### 3.1 Campo `summary` inexistente en JSON de auditoria (severidad: ALTA)

El comando `forge-audit.py --json` emite: `project`, `agents`, `opportunities`, `orphans`. No emite `summary`.

Los ejemplos de integracion CI en `README.md` (linea 173), `docs/guide.md` (linea 332) y `forge.py` (lineas 696, 967) usan `jq '.summary.errors == 0'`. En `jq`, un campo inexistente devuelve `null` sin error: el pipeline nunca falla aunque haya errores criticos de auditoria.

**Impacto:** Falsa seguridad en CI. Un equipo que siga la documentacion oficial tendra un pipeline roto por diseno.

### 3.2 Flag `--forge` documentada pero no implementada (severidad: MEDIA)

`docs/guide.md` cita el flag `--forge .agentic` en cinco ocasiones. El script `forge-audit.py` no lo implementa. El flag se ignora silenciosamente: no hay error, no hay advertencia, el comportamiento es diferente al documentado.

### 3.3 Opcion `--only` del menu no implementada (severidad: MEDIA)

`forge.py` (linea 712) invoca `forge-audit.py --only={agent}`. El script ejecuta siempre el audit completo. La opcion del menu describe un comportamiento que no existe.

### 3.4 Documentacion desactualizada en tres archivos (severidad: BAJA)

`forge.py` (linea 754) dice "9 profiles". El repositorio tiene 13. Los cuatro nuevos (astro, django, vuenuxt, go-gin, sveltekit) no aparecen en `README.md` ni en `templates/project.yaml.tpl`.

---

## 4. Benchmark comparativo

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
| **Total** | **47** | 27 | 17 | 27 | 29 | 21 |

_Escala 1-5 por criterio. forge lidera en 8 de 10 criterios._

forge no compite con aider en pair programming ni con OpenHands en ejecucion autonoma a escala. Su nicho —gobernanza de equipos de agentes con profiles de stack y auditoria continua— no tiene competidor directo en el ecosistema.

---

## 5. Fortalezas y limitaciones

### Fortalezas

- **Profiles especializados:** 13 stacks con instrucciones precisas (prohibiciones de librerias, requisitos de accesibilidad, scope de archivos). No existe equivalente empaquetado en ninguna herramienta comparada.
- **Auditoria integrada:** Detecta seis tipos de problemas con umbrales calibrados. Exit code 1 en CI ante errores criticos.
- **Fuente de verdad unica:** `project.yaml` configura agentes, stack, compliance y sprint para los tres runtimes.
- **Test suite solida:** 358 casos cubriendo auditoria, wizard, integración completa, adapters, teardown, profiles y CLI.
- **CLI sin dependencias:** TUI completa en Python puro.

### Limitaciones

- **Lock-in real en orchestrator:** Las APIs `Agent()`, `SendMessage`, `run_in_background` son exclusivas de Claude Code. Los adapters no resuelven la brecha de comportamiento.
- **Bug de CI critico:** El campo `summary` no existe en el JSON. La integracion CI documentada genera falsa seguridad.
- **Instalacion por submodule:** Sin versioning semantico, sin releases etiquetados, actualizacion manual de 6 pasos.
- **Bus factor 1:** Un unico maintainer. Riesgo operativo para adopcion enterprise.
- **Stacks incompletos:** Laravel y Angular en el wizard sin profile resultante.

---

## 6. Recomendaciones por perfil

**Equipo 2-8 personas, Claude Code activo, multiples proyectos:** Adoptar forge. Es la herramienta mas adecuada para este perfil en el ecosistema actual. Condicion: corregir el bug del campo `summary` antes de implementar la integracion CI.

**Equipo con requisitos de compliance (GDPR, Ley 21.719):** Adoptar forge. La propagacion automatica de reglas de compliance al steering de Kiro y la auditoria del modelo usado por `compliance-reviewer` no tiene equivalente en ninguna alternativa.

**Desarrollador individual, un proyecto:** No adoptar forge. DIY manual o Cursor rules tienen menor overhead y son suficientes.

**Equipo evaluando migracion de runtime:** Posponer la adopcion hasta que el orchestrator resuelva el lock-in con Claude Code.

**Equipo enterprise con necesidad de SLA o soporte:** No adoptar forge en el estado actual. Bus factor 1 es inaceptable en ese contexto.

**Stack Laravel o Angular:** No adoptar forge. El wizard no produce un resultado util para esos stacks.

---

## 7. Proximos pasos recomendados

Por orden de impacto:

1. **Corregir el bug del campo `summary`** en `forge-audit.py --json` y actualizar los ejemplos en README, guide.md y forge.py. Sin este fix, la integracion CI documentada es inutil.
2. **Implementar o eliminar** los flags `--forge` y `--only`. Si no se implementan, deben removerse de la documentacion.
3. **Actualizar la documentacion** para reflejar 13 profiles en forge.py, README y templates.
4. **Agregar tests del contrato JSON** en `test_forge_audit.py` que verifiquen la estructura de salida de `--json`.
5. **Evaluar alternativas al submodule**: un paquete pip o releases etiquetados reduciran la friccion de actualizacion.

---

_Documento generado a partir de analisis dual independiente. Mayo 2026._
