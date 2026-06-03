# Skill: aitmpl-search

Busca en el catálogo curado de forge: frameworks de agentes IA, MCP servers instalables,
profiles de stack y herramientas. La búsqueda es offline (catálogo local).

Triggers: /aitmpl-search, "buscar templates", "buscar en catálogo", "templates de AI",
"buscar template", "buscar MCP", "buscar profile".

---

## Cuándo usar este skill

- Cuando el usuario quiere explorar frameworks o herramientas de agentes IA
- Antes de diseñar un agente Tier 2 nuevo, para ver si ya existe un profile en forge
- Cuando se necesita instalar un MCP server y se quiere ver qué hay disponible
- Para explorar patrones de arquitectura de agentes reutilizables

---

## Protocolo

### Paso 1 — Ejecutar la búsqueda

Búsqueda por texto en el catálogo local:
```bash
forge aitmpl-search "<query>" --limit 10
```

Filtrar por categoría (`mcp-server`, `framework`, `profile`):
```bash
forge aitmpl-search --category mcp-server
```

Ver todas las categorías disponibles:
```bash
forge aitmpl-search --list-categories
```

Salida JSON (para integración o análisis):
```bash
forge aitmpl-search "<query>" --json
```

### Paso 2 — Analizar resultados

- Revisar los items más relevantes a la necesidad del proyecto
- Para MCP servers: verificar el campo `install` del resultado JSON para el comando exacto
- Para profiles: comparar con los profiles activos en `agents.profiles` de `project.yaml`
- Para frameworks: comparar con el stack del proyecto antes de sugerir adopción

### Paso 3 — Instalar (opcional)

Para MCP servers, el CLI interactivo ofrece instalación directa que escribe en `.claude/settings.json`.
Para profiles, ofrece agregar el profile a `project.yaml` directamente.

---

## No hagas

- No asumir que un resultado del catálogo está actualizado — verificar el repositorio antes de recomendar
- No crear agentes Tier 2 sin revisar si el stack ya tiene un profile en `profiles/`
- No instalar MCP servers sin verificar que el usuario tiene las dependencias requeridas
