# Contribuir a forge

## Cómo contribuir

### Reportar issues
Abre un issue en GitHub describiendo el problema, los pasos para reproducirlo y el comportamiento esperado.

### Añadir un profile Tier 2
Los profiles viven en `profiles/<nombre>/agents/<agente>.md`. Usa el scaffold para generar el esqueleto:

```bash
python3 .agentic/scripts/forge-scaffold-profile.py --name <stack> --engineer <agente>
```

El agente debe seguir el estándar en `docs/agent-standard.md` (versión actual: `1.0`).
Agrega el nombre del profile a los parametrize en `tests/test_profiles.py` y una entrada al `CATALOG` en `scripts/aitmpl-search.py`.

### Añadir un MCP server al catálogo
Edita `scripts/aitmpl-search.py`, sección `CATALOG`. Incluye el campo `install`:

```python
{
    "name":     "MCP — mi-server",
    "category": "mcp-server",
    "install": {
        "slug":    "mi-server",
        "command": "npx",
        "args":    ["-y", "@org/mcp-server"],
        "params":  [],
        "env":     [{"key": "API_KEY", "label": "API key del servicio"}],
    },
},
```

### Modificar un agente core
Los agentes core están en `core/agents/`. Si cambias frontmatter o secciones obligatorias, actualiza `docs/agent-standard.md` e incrementa `STANDARD_VERSION` en `scripts/forge-audit.py`.

### Tests
```bash
python3 -m pytest tests/ -q   # debe pasar al 100%
```

## Estilo de commits
Conventional Commits en inglés: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

## Gobernanza
Proyecto mantenido por [@cristiancorreau](https://github.com/cristiancorreau). PRs bienvenidos. Para cambios grandes, abre un issue primero.
