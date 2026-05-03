# Informe técnico de análisis: forge

---

**Título:** Evaluación técnica del framework forge para desarrollo con agentes de IA  
**Fecha:** 3 de mayo de 2026  
**Versión:** 1.0  
**Base de análisis:** Repositorio forge, commit `d828157`  
**Clasificación:** Análisis técnico independiente

---

## Resumen ejecutivo

El presente informe evalúa forge, un framework de trabajo para equipos que desarrollan software con agentes de IA. El análisis integra dos perspectivas técnicas independientes —una crítica y una favorable— sobre la misma base de código, con el objetivo de producir una evaluación balanceada que permita a equipos de desarrollo tomar una decisión informada sobre la adopción del framework.

forge se presenta como un conjunto de convenciones codificadas en archivos Markdown, YAML y scripts Python, con el propósito de hacer que los agentes de IA se comporten de forma predecible, segura y auditable. Sus propuestas centrales son: un `project.yaml` como fuente de verdad única, una taxonomía de agentes en tres niveles (Universal, Profile, Dominio), skills componibles, y soporte para compliance regulatorio.

La conclusión principal del análisis es que forge contiene ideas de diseño sólidas implementadas parcialmente. La arquitectura conceptual es correcta y resuelve problemas reales de equipos que usan agentes en producción. Sin embargo, el estado actual de la implementación —adapters para runtimes alternativos vacíos, ecosistema de profiles reducido a cuatro stacks, bugs en el tooling de auditoría— limita su aplicabilidad a casos de uso específicos y condiciona la recomendación de adopción.

---

## 1. Introducción y contexto

### 1.1 El problema que forge intenta resolver

El desarrollo de software asistido por agentes de IA enfrenta un problema de coordinación que se vuelve crítico a escala de equipo: sin convenciones explícitas, los agentes tienden a actuar fuera del scope asignado, implementar funcionalidades sin verificación de seguridad, producir código inconsistente entre sesiones, y desactualizarse de las prácticas del equipo a medida que el proyecto evoluciona.

forge propone una respuesta estructural: codificar las convenciones del equipo en archivos que los agentes leen, versionados en un repositorio central, y propagados a los proyectos mediante scripts determinísticos.

### 1.2 Descripción del framework

forge se integra a un proyecto mediante git submodule. Una vez instalado, el desarrollador describe su proyecto en un `project.yaml` y ejecuta `forge-init.py` para generar la configuración de los agentes. La estructura del repositorio incluye:

- `core/agents/`: agentes genéricos independientes del stack (orchestrator, backend-engineer, security-auditor, compliance-reviewer, test-engineer, frontend-engineer, mobile-engineer).
- `profiles/<stack>/agents/`: agentes especializados por stack tecnológico.
- `core/skills/`: skills reutilizables (new-feature, security-audit, db-migrate, local2prod, browser-test).
- `adapters/`: scripts para generar configuración en distintos runtimes de agentes (Claude Code, OpenCode, Kiro).
- `scripts/`: herramientas de gestión (forge-init.py, forge-audit.py, token-stats.py).
- `hooks/`: hook de pre-commit para estadísticas de tokens.

### 1.3 Alcance del análisis

El análisis cubre el commit `d828157` del repositorio forge. Los archivos analizados incluyen: `README.md`, `templates/project.yaml.tpl`, `scripts/forge-init.py`, `scripts/forge-audit.py`, `adapters/claude-code/generate-claude-md.py`, siete agentes del core, `core/skills/README.md`, cuatro skills, cuatro profiles, `hooks/pre-commit`, `docs/agent-standard.md`, y `core/workflows/sdd.md`.

---

## 2. Metodología de análisis

El análisis se realizó mediante lectura directa del código fuente, sin ejecutar el framework en un entorno de prueba. Se adoptó un enfoque adversarial estructurado: dos analistas independientes revisaron el mismo repositorio con instrucciones opuestas (uno buscando argumentos en contra, otro en favor) y produjeron informes separados. El presente documento integra ambos informes con el objetivo de producir una evaluación libre de sesgos de confirmación.

La evaluación de cada componente siguió tres preguntas: (1) ¿Qué problema declara resolver este componente? (2) ¿El código implementa efectivamente esa solución? (3) ¿Qué condiciones deben cumplirse para que la implementación aporte valor neto positivo?

---

## 3. Hallazgos del análisis crítico

### 3.1 Los adapters para runtimes alternativos no existen

El README promete compatibilidad con Claude Code, OpenCode, Codex y otros runtimes. La inspección revela:

- `adapters/claude-code/`: funcional.
- `adapters/opencode/`: directorio vacío. Cero archivos.
- `adapters/kiro/`: directorio vacío. Cero archivos.

La función `init_kiro()` en `forge-init.py` existe y genera dos archivos `.md` con contenido genérico. La comparación de complejidad es ilustrativa: `init_claude_code` tiene aproximadamente 130 líneas de lógica; `init_kiro` tiene aproximadamente 30 y produce documentos de placeholder sin aprovechar ningún concepto del framework.

### 3.2 El ecosistema de profiles cubre cuatro stacks

```
profiles/
├── expo/agents/mobile-engineer.md
├── hono-drizzle/agents/api-engineer.md
├── nextjs-admin/agents/admin-engineer.md
└── playwright-crawler/agents/scanner-engineer.md
```

Cuatro profiles, un agente cada uno. El propio `agent-standard.md` lista `rails` y `fastapi` como "pendiente". Django, Express, Laravel, NestJS y Nuxt no tienen cobertura. Los equipos en esos stacks reciben únicamente los agentes genéricos Tier 1 con instrucciones como "adaptá si el proyecto usa nombres distintos": exactamente lo que forge pretende eliminar.

### 3.3 Bug en la función `install_agent`

```python
def install_agent(src: Path, dst: Path, name: str, source_label: str) -> str:
    if not src.exists():
        return "MISS"
    if dst.exists() and not FORCE:
        return "KEEP"
    shutil.copy2(src, dst)
    return "UPDATE" if dst.exists() else "OK"
```

La evaluación `dst.exists()` ocurre después de que `shutil.copy2` ya copió el archivo. En consecuencia, `dst.exists()` siempre es `True` en ese punto, y el status `"OK"` nunca se devuelve: toda instalación se reporta como `"UPDATE"`. Evidencia de ausencia de tests sobre el tooling propio.

### 3.4 El audit recomienda un comando inexistente

`forge-audit.py` genera mensajes de corrección:

```python
"fix": f"forge-init.py --tool claude-code --force --only={agent['name']}"
```

El flag `--only` no existe en `forge-init.py`. Un desarrollador que siga la recomendación ejecutará un comando que falla.

### 3.5 El generador de `CLAUDE.md` desconecta la fuente de verdad

El `project.yaml` contiene una sección `sprint.phases`. El `generate-claude-md.py` genera una sección "Phases activas y estado" con contenido fijo:

```
- **Completadas:** —
- **En curso:** —
- **Pendientes:** —
```

El usuario debe actualizar manualmente la sección más dinámica del documento más importante que los agentes leerán, contradiciendo el propósito de la generación automática.

### 3.6 El pre-commit hook muta archivos sin visibilidad del desarrollador

El hook ejecuta `token-stats.py`, modifica `docs/progress.html`, y hace `git add` sobre ese archivo antes de completar el commit. El archivo entra al commit sin haber sido inspeccionado. Los errores del script se suprimen con `|| true`, haciendo que los fallos sean silenciosos.

---

## 4. Hallazgos del análisis favorable

### 4.1 La taxonomía de tres tiers resuelve el problema de los agentes God-object

El `docs/agent-standard.md` define tres niveles con criterios aplicables:

- **Tier 1 (Universal):** definidos por tipo de output, no por tecnología. El orchestrator, security-auditor, compliance-reviewer y test-engineer son genuinamente agnósticos al stack.
- **Tier 2 (Profile):** mismo rol que Tier 1 con instrucciones específicas al stack. El `api-engineer` de `hono-drizzle` sabe que las migraciones reversibles requieren un `down` manual y que el runtime en dev es Bun pero en producción es Node 22 LTS.
- **Tier 3 (Dominio):** agentes que conocen conceptos del negocio. Viven en el proyecto, no en forge.

Esta separación da al orchestrator criterio para delegar correctamente leyendo el `description` de cada agente en una línea.

### 4.2 Las reglas de seguridad son específicas y verificables

El `backend-engineer` incluye instrucciones no ambiguas:

```
- Usá parámetros preparados siempre — nunca concatenar inputs en queries SQL
- Verificá autenticación Y autorización en cada endpoint
- No loguear PII. Solo IDs hash o indicadores
- No exponer detalles técnicos de errores al cliente en producción
```

El `api-engineer` de `hono-drizzle` agrega restricciones específicas al stack:

```
- Logs de auditoría son append-only. NUNCA UPDATE ni DELETE sobre tablas de eventos
- Multi-tenancy: toda query filtra por tenant_id. Sin excepciones
- Migraciones reversibles: toda migración tiene down
```

Estas reglas no se olvidan, no se degradan entre sesiones y se aplican de forma consistente.

### 4.3 El skill `new-feature` codifica un pipeline de calidad completo

El skill define seis fases secuenciales con condiciones de corte: verificar spec aprobada, leer documentación del área, evaluar si justifica un team de agentes, checklist de seguridad, orden de implementación (schema → tipos → backend → frontend → build check), y post-implementación completa (actualizar spec, screenshot de evidencia, docs, deploy, marcar como IMPLEMENTED).

Los agentes no pueden "terminar" una tarea sin haber pasado por security audit y haber verificado el deploy.

### 4.4 El diseño de skills evita el acoplamiento circular

```
new-feature orquesta: spec, phase-kickoff, security-audit, db-migrate,
                      browser-test (opt), local2prod
local2prod invoca: obsidian-sync (opt)
security-audit: standalone
db-migrate: standalone
```

Las dependencias opcionales se resuelven por configuración en `project.yaml`. Si `browser-test` no está en `skills.active`, `new-feature` lo saltea silenciosamente sin romper el pipeline.

### 4.5 La auditoría automatizada tiene valor real en CI

`forge-audit.py` acepta `--json` para integración en CI. Detecta: frontmatter incompleto, modelo incorrecto (Sonnet en lugar de Opus para compliance y security), agentes desactualizados, huérfanos no declarados en `project.yaml`, y oportunidades de activar profiles o skills disponibles. Esta capacidad transforma los estándares de documentación aspiracional a reglas ejecutables.

---

## 5. Análisis comparativo

### 5.1 Diseño vs. implementación

El análisis revela una brecha consistente entre la calidad del diseño conceptual y el estado de la implementación. La taxonomía de tres tiers, el `project.yaml` como fuente de verdad, el grafo de dependencias de skills y la separación entre definición y adaptación son decisiones de diseño sólidas. El código cubre el camino feliz con Claude Code y cuatro stacks, con bugs y omisiones en los caminos alternativos.

Esta brecha no invalida el framework, pero sí define el perfil de adopción: equipos cuyo caso de uso coincide exactamente con el camino feliz implementado.

### 5.2 Comparación con alternativas

La alternativa más común es escribir agentes directamente en `.claude/agents/` sin framework: costo de 30 minutos para un `CLAUDE.md` inicial, control total, sin dependencias. forge agrega valor cuando el equipo necesita propagación consistente de reglas de seguridad entre proyectos, agentes especializados por stack mantenidos centralmente, auditoría en CI, o compliance con poder de veto.

### 5.3 Riesgos sistémicos

Los riesgos más significativos no son los bugs individuales sino los patrones:

- **Actualización destructiva:** `--force` sobreescribe customizaciones sin merge. Con el tiempo, los equipos dejan de actualizar los agentes para proteger sus customizaciones, invirtiendo el beneficio central.
- **Dependencia sin escape:** no existe teardown command. La salida requiere limpieza manual.
- **Falsa seguridad en compliance:** el `compliance-reviewer` es un primer filtro valioso, pero el framework no advierte que opera sin acceso a texto legal oficial.

---

## 6. Conclusiones y recomendaciones

### Conclusión general

forge es un framework con arquitectura conceptual correcta e implementación en estado temprano. Es recomendable para equipos de 3 a 8 personas usando Claude Code como runtime principal con un stack cubierto por los profiles existentes y necesidades de compliance o estandarización de seguridad. No es recomendable para equipos con stacks fuera de los cuatro profiles, equipos que requieren multi-runtime, equipos pequeños en exploración, o proyectos con customizaciones extensas.

### Recomendaciones para equipos que adopten forge

1. Documentar la política de uso de `--force`: cuándo está permitido sobreescribir agentes customizados.
2. No confiar en los mensajes de fix del audit para comandos con el flag `--only`: ese flag no existe.
3. Verificar manualmente la sección de fases del sprint en `CLAUDE.md` después de cada regeneración.
4. Tratar el `compliance-reviewer` como primer filtro, no como revisión legal suficiente.

### Recomendaciones para el equipo de forge

1. Implementar los adapters para OpenCode y Kiro o remover su mención del README hasta que estén disponibles.
2. Corregir el flag `--only` en los mensajes del audit o implementar el flag en `forge-init.py`.
3. Conectar la sección `sprint.phases` de `project.yaml` con la generación de `CLAUDE.md`.
4. Agregar un comando de teardown documentado.
5. Implementar un mecanismo de merge para actualizaciones de agentes que no destruya customizaciones.

---

## Anexos

### Anexo A: Estado de los adapters (mayo 2026)

```
adapters/
├── claude-code/
│   ├── generate-claude-md.py   <- implementado
│   └── commands/wiki/          <- implementado
├── opencode/                   <- directorio vacio
└── kiro/                       <- directorio vacio
```

### Anexo B: Bug en `install_agent`

```python
# scripts/forge-init.py
def install_agent(src: Path, dst: Path, name: str, source_label: str) -> str:
    if not src.exists():
        return "MISS"
    if dst.exists() and not FORCE:
        return "KEEP"
    shutil.copy2(src, dst)
    # dst.exists() siempre True despues de copy2
    # El status "OK" nunca se devuelve
    return "UPDATE" if dst.exists() else "OK"
```

### Anexo C: Inventario de profiles (mayo 2026)

```
profiles/
├── expo/agents/mobile-engineer.md
├── hono-drizzle/agents/api-engineer.md
├── nextjs-admin/agents/admin-engineer.md
└── playwright-crawler/agents/scanner-engineer.md
```

Stacks pendientes segun agent-standard.md: rails, fastapi.  
Stacks sin mención: Django, Express, Laravel, NestJS, Nuxt.

---

*Informe generado el 3 de mayo de 2026. Base de análisis: commit `d828157` del repositorio forge.*
