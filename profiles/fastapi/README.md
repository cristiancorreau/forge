# Profile: fastapi

API REST asíncrona construida con FastAPI + SQLAlchemy 2.x (async) o SQLModel + Alembic + PostgreSQL. Diseñada para proyectos Python que necesitan tipado estricto con Pydantic v2, dependency injection nativa de FastAPI y tests con pytest + httpx.

## Agentes incluidos

- **api-engineer** — implementa routers FastAPI, schemas Pydantic, modelos SQLAlchemy/SQLModel, migraciones Alembic y tests de integración con AsyncClient.

## Cuándo usar este profile

- El stack de backend usa FastAPI.
- El ORM es SQLAlchemy 2.x async o SQLModel.
- Las migraciones se gestionan con Alembic.
- El linter es ruff + mypy en modo strict.
- El runtime es Python 3.11+.

## Hooks específicos del stack

| Hook | Evento | Descripción |
|---|---|---|
| `pre-edit-check.py` | PreToolUse/Edit\|Write | Detecta `print()` en archivos `.py` que no sean scripts de forge ni archivos en `.agentic/`; bloquea secrets hardcodeados; protege `main` |
| `pre-bash-check.py` | PreToolUse/Bash | Bloquea `alembic downgrade base` y `DROP TABLE` en contexto de producción |

Ver `core/hooks/hooks-registry.yaml` para la lista completa.

## Activar en project.yaml

```yaml
profiles:
  active:
    - fastapi
```
