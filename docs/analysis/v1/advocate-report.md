# Por qué adoptar forge: análisis técnico del framework

**Analista:** revisión directa del código fuente  
**Fecha:** mayo 2026  
**Repositorio analizado:** `forge/` — commit `d828157`

---

## 1. Resumen ejecutivo

forge es un framework de trabajo para equipos que desarrollan software con agentes de IA. No es una librería ni un CLI con magia interna: es un conjunto de convenciones codificadas en archivos Markdown, YAML y scripts Python que fuerzan a los agentes a comportarse de forma predecible, segura y auditada.

La propuesta central es sólida y comprobable leyendo el código: un solo archivo (`project.yaml`) actúa como fuente de verdad de todo el proyecto. A partir de él, scripts determinísticos generan la configuración para múltiples runtimes de agentes (Claude Code, OpenCode, Kiro). Los agentes instanciados desde esa configuración tienen scope estricto, reglas de seguridad no negociables y un workflow de implementación que exige spec antes que código.

El resultado práctico: un equipo que adopta forge reduce significativamente la superficie de errores introducidos por agentes que improvisan fuera de su dominio, ejecutan migraciones sin backup, o implementan endpoints sin verificación de autorización.

---

## 2. Análisis técnico detallado

### 2.1 Arquitectura de agentes en tres tiers

La taxonomía de agentes es la decisión de diseño más importante del framework, y está implementada con coherencia. El archivo `docs/agent-standard.md` define tres niveles con criterios de clasificación claros:

- **Tier 1 — Universal** (`core/agents/`): agentes definidos por su tipo de output, no por tecnología. El `orchestrator`, `security-auditor`, `compliance-reviewer` y `test-engineer` son genuinamente agnósticos al stack porque sus responsabilidades no cambian entre Rails, Hono o FastAPI.

- **Tier 2 — Profile** (`profiles/<stack>/agents/`): mismo rol que Tier 1 pero con instrucciones específicas al stack. El `api-engineer` de `hono-drizzle` sabe que el ORM es Drizzle, que las migraciones reversibles requieren un `down` manual, y que el runtime en dev es Bun pero en producción es Node 22 LTS. Esa especificidad no podría estar en un agente genérico sin polucionarlo.

- **Tier 3 — Dominio** (solo en el proyecto): agentes que conocen conceptos del negocio. No van al repositorio de forge, viven en el proyecto. El framework los reconoce, los verifica en la auditoría y los declara en `project.yaml`, pero no los prescribe.

Esta separación resuelve un problema real: sin ella, los equipos terminan con agentes God-object que saben "todo" pero no tienen criterio para decidir cuándo aplicar qué. Con el sistema de tiers, el orchestrator puede leer el `description` de cada agente en una línea y tomar decisiones de delegación correctas.

La implementación concreta en `forge-init.py` respeta la jerarquía: los profiles se instalan primero y tienen precedencia sobre core, evitando colisiones silenciosas.

### 2.2 `project.yaml` como fuente de verdad única

El archivo `templates/project.yaml.tpl` cubre exactamente lo necesario para describir un proyecto en términos que los scripts pueden procesar: stack técnico, agentes activos, skills habilitados, configuración de compliance, rutas de specs y configuración de deploy.

Lo relevante no es la estructura del YAML en sí sino lo que esta fuente de verdad habilita:

1. `forge-init.py` lee `project.yaml` y genera `.claude/agents/`, `AGENTS.md`, comandos de Claude Code y la estructura de wiki, todo en un solo comando.
2. `generate-claude-md.py` genera `CLAUDE.md` con comandos correctos para el lenguaje del proyecto (TypeScript vs Python vs Go vs Ruby) y con la sección de compliance solo si hay frameworks configurados.
3. `forge-audit.py` compara el estado actual del proyecto contra lo declarado en `project.yaml` y detecta huérfanos, agentes desactualizados y oportunidades de mejora.
4. El pre-commit hook inyecta estadísticas de tokens en `docs/progress.html` antes de cada commit, sin commits adicionales ni race conditions.

Todo el toolchain orbita alrededor del mismo archivo. Cambiar el stack o agregar un framework de compliance se hace en un lugar y se propaga al resto con un re-run de init.

### 2.3 Seguridad codificada en las instrucciones de los agentes

Los agentes de forge no mencionan seguridad como aspiración: la codifican como reglas específicas y verificables. Ejemplos concretos del código:

El `backend-engineer` (Tier 1) tiene reglas explícitas y no ambiguas:
- "Usá parámetros preparados siempre — nunca concatenar inputs en queries SQL."
- "Verificá autenticación Y autorización en cada endpoint."
- "No loguear PII. Solo IDs hash o indicadores."
- "No exponer detalles técnicos de errores al cliente en producción."

El `api-engineer` de `hono-drizzle` agrega restricciones específicas al stack:
- "Logs de auditoría son append-only. NUNCA `UPDATE` ni `DELETE` sobre tablas de eventos."
- "Multi-tenancy: toda query filtra por `tenant_id`. Sin excepciones."
- "Migraciones reversibles: toda migración tiene `down`."

El skill `security-audit` incluye comandos de escaneo concretos con grep patterns para detectar endpoints sin verificación de sesión, queries con interpolación de strings y bodies sin validación de schema. No es teoría: son comandos que un agente puede ejecutar.

El `compliance-reviewer` tiene poder de veto codificado ("tenés poder de veto — si algo no cumple, el PR no puede mergearse") y un checklist que cubre consentimiento, logs de auditoría, derechos DSAR y datos en tránsito.

### 2.4 El skill `new-feature` como pipeline de calidad

El skill `new-feature` (`core/skills/new-feature/SKILL.md`) es el elemento más ambicioso del framework porque codifica el proceso completo de implementación en seis fases secuenciales con condiciones de corte:

1. Verificar spec aprobada — si no existe, STOP.
2. Leer documentación del área antes de tocar código.
3. Evaluar si la tarea justifica un team de agentes o un solo agente.
4. Checklist de seguridad antes de escribir endpoints.
5. Orden de implementación: schema → tipos compartidos → backend → frontend → build check.
6. Post-implementación: actualizar spec, screenshot de evidencia si hay UI, actualizar docs, deploy, marcar spec como IMPLEMENTED.

Este pipeline tiene un efecto importante: hace que los agentes no puedan "terminar" una tarea sin haber pasado por security audit, sin haber verificado el deploy, y sin haber actualizado la documentación. El checklist final del skill es la lista de criterios de "done" del equipo.

### 2.5 Skills componibles sin acoplamiento

El diseño de skills evita un error común: el acoplamiento circular. El README de skills documenta explícitamente qué invoca qué:

```
new-feature orquesta: spec, phase-kickoff, security-audit, db-migrate, browser-test (opt), local2prod
local2prod invoca: obsidian-sync (opt)
security-audit: standalone
db-migrate: standalone
```

Las dependencias opcionales se resuelven por configuración en `project.yaml`, no por lógica condicional en el skill. Si `browser-test` no está en `skills.active`, `new-feature` lo saltea silenciosamente. No hay código que falle si una integración opcional no está presente.

### 2.6 Auditoría automatizada

`forge-audit.py` es una herramienta de health check que cualquier proyecto puede correr en CI con `--json` para integrar en pipelines existentes. Lo que detecta:

- **Frontmatter incompleto**: verifica que cada agente tenga `name`, `description`, `model`, `tools` y `tier`.
- **Modelo incorrecto**: advierte si un agente de compliance o security usa Sonnet en lugar de Opus (las decisiones complejas justifican el modelo más capaz), y advierte el camino inverso (Opus en agentes de implementación, innecesariamente caro).
- **Similitud con forge**: calcula la similitud textual entre el agente del proyecto y la versión de forge para detectar desactualizaciones. Distingue entre especialización intencional (el proyecto tiene más líneas que forge) y un agente que simplemente no se actualizó.
- **Huérfanos**: agentes en `.claude/agents/` que no están declarados en `project.yaml`.
- **Oportunidades**: profiles y skills disponibles en forge que el proyecto no usa.

El output tiene colores ANSI en TTY y es silencioso en CI (`--json`). El nivel de madurez de este script es inusualmente alto para la etapa del proyecto.

### 2.7 Agnóstico al runtime desde el diseño

forge soporta Claude Code, OpenCode y Kiro con el mismo `project.yaml`. La separación entre definición (YAML) y adaptación (scripts por runtime) es limpia:

- `adapters/claude-code/generate-claude-md.py` genera `CLAUDE.md`
- `forge-init.py --tool kiro` genera `.kiro/steering/`
- El mismo script con `--tool claude-code` genera `.claude/agents/`

Cuando aparezca un nuevo runtime de agentes con su propia convención de archivos de configuración, se agrega un nuevo adapter sin tocar el core.

---

## 3. Casos de uso ideales

**Equipos de 2 a 8 personas con agentes IA en el loop activo.** forge no aporta valor para proyectos sin agentes o donde los agentes se usan ocasionalmente para autocompletado. Su valor está en proyectos donde los agentes generan código que va a producción con supervisión humana, no donde el humano revisa cada línea de todos modos.

**Proyectos con requisitos de compliance.** Si el proyecto maneja PII o tiene obligaciones regulatorias (GDPR, LGPD, Ley 21.719 chilena, CCPA), tener el `compliance-reviewer` configurado con poder de veto desde el inicio es mucho más barato que retrofittear compliance después. El framework ya tiene el checklist correcto.

**Monorepos con múltiples stacks.** Un proyecto con backend en Hono + dashboard en Next.js + app móvil en Expo puede activar los tres profiles (`hono-drizzle`, `nextjs-admin`, `expo`) y cada agente sabe exactamente en qué directorio trabaja y qué está fuera de su scope.

**Equipos que crecen.** Cuando se incorpora un desarrollador nuevo (humano o agente), la configuración está en `project.yaml` y los agentes están en `.claude/agents/`. No hay onboarding informal: las reglas están escritas y son ejecutables.

**Proyectos con rotación de herramientas.** La neutralidad entre Claude Code, OpenCode y Kiro protege la inversión: si el equipo migra de runtime, el `project.yaml` y los agentes del core no cambian.

---

## 4. ROI y beneficios de estandarización en equipos

### Reducción de errores de scope

Sin un framework, los agentes tienden a resolver el problema más amplio que pueden: un agente al que se le pide "agregar un endpoint" puede terminar modificando el frontend, el schema y el CLAUDE.md raíz, todos en el mismo contexto. forge fuerza a declarar el scope en el `description` del frontmatter y en la sección "No hagas" de cada agente. El orchestrator lee ese description para delegar.

### Estandarización de prácticas de seguridad sin training adicional

Las reglas de seguridad están en los archivos de los agentes, no en los heads de los desarrolladores. Un agente instanciado desde `backend-engineer.md` tiene las mismas restricciones de SQL injection y PII que uno instanciado hace seis meses por otro miembro del equipo. No se degrada con el tiempo ni se olvida.

### Costo de contexto controlado

El hook de pre-commit que actualiza las estadísticas de tokens en `docs/progress.html` permite a los equipos visualizar el costo real de cada sesión de agentes por tarea. A medida que el token-stats script identifica agentes por nombre, el equipo puede ver qué agentes consumen más contexto y optimizar sus instrucciones.

### Menor tiempo de onboarding para proyectos nuevos

El flujo completo de setup es un único comando: `python3 .agentic/scripts/forge-init.py --tool claude-code`. El resultado es un directorio `.claude/agents/` con los agentes correctos para el stack, un `AGENTS.md` documentando el roster y un `CLAUDE.md` con comandos reales del proyecto. Un desarrollador nuevo tiene contexto completo del equipo de agentes en minutos.

### Actualización centralizada de estándares

Cuando forge actualiza un agente del core (por ejemplo, para agregar una nueva regla de seguridad tras un CVE), los proyectos que usan forge como submódulo pueden correr `forge-audit.py` para detectar la discrepancia y `forge-init.py --force` para actualizarla. Sin forge, cada proyecto tiene sus propias instrucciones de agentes que se desactualizan de forma independiente.

### Compliance audit en CI

La opción `--json` de `forge-audit.py` permite integrar la auditoría en cualquier pipeline de CI. Un equipo puede configurar que un proyecto falle el pipeline si tiene agentes sin frontmatter completo o sin la sección "No hagas". Esto hace que los estándares sean ejecutables, no aspiracionales.

---

## 5. Conclusión: por qué sí recomendamos este framework

La alternativa a forge no es "no tener framework": es tener instrucciones de agentes en archivos dispersos, reglas de seguridad que cada miembro del equipo codifica (o no codifica) de manera distinta, y procesos de implementación que dependen de que el agente "recuerde" hacer el security check antes de escribir endpoints.

forge es una respuesta concreta a un problema concreto: cómo hacer que un equipo de agentes de IA se comporte de forma predecible, segura y auditable en proyectos reales. No lo resuelve con magia sino con convenciones escritas, verificadas por scripts determinísticos y actualizables desde un repositorio central.

Las fortalezas que encontramos en el código son genuinas:

1. La taxonomía de tres tiers resuelve el problema de agentes God-object con un criterio de clasificación que cualquier desarrollador puede aplicar.
2. El `project.yaml` como fuente de verdad única elimina la divergencia entre lo que el equipo dice que hace y lo que los agentes efectivamente están configurados para hacer.
3. Las reglas de seguridad y compliance en los archivos de agentes son específicas, verificables y no se degradan con el tiempo.
4. El sistema de skills componibles permite construir pipelines de implementación completos sin acoplamiento circular.
5. La auditoría automatizada con output JSON hace que los estándares sean ejecutables en CI, no documentación que nadie lee.

Para equipos que ya usan agentes de IA en producción, adoptar forge reduce la carga cognitiva de mantener la calidad del team de agentes al mismo nivel que la calidad del código que producen.
