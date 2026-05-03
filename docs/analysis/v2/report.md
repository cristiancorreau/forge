# forge Framework — Informe de Análisis Técnico v2.0

**Título:** Evaluación comparativa del framework forge: análisis adversarial v1 → v2
**Fecha:** 3 de mayo de 2026
**Versión:** 2.0
**Commit analizado:** `d828157` (rama `main`)
**Versión anterior:** `docs/analysis/v1/` (mayo 2026)
**Metodología:** Análisis adversarial con dos posiciones independientes — crítica y favorable — reconciliadas en este informe consolidado

---

## Resumen ejecutivo

forge es un framework de agentic development que centraliza la configuración de agentes de IA en un único archivo `project.yaml` y genera, mediante scripts determinísticos, los artefactos de configuración para múltiples runtimes (Claude Code, OpenCode, Kiro). Su propuesta arquitectónica —taxonomía de tres tiers, compliance por diseño, Spec-Driven Development como workflow obligatorio— se mantiene intacta desde v1 y está respaldada por evidencia de código.

La segunda ronda de análisis (v2) evalúa el commit `d828157`, que incorpora mejoras directamente motivadas por el análisis v1. Las conclusiones son mixtas. En las dimensiones que el análisis v1 identificó como críticas, la mejora es real y verificable: el bug de `install_agent` está corregido, los adapters de OpenCode y Kiro tienen implementaciones funcionales, el framework tiene teardown, el ecosistema de profiles pasó de cuatro a ocho, y existe una suite de 112 tests. En las dimensiones donde los problemas son estructurales —coherencia entre documentación y código, integración real del flujo multi-runtime, ejecutabilidad de los fix messages del audit— las mejoras son parciales o nulas.

La recomendación consolidada es: forge v2 es adoptable para equipos de 3-8 personas que usen Claude Code como runtime principal, que entiendan que la documentación central `agent-standard.md` no refleja el estado del código, y que no dependan de los fix messages del audit como comandos ejecutables. Para equipos que usen OpenCode como runtime principal o que confíen en la documentación oficial del framework, la adopción presenta riesgos concretos que este informe documenta.

---

## 1. Introducción: contexto y metodología

### 1.1 El framework

forge se instala como git submodule en proyectos de desarrollo con agentes de IA. Su función es proporcionar una base de agentes especializados, skills componibles, y herramientas de auditoría que hagan predecible y auditable el comportamiento de los agentes en producción.

La arquitectura central se basa en tres tiers:

- **Tier 1 (Universal):** agentes que aplican a cualquier proyecto independientemente del stack.
- **Tier 2 (Profile):** agentes especializados en un stack técnico específico (FastAPI, Rails, NestJS, etc.).
- **Tier 3 (Dominio):** agentes creados por el equipo para necesidades específicas del proyecto.

El `project.yaml` actúa como fuente de verdad: stack, roster de agentes, frameworks de compliance, fases del sprint. Scripts determinísticos (`forge-init.py`, `generate-claude-md.py`, `generate-agents-md.py`, `generate-steering.py`) generan los artefactos de configuración para cada runtime desde esa única fuente.

### 1.2 Metodología de análisis

Este informe consolida dos análisis adversariales independientes realizados sobre el mismo commit:

- **Análisis favorable (advocate-report.md v2):** evalúa el diseño, las fortalezas, y las mejoras concretas incorporadas desde v1.
- **Análisis crítico (critic-report.md v2):** examina la implementación en busca de problemas que afecten la adopción en producción.

Ambos análisis se basan en lectura directa del código fuente: scripts Python, agentes Markdown, tests, hooks, adapters, y documentación. No se ejecutó el framework en un proyecto real.

La estructura de este informe es comparativa: primero documenta los problemas de v1 que el commit resolvió (con evidencia), luego los que persisten, luego los nuevos detectados en v2, y finalmente las fortalezas nuevas que solo v2 permite afirmar.

---

## 2. Problemas del v1 resueltos en v2

### 2.1 Bug de `install_agent` — resuelto

El análisis v1 identificó que la función `install_agent()` en `forge-init.py` retornaba siempre `"UPDATE"` para instalaciones nuevas, porque evaluaba `dst.exists()` después de copiar el archivo. El impacto era de UI/UX: el reporte de instalación mostraba todo como actualización, nunca como instalación nueva.

La corrección consiste en capturar el estado del archivo antes de la operación de copia:

```python
# forge-init.py líneas 95-105
already_existed = dst.exists()  # evaluar ANTES de copiar
shutil.copy2(src, dst)
return "UPDATE" if already_existed else "OK"
```

El test `test_ok_no_es_update_en_instalacion_nueva` documenta explícitamente el bug original en su docstring y protege contra regresión. Corrección completa.

### 2.2 Flag `--only` inexistente — resuelto

El audit generaba fix messages con `--force --only=<agente>`, pero el flag `--only` no existía en `forge-init.py`. Ejecutar la corrección sugerida fallaba silenciosamente o causaba error.

El flag ahora está implementado con soporte para ambas sintaxis (`--only=nombre` y `--only nombre`) y está testeado en `test_forge_init_integration.py` y `test_install_agent.py`. El caso `test_only_instala_un_solo_agente` verifica que con `--only=backend-engineer` solo ese archivo se instala y los demás no existen en el directorio de destino.

### 2.3 Adapters de OpenCode y Kiro vacíos — parcialmente resuelto

Los directorios `adapters/opencode/` y `adapters/kiro/` estaban vacíos en v1. Ahora contienen implementaciones funcionales:

- `adapters/opencode/generate-agents-md.py`: genera `AGENTS.md` enriquecido con descripción del stack y secciones por categoría de agente.
- `adapters/kiro/generate-steering.py`: genera cuatro archivos en `.kiro/steering/` adaptados a las convenciones de Kiro IDE.

Ambos adapters tienen 24 tests de integración en `test_adapters.py`. La calificación es "parcialmente resuelto" porque, aunque los adapters existen y funcionan, el flag `--tool opencode` de `forge-init.py` no los invoca (ver sección 4.3).

### 2.4 Ausencia de teardown — resuelto

`forge-teardown.py` no existía en v1. El framework no tenía camino de salida. Ahora existe con dry-run por defecto, eliminación selectiva de artefactos de forge (no Tier 3 del proyecto), y 8 tests de cobertura. Las limitaciones del teardown se documentan en la sección 4.5.

### 2.5 Ecosistema de profiles insuficiente — resuelto

En v1 había cuatro profiles. En v2 hay ocho: se agregaron `fastapi`, `express`, `rails`, `nestjs`. El test paramétrico en `test_profiles.py` verifica que cada agente de cada profile cumpla el estándar de frontmatter, modelo, secciones y longitud mínima.

### 2.6 Desconexión de fases en `CLAUDE.md` — resuelto

El generador de `CLAUDE.md` ahora tiene `_render_phases()` que lee `sprint.phases` desde `project.yaml` y genera el listado real de fases con sus specs y status. El test `test_fases_conectadas_con_project_yaml` verifica que el output refleja la configuración, no un template hardcodeado.

### 2.7 Ausencia de disclaimer en compliance — resuelto

El agente `compliance-reviewer` ahora tiene una sección "Limitaciones — leer antes de usar" que advierte que opera sobre conocimiento de entrenamiento del modelo, no sobre el texto oficial de las leyes. El disclaimer se propaga al `compliance.md` del adapter de Kiro.

---

## 3. Problemas del v1 que persisten en v2

### 3.1 Fix messages del audit no ejecutables

El análisis v1 identificó que el audit sugería `--only` cuando ese flag no existía. El flag ahora existe, pero el problema de fondo cambió de naturaleza: el formato de los fix messages sigue siendo no ejecutable directamente.

```python
# forge-audit.py líneas 223, 242
"fix": f"forge-init.py --tool claude-code --force --only={agent['name']}"
```

`forge-init.py` no está en el PATH del sistema. El README muestra el comando correcto: `python3 .agentic/scripts/forge-init.py --tool claude-code`. Un usuario que copie y ejecute la acción correctiva del audit recibirá `command not found`. Ningún test verifica el formato de los fix messages.

### 3.2 Mutación silenciosa en el hook pre-commit

El hook sigue haciendo `git add` sobre `docs/progress.html` dentro del proceso de commit, sin que el desarrollador haya inspeccionado ese archivo. Se agregó un mensaje informativo, pero el comportamiento de mutación no cambió. No existe ningún test que cubra el comportamiento del hook ni de `token-stats.py`.

### 3.3 Similitud de texto como métrica de calidad en el audit

El audit usa `SequenceMatcher.ratio()` con umbrales fijos para determinar si un agente está actualizado. La versión actual agrega un comentario de calibración, pero no cambia la lógica. Un agente correctamente especializado para Rails puede tener baja similitud con el core genérico y aparecer como "posiblemente desactualizado".

### 3.4 Mecanismo de actualización destructivo

`--force` sobreescribe el agente de destino completamente. No existe merge, diff interactivo, ni versionado de customizaciones locales. Este es un problema de diseño que v2 no aborda.

---

## 4. Problemas nuevos detectados en v2

### 4.1 `agent-standard.md` desincronizado con el ecosistema de profiles

La documentación de referencia de profiles contiene:

```
| `rails`  | `backend-engineer` *(pendiente)* |
| `fastapi` | `backend-engineer` *(pendiente)* |
```

Esto es incorrecto: los agentes reales son `fullstack-engineer` (rails) y `api-engineer` (fastapi), y los profiles `express` y `nestjs` no aparecen en la tabla en absoluto. Un equipo que lea esta documentación para seleccionar profiles recibirá información incorrecta sobre qué agentes obtendrá.

### 4.2 `fullstack-engineer` sin descripción en `forge-init.py`

El profile `rails` provee `fullstack-engineer`, pero el diccionario `role_descriptions` en `forge-init.py` no tiene esa entrada. Un proyecto que use el profile `rails` verá `"Agente de implementación"` (descripción genérica) para el agente central en su `AGENTS.md` generado. El adapter de Kiro sí tiene la entrada correcta, creando una inconsistencia entre adapters para el mismo agente.

### 4.3 `--tool opencode` no invoca el adapter de OpenCode

`forge-init.py` agrupa `"claude-code"` y `"opencode"` bajo el mismo bloque de código:

```python
# forge-init.py líneas 382-389
if tool in ("claude-code", "opencode", "all"):
    init_claude_code(root, forge, config)   # mismo código para ambos
    install_claude_commands(root, forge, config)
    init_wiki(root, forge, config)
```

Un usuario de OpenCode que ejecute `forge-init.py --tool opencode` obtendrá una instalación de Claude Code (`.claude/agents/`, slash commands) con exit code 0 y sin mensajes de error. El adapter `adapters/opencode/generate-agents-md.py` no se invoca desde `forge-init.py` en ningún caso.

### 4.4 Brechas críticas en el suite de tests

El suite no incluye: tests para `token-stats.py`, tests para el hook pre-commit, tests que validen el formato de los fix messages del audit, tests que detecten inconsistencias entre `agent-standard.md` y el código, ni tests que ejecuten `--tool opencode` y verifiquen output específico de OpenCode.

### 4.5 Teardown incompleto para desvinculación real

Después de `forge-teardown --confirm`, el proyecto mantiene `CLAUDE.md`, `project.yaml`, el hook pre-commit activo y el submodule `.agentic`. Se requieren 4-6 comandos manuales adicionales para quedar completamente desvinculado.

### 4.6 Simetría de runtime incompleta

El README afirma compatibilidad con "Claude Code, OpenCode, Codex y otros runtimes". El estado real: Claude Code tiene integración nativa completa, Kiro tiene adapter integrado via subprocess, OpenCode tiene adapter independiente no integrado en el flujo principal, y Codex no tiene adapter ni directorio en el repositorio.

---

## 5. Nuevas fortalezas presentes solo en v2

### 5.1 Suite de tests con 112 casos

La adición más significativa para la madurez del proyecto. Cuatro categorías complementarias: tests de integración que ejecutan scripts reales sobre directorios temporales, tests unitarios con importlib controlando sys.argv, tests estructurales paramétricos que recorren todos los profiles, y tests de regresión con docstrings que documentan los bugs originales. El `conftest.py` tiene fixtures con deep merge que permiten configurar exactamente lo necesario sin boilerplate.

### 5.2 Adapters con lógica condicional correcta

El adapter de Kiro genera `compliance.md` solo si hay frameworks configurados en `project.yaml`. Los tres adapters implementan la misma lógica de compliance automático. El adapter de OpenCode lee descriptions desde el frontmatter de los agentes, respetando la prioridad profiles > core.

### 5.3 Test paramétrico de profiles como garantía de estándar

`test_profiles.py` recorre dinámicamente todos los profiles y verifica frontmatter completo, modelo correcto, secciones requeridas y longitud mínima. Agregar un profile sin que pase estos tests es imposible sin romper el suite.

### 5.4 `forge-teardown.py` con lógica deliberada

La distinción entre lo que le pertenece al framework y lo que le pertenece al proyecto está codificada en la lógica del script. El test `test_confirm_no_elimina_agentes_tier3` verifica el caso más delicado: agentes de dominio del equipo sobreviven el teardown.

---

## 6. Análisis comparativo v1 vs. v2

| Dimensión | v1 | v2 | Tendencia |
|---|---|---|---|
| Profiles implementados | 4 | 8 | Mejora |
| Tests | 0 | 112 | Mejora |
| Bug `install_agent` | Presente | Corregido | Resuelto |
| Flag `--only` | Inexistente | Implementado | Resuelto |
| Adapter OpenCode | Vacío | Funcional (independiente) | Mejora parcial |
| Adapter Kiro | Vacío | Funcional (integrado) | Resuelto |
| Teardown | Ausente | Presente (parcial) | Mejora |
| Fix messages ejecutables | No (flag inválido) | No (path inválido) | Sin mejora real |
| Hook pre-commit (mutación) | Silenciosa | Con notificación | Mejora mínima |
| Disclaimer en compliance | Ausente | Presente | Resuelto |
| `agent-standard.md` sincronizado | Parcialmente | Menos que v1 | Regresión |
| `--tool opencode` invoca adapter | N/A | No | Problema nuevo |
| `fullstack-engineer` en role_descriptions | N/A | Ausente | Problema nuevo |
| Python 3.9 compatible | No | Sí | Resuelto |

---

## 7. Conclusiones y recomendaciones

forge v2 resolvió los problemas más visibles identificados en v1. Este es un mérito real que el análisis debe reconocer. Sin embargo, el patrón que emerge al examinar los problemas nuevos es preocupante: al agregar funcionalidad (profiles, adapters, scripts), la coherencia interna del framework se degradó. La documentación de referencia ahora describe un ecosistema más desactualizado que en v1. El adapter de OpenCode existe pero está desconectado del flujo principal. Un agente nuevo (`fullstack-engineer`) no está registrado en el script principal.

**Para adopción inmediata:** equipos de 3-8 personas con Claude Code como runtime principal, stack cubierto por los ocho profiles, y disposición a complementar la documentación con lectura del código fuente.

**Para esperar:** equipos que dependan de la documentación oficial, usen OpenCode como runtime principal, o necesiten que los fix messages del audit sean ejecutables sin modificación.

**Hoja de ruta recomendada para v3:** (1) sincronizar `agent-standard.md` con el ecosistema real, (2) hacer que `--tool opencode` invoque el adapter correcto, (3) corregir el formato de los fix messages del audit, (4) agregar tests que detecten inconsistencias entre capas.

---

## Anexo A: Bugs nuevos encontrados en v2

### A.1 Fix messages no ejecutables en el audit

**Archivo:** `scripts/forge-audit.py`, líneas 223 y 242

El audit genera la siguiente cadena como acción correctiva:
```
forge-init.py --tool claude-code --force --only=backend-engineer
```

`forge-init.py` no está en el PATH del sistema. El comando correcto es `python3 .agentic/scripts/forge-init.py --tool claude-code`. Un usuario que copie y ejecute el fix sugerido recibirá `command not found`. Ningún test detecta este problema.

**Fix sugerido:** Cambiar el formato a `python3 .agentic/scripts/forge-init.py --tool claude-code --force --only={agent['name']}` y agregar un test que verifique que el string comienza con `python3`.

### A.2 `fullstack-engineer` sin entrada en `role_descriptions` de `forge-init.py`

**Archivo:** `scripts/forge-init.py`, diccionario `role_descriptions`

El profile `rails` provee `fullstack-engineer`, pero ese nombre no tiene entrada en `role_descriptions`. El AGENTS.md generado mostrará `"Agente de implementación"` para ese agente. El adapter de Kiro sí tiene la entrada correcta, creando una inconsistencia entre adapters.

**Fix sugerido:** Agregar `"fullstack-engineer": "Full-stack — frontend, backend y base de datos en proyectos Rails"` al diccionario `role_descriptions` en `forge-init.py`.

### A.3 `--tool opencode` no invoca el adapter de OpenCode

**Archivo:** `scripts/forge-init.py`, bloque de selección de tool (líneas 382-389)

Ejecutar `forge-init.py --tool opencode` produce exactamente el mismo resultado que `--tool claude-code`. El adapter `adapters/opencode/generate-agents-md.py` no se invoca desde `forge-init.py` en ningún caso. El script termina con exit code 0.

**Fix sugerido:** Agregar un branch específico para `tool == "opencode"` que invoque `adapters/opencode/generate-agents-md.py` vía subprocess, siguiendo el mismo patrón que `--tool kiro` usa para invocar `adapters/kiro/generate-steering.py`.
