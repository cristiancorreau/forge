---
marp: true
theme: default
paginate: true
---

# forge
## Evaluación técnica: ¿adoptar o no adoptar?

Framework de desarrollo con agentes de IA

**Análisis independiente — Mayo 2026**

---

## Agenda

1. ¿Qué es forge?
2. Arquitectura y propuesta de valor
3. Argumentos en contra
4. Argumentos a favor
5. Comparativa final
6. Veredicto y recomendación
7. Q&A

---

## ¿Qué es forge?

**Un framework de convenciones para equipos que usan agentes de IA en producción**

- No es una librería ni un CLI con magia interna
- Son archivos Markdown, YAML y scripts Python
- Se integra al proyecto como `git submodule`

```bash
git submodule add https://github.com/tu-org/forge .agentic
python3 .agentic/scripts/forge-init.py --tool claude-code
```

**Resultado:** `.claude/agents/`, `AGENTS.md`, `CLAUDE.md` generados desde un solo `project.yaml`

---

## Arquitectura de forge

**Tres componentes centrales:**

| Componente | Descripción |
|---|---|
| `project.yaml` | Fuente de verdad única del proyecto |
| Taxonomía de 3 tiers | Universal → Profile → Dominio |
| Skills componibles | Pipelines de calidad encadenables |

**Promesas del framework:**
- Agnóstico al runtime (Claude Code, OpenCode, Kiro)
- Compliance by design (GDPR, Ley 21.719, LGPD)
- Spec-Driven Development obligatorio

---

## Argumentos en contra (1/2)

**Los adapters alternativos no existen**

```
adapters/opencode/  ← directorio vacío
adapters/kiro/      ← directorio vacío
```

Solo Claude Code funciona realmente.

**Los profiles cubren 4 stacks en total**

```
expo · hono-drizzle · nextjs-admin · playwright-crawler
```

Django, Express, Laravel, NestJS, Nuxt: sin cobertura específica.

**Bug silencioso en `install_agent`:** el status `"OK"` nunca se devuelve. Todo se reporta como `"UPDATE"`.

---

## Argumentos en contra (2/2)

**El audit recomienda un comando que falla**

```python
"fix": f"forge-init.py --tool claude-code --force --only={agent['name']}"
# El flag --only no existe en forge-init.py
```

**La fuente de verdad no alimenta `CLAUDE.md`**

Las fases del sprint en `project.yaml` no se propagan al documento que los agentes leen. El usuario las actualiza a mano.

**No existe teardown command**

Salir de forge requiere limpieza manual de: submodule, `.claude/agents/`, hook de git, `project.yaml`. Sin guía de migración.

---

## Argumentos a favor (1/2)

**Taxonomía de 3 tiers: resuelve el problema del agente God-object**

- **Tier 1 (Universal):** orchestrator, security-auditor, compliance-reviewer — agnósticos al stack
- **Tier 2 (Profile):** api-engineer de hono-drizzle sabe sobre Drizzle ORM, Bun en dev, Node 22 en prod
- **Tier 3 (Dominio):** viven en el proyecto, forge los reconoce pero no los prescribe

**Reglas de seguridad específicas y verificables**

```
- Usá parámetros preparados siempre
- Verificá autenticación Y autorización en cada endpoint
- No loguear PII. Solo IDs hash o indicadores
- Logs de auditoría son append-only. NUNCA UPDATE ni DELETE
```

---

## Argumentos a favor (2/2)

**El skill `new-feature` codifica la definición de "done"**

6 fases secuenciales con condiciones de corte:
1. Verificar spec aprobada — si no existe, STOP
2. Leer docs del área antes de tocar código
3. Evaluar si justifica un team de agentes
4. Checklist de seguridad antes de escribir endpoints
5. Orden: schema → tipos → backend → frontend → build check
6. Post: spec actualizada, docs, deploy, marcar IMPLEMENTED

**Auditoría en CI con `--json`**

Detecta: frontmatter incompleto, modelo incorrecto, agentes desactualizados, huérfanos. Transforma estándares en reglas ejecutables.

---

## Tabla comparativa

| Dimensión | A favor | En contra |
|---|---|---|
| Arquitectura de agentes | Taxonomía 3 tiers coherente | Solo 4 profiles implementados |
| Fuente de verdad | `project.yaml` centraliza todo | Fases del sprint no se propagan |
| Seguridad | Reglas específicas y verificables | Compliance sin acceso a texto legal |
| Multi-runtime | Diseño limpio de separación | OpenCode y Kiro: directorios vacíos |
| Auditoría | Output JSON integrable en CI | Flag `--only` del fix no existe |
| Actualización | Propagación desde repositorio central | `--force` destruye customizaciones |

---

## Veredicto y recomendación

**Adoptar SI:**
- Equipo de 3-8 personas con agentes activos en producción
- Stack: expo, hono-drizzle, nextjs-admin, o playwright-crawler
- Runtime: Claude Code (único con soporte real)
- Necesidades de compliance (GDPR, Ley 21.719, LGPD)
- Tolerancia a customizaciones mínimas (riesgo de `--force`)

**No adoptar SI:**
- Stack fuera de los 4 profiles implementados
- Equipo de 1-2 personas en modo exploración
- Requisito de multi-runtime
- Customizaciones extensas de agentes que no pueden sobreescribirse

---

## Conclusión

**forge tiene ideas maduras en una implementación temprana.**

La arquitectura conceptual es correcta y resuelve problemas reales. El estado del código cubre el camino feliz con Claude Code y cuatro stacks. Los caminos alternativos no están implementados.

**La decisión correcta es calibrar las expectativas:**
- Adoptar con los ojos abiertos sobre qué está implementado y qué es promesa de diseño
- Los equipos que adopten hoy apuestan en parte a la dirección futura del proyecto

---

## Q&A

**Repositorio analizado:** forge, commit `d828157`

**Contacto para preguntas sobre el análisis:**  
Informe técnico independiente — Mayo 2026

