# Skill: aitmpl-search

Busca templates de AI en aitmpl.com para explorar patrones de agentes, prompts
y arquitecturas reutilizables que se puedan integrar en el proyecto.

Triggers: /aitmpl-search, "buscar en aitmpl", "templates de AI", "buscar template",
"aitmpl", "templates aitmpl".

---

## Cuándo usar este skill

- Cuando el usuario quiere explorar templates de agentes IA para un stack específico
- Antes de diseñar un agente Tier 2 nuevo, para ver si hay patrones establecidos
- Cuando se necesita inspiración para estructurar un workflow de agentes

---

## Protocolo

### Paso 1 — Ejecutar la búsqueda

```bash
python3 .agentic/scripts/aitmpl-search.py "<query>" --limit 10
```

Para filtrar por categoría:
```bash
python3 .agentic/scripts/aitmpl-search.py "<query>" --category "<cat>"
```

Para salida estructurada (integración CI o análisis):
```bash
python3 .agentic/scripts/aitmpl-search.py "<query>" --json
```

### Paso 2 — Analizar resultados

- Revisar los templates más relevantes a la necesidad del proyecto
- Identificar patrones de instrucciones reutilizables
- Comparar con los agentes existentes en `core/agents/` y `profiles/`

### Paso 3 — Integrar (opcional)

Para descargar un template específico:
```bash
python3 .agentic/scripts/aitmpl-search.py --install "<url-o-nombre>"
```

El template se guarda en `.forge/templates/<slug>/template.html`.
Extraer las instrucciones relevantes y adaptarlas al formato de agente forge
(ver `docs/agent-standard.md` para la estructura correcta).

---

## No hagas

- No copiar templates directamente sin adaptarlos al formato forge
- No crear agentes Tier 2 sin revisar si el stack ya tiene un profile en `profiles/`
- No omitir las secciones "No hagas" y "Reglas" al adaptar templates externos
