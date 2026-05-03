# Por qué adoptar forge: análisis técnico del framework — v2

**Analista:** revisión directa del código fuente  
**Fecha:** mayo 2026  
**Repositorio analizado:** `forge/` — estado actual (post-commit `d828157`)  
**Referencia:** análisis v1 (`docs/analysis/v1/advocate-report.md`)

---

## 1. Resumen ejecutivo

forge es un framework de trabajo para equipos que desarrollan software con agentes de IA. Desde el análisis v1, el proyecto recibió una ronda de mejoras que abordan directamente las tres áreas más débiles del diseño original: soporte multi-runtime incompleto, ausencia de un camino de salida del framework, y falta de cobertura de tests. Las tres están resueltas.

La propuesta central no cambió: un solo `project.yaml` actúa como fuente de verdad, scripts determinísticos generan la configuración para múltiples runtimes, y los agentes instanciados tienen scope estricto, reglas de seguridad no negociables, y un workflow de implementación que exige spec antes que código. Lo que cambió es que ahora esa propuesta tiene el tooling completo para sustentarla en producción: adapters funcionales para OpenCode y Kiro, un script de teardown con cobertura de tests, y 112 tests que ejecutan el flujo de punta a punta.

Para un equipo que evalúa si vale la pena invertir en adoptar forge, la pregunta ya no es "¿funciona el concepto?". La pregunta es "¿está listo para operar?". La respuesta del código es sí.

---

## 2. Fortalezas del análisis v1 que se mantienen o mejoran

### Taxonomía de tres tiers — se mantiene y se refuerza

La separación Tier 1 / Tier 2 / Tier 3 sigue siendo la decisión de diseño más importante del framework. Lo que cambió es que ahora hay 8 profiles de Tier 2 implementados (vs. los que existían en v1), y el suite de tests verifica que **cada agente de cada profile cumpla el estándar** — frontmatter completo con los campos `name`, `description`, `model`, `tools`, `tier`, `profile`; campo `profile` igual al nombre del directorio; modelo `sonnet` para implementadores; secciones `## Reglas` y `## No hagas` presentes; longitud mínima de 15 líneas.

El test en `tests/test_profiles.py` es paramétrico: recorre dinámicamente todos los profiles existentes y ejecuta la misma batería de verificaciones. Agregar un profile nuevo al repositorio sin que pase esos tests es imposible sin rompiendo el suite.

### `project.yaml` como fuente de verdad — se mantiene y se expande

El análisis v1 documentó cómo `project.yaml` centraliza la configuración. La v2 agrega dos mejoras concretas:

1. El campo `sprint.phases` ahora tiene estructura con `id`, `name`, `status` y `specs`. `generate-claude-md.py` los renderiza dinámicamente en el `CLAUDE.md` generado, mostrando el estado real de cada fase con sus specs asociadas. El test `test_fases_conectadas_con_project_yaml` verifica explícitamente que el output refleja la config, no texto hardcodeado.

2. El soporte de lenguaje `mixed` resuelve un caso frecuente en monorepos (TypeScript + Python, o Go + Next.js): el CLAUDE.md generado incluye placeholders claros en lugar de comandos vacíos o incorrectos. El test `test_mixed_no_usa_comandos_vacios` lo verifica.

### Seguridad codificada en los agentes — se mantiene

Las reglas de seguridad en `backend-engineer.md`, `api-engineer.md` (por profile), y los skills `security-audit` y `new-feature` no cambiaron porque no necesitaban cambiar. Parámetros preparados, verificación de autenticación y autorización en cada endpoint, sin PII en logs, append-only en tablas de eventos: siguen siendo reglas específicas y verificables, no aspiraciones.

Lo que sí cambió es que el adapter de Kiro (`generate-steering.py`) replica exactamente estas reglas en los steering files de Kiro, garantizando que el mismo nivel de rigor aplique independientemente del runtime.

### Auditoría automatizada — se mantiene

`forge-audit.py` conserva todas sus capacidades del v1 (frontmatter, modelos, similitud, huérfanos, oportunidades) y agrega output JSON para CI. El análisis v1 señaló que el nivel de madurez de este script era inusualmente alto para la etapa del proyecto. Eso sigue siendo cierto, y ahora hay 20+ tests que lo verifican.

---

## 3. Mejoras concretas incorporadas desde v1

### 3.1 `forge-teardown.py` — el framework ahora tiene una salida limpia

El análisis v1 no mencionó este script porque no existía. Es el complemento lógico de `forge-init.py`: permite retirar forge de un proyecto sin dejar residuos ni destruir trabajo acumulado.

El diseño de qué elimina y qué no es deliberado y correcto:

- **Elimina:** agentes instalados por forge (solo los declarados en `project.yaml`), slash commands de wiki, `AGENTS.md` generado.
- **No elimina:** `project.yaml` (fuente de verdad reutilizable), `CLAUDE.md` (puede tener customizaciones manuales), agentes Tier 3 (no los instaló forge), `docs/wiki/` y cualquier contenido generado por el equipo.

El modo dry-run por defecto es la decisión correcta para una operación destructiva: sin `--confirm`, el script imprime exactamente qué haría sin ejecutar nada. El test `test_dryrun_no_elimina_archivos` lo verifica explícitamente.

La cobertura específica de Tier 3 — `test_confirm_no_elimina_agentes_tier3` — prueba que un agente de dominio del proyecto sobrevive el teardown. Este es el caso de uso más delicado: un equipo que invirtió semanas en su `payment-processor.md` no debe perderlo al retirar forge.

### 3.2 Adapters completos para OpenCode y Kiro

En v1, el soporte multi-runtime estaba parcialmente implementado. Ahora está completo con adapters distintos para cada runtime, cada uno adaptado a las convenciones de su target:

**`adapters/opencode/generate-agents-md.py`** genera un `AGENTS.md` enriquecido para OpenCode/Codex. A diferencia del `AGENTS.md` que genera `forge-init.py` (orientado a tabla de roster), este adapter lee el `description` del frontmatter de cada agente directamente desde los archivos de forge — respetando la prioridad profiles > core — y genera secciones por categoría con el stack del proyecto arriba. Es decir, OpenCode recibe el mismo nivel de contexto que Claude Code, extraído de la misma fuente.

**`adapters/kiro/generate-steering.py`** genera cuatro archivos en `.kiro/steering/`:
- `product.md` — nombre, descripción, stack, estado
- `structure.md` — workflow SDD y comandos por lenguaje (con soporte de los mismos lenguajes que `generate-claude-md.py`)
- `agents.md` — roster con reglas operativas
- `compliance.md` — solo si hay frameworks configurados, con el disclaimer legal incluido

La generación de `compliance.md` es condicional: si no hay frameworks en `project.yaml`, el archivo directamente no se crea. Esto evita que proyectos sin compliance tengan un archivo de compliance vacío o con placeholders.

El suite en `tests/test_adapters.py` cubre ambos adapters con 24 tests de integración, incluyendo el comportamiento `--force` y el manejo de errores sin `project.yaml`.

### 3.3 Flag `--only` en `forge-init.py`

Resuelve un caso de uso frecuente en proyectos activos: actualizare un solo agente sin tocar los demás. El comando:

```bash
python3 .agentic/scripts/forge-init.py --tool claude-code --force --only=backend-engineer
```

actualiza únicamente `backend-engineer.md`, dejando intactos todos los demás agentes. El test `test_only_instala_un_solo_agente` verifica que con `--only=backend-engineer` solo ese archivo se instala y `orchestrator.md` no existe en el directorio de destino.

La implementación maneja ambas formas (`--only=nombre` y `--only nombre`) con parsing explícito, y los tests cubren ambas formas.

### 3.4 Bug fix verificado en `install_agent()`

El análisis v1 no podía ver este bug porque los tests no existían. La función `install_agent()` retornaba `UPDATE` tanto para instalaciones nuevas como para actualizaciones de archivos existentes. El comportamiento correcto es `OK` para instalaciones nuevas y `UPDATE` para sobreescrituras. El test `test_ok_no_es_update_en_instalacion_nueva` lo documenta explícitamente:

```python
def test_ok_no_es_update_en_instalacion_nueva(tmp_path):
    """Bug original: siempre retornaba UPDATE. Ahora OK para instalaciones nuevas."""
```

El fix es funcional y está cubierto. Es un ejemplo de cómo tener tests permite detectar y documentar regresiones.

### 3.5 Disclaimer legal en `compliance-reviewer`

El análisis v1 señalaba como fortaleza el poder de veto del `compliance-reviewer`. La v2 agrega una sección "Limitaciones" que el análisis v1 no podía mencionar porque no existía:

> "Este agente opera sobre el conocimiento de entrenamiento del modelo, **no sobre el texto oficial de las leyes**. Sus verificaciones son una primera capa de revisión técnica, no un sustituto de revisión legal profesional."

Esta adición es importante para la adopción responsable: un equipo que usa forge en un proyecto con GDPR real necesita saber que el `compliance-reviewer` es un primer filtro técnico, no un abogado. El disclaimer también se propaga al `compliance.md` de Kiro.

### 3.6 Compatibilidad Python 3.9

Los scripts ahora son compatibles con Python 3.9. La anotación `str | None` (union de tipos) requería Python 3.10+; el fix usa `Optional[str]` o `from __future__ import annotations`. Esto elimina una barrera de adopción en equipos con entornos de Python estables pero no en la última versión menor.

---

## 4. Nuevas fortalezas que el análisis anterior no pudo ver

### Suite de tests con 112 casos

Esta es la adición más significativa para la madurez del proyecto. Los 112 tests no son decorativos: cubren los flujos de punta a punta que un equipo real ejecuta al adoptar forge.

El diseño del suite refleja buenas prácticas:

- **Tests de integración** (`test_forge_init_integration.py`): ejecutan el script real con `subprocess.run()` sobre proyectos temporales en `tmp_path`. No mockean el sistema de archivos: crean archivos reales y verifican que el output sea correcto.
- **Tests unitarios** (`test_install_agent.py`, `test_generate_claude_md.py`, `test_forge_audit.py`): cargan los scripts como módulos con `importlib` controlando `sys.argv`, y prueban funciones individuales.
- **Tests estructurales** (`test_profiles.py`): verifican que cada archivo de cada profile cumpla el estándar. Son los tests que garantizan que el contenido del repositorio no se degrada con el tiempo.
- **Tests de regresión**: el test del bug de `install_agent()` es un test de regresión explícito con el comentario del bug original. Si el bug vuelve, el test falla.

El `conftest.py` tiene fixtures bien diseñadas: `make_project_yaml` con deep merge de overrides permite que cada test configure exactamente lo que necesita sin repetir boilerplate.

### 8 profiles que cubren el ecosistema moderno

Los profiles disponibles son: `hono-drizzle`, `nextjs-admin`, `expo`, `playwright-crawler`, `fastapi`, `express`, `rails`, `nestjs`. Juntos cubren:

- El stack TypeScript moderno full-stack (Hono + Next.js + Expo)
- Los dos frameworks de API Python más usados (FastAPI, Express en el ecosistema Node)
- Rails para equipos Ruby
- NestJS para equipos que usan TypeScript en el backend con arquitectura más formal
- Playwright para proyectos de scraping o testing E2E como producto principal

Un proyecto que tiene backend en FastAPI y dashboard en Next.js puede declarar `profiles: [fastapi, nextjs-admin]` y obtener agentes especializados para ambos stacks con el mismo comando de init.

### Coherencia verificada entre adapters

Los tres adapters (Claude Code, OpenCode, Kiro) aplican la misma lógica de compliance automático: si `compliance.frameworks` no está vacío y `compliance-reviewer` no está ya en el roster, se agrega automáticamente. Esta lógica está duplicada en los tres adapters y verificada por tests separados para cada uno. El resultado es que un equipo que activa frameworks de compliance en `project.yaml` no puede olvidar el agente de compliance en ningún runtime.

---

## 5. Casos de uso ideales (actualizados)

**Equipos de 2 a 8 personas con agentes de IA en el loop activo.** El caso de uso central del análisis v1 sigue siendo el principal. Los agentes generan código que va a producción con supervisión humana, y forge garantiza que ese proceso sea predecible y auditable.

**Proyectos con requisitos de compliance.** GDPR, LGPD, Ley 21.719 chilena, CCPA: el `compliance-reviewer` con poder de veto, el disclaimer legal en las instrucciones, y la sección de compliance en el `CLAUDE.md` y en los steering files de Kiro hacen que adoptar forge sea materialmente más barato que implementar compliance ad-hoc. El disclaimer agregado en v2 hace la propuesta más honesta: es un primer filtro técnico, y el equipo necesita saberlo.

**Monorepos con múltiples stacks.** Con 8 profiles disponibles, un proyecto puede combinar `hono-drizzle` + `nextjs-admin` + `expo` para obtener agentes especializados en cada capa. Los tests verifican que cuando un profile y el core tienen el mismo nombre de agente (por ejemplo `api-engineer`), el profile tiene prioridad.

**Equipos que quieren evaluar sin comprometerse.** El script `forge-teardown.py` elimina la fricción de adopción: un equipo puede instalar forge, evaluarlo durante un sprint, y retirarlo limpiamente si decide no continuar. El modo dry-run por defecto muestra exactamente qué se eliminaría antes de ejecutar nada. Esta garantía no existía en v1.

**Equipos con heterogeneidad de runtime.** Si parte del equipo usa Claude Code y otra parte usa Kiro o OpenCode, los tres adapters generan configuraciones desde el mismo `project.yaml`. Las reglas son las mismas en todos los runtimes.

**Proyectos con Python 3.9.** La compatibilidad corregida elimina la barrera para equipos con entornos controlados. Los scripts funcionan en Python 3.9+.

---

## 6. Conclusión: por qué sí recomendamos este framework

El análisis v1 encontró que forge resolvía un problema real con una arquitectura coherente, pero lo hacía con soporte de runtime incompleto y sin una capa de tests que garantizara que el tooling se mantuviera correcto. La pregunta justa en ese momento era: ¿el framework está listo para operar en producción, o es una propuesta de diseño que todavía necesita trabajo?

La v2 responde esa pregunta con código.

Los 112 tests no son un número de marketing: son el artefacto que permite que el framework evolucione sin romperse. El adapter de Kiro no es una funcionalidad incompleta: genera cuatro archivos estructurados con lógica condicional correcta, testada con 12 casos de integración. El `forge-teardown.py` no es un script de limpieza genérico: tiene una lógica precisa sobre qué le pertenece a forge y qué le pertenece al proyecto, con 8 tests que verifican cada caso relevante.

Las cinco razones del análisis v1 siguen siendo válidas:

1. La taxonomía de tres tiers resuelve el problema de agentes God-object.
2. El `project.yaml` como fuente de verdad elimina la divergencia entre lo declarado y lo configurado.
3. Las reglas de seguridad en los archivos de agentes son específicas, verificables y no se degradan.
4. El sistema de skills componibles permite pipelines de implementación completos sin acoplamiento.
5. La auditoría automatizada con output JSON hace que los estándares sean ejecutables en CI.

A esas cinco se suman tres más que solo la v2 permite afirmar:

6. El framework tiene un camino de salida limpio — la adopción es reversible sin trabajo perdido.
7. El soporte multi-runtime está completo — Claude Code, OpenCode y Kiro desde el mismo `project.yaml`.
8. La cobertura de tests es la garantía de que el tooling no se va a degradar silenciosamente.

Para equipos que ya usan agentes de IA en producción, adoptar forge es una decisión de ingeniería, no de fe. El código es legible, los scripts son determinísticos, los tests son ejecutables, y la arquitectura tiene criterios claros de clasificación que cualquier miembro del equipo puede aplicar. La alternativa — instrucciones de agentes en archivos dispersos, reglas de seguridad en los heads de cada desarrollador, procesos que dependen de la memoria de los agentes — no mejora con el tiempo. forge sí.
