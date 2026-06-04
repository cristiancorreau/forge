# Profile: flask

API REST construida con Flask 3 + application factory + blueprints + Flask-SQLAlchemy + Flask-Migrate (Alembic) + marshmallow/pydantic, con tests en pytest. Ideal para proyectos Python que quieren un micro-framework explícito y minimalista con control total sobre la estructura.

## Agentes incluidos

- **api-engineer** — implementa la `create_app()` factory, blueprints, modelos SQLAlchemy, schemas marshmallow/pydantic, migraciones Flask-Migrate y tests con el `test_client()` de Flask.

## Cuándo usar este profile

- El stack de backend usa Flask 3 (`requirements.txt`/`pyproject.toml` con `flask`).
- La estructura es application factory (`create_app()`) + blueprints.
- El ORM es Flask-SQLAlchemy (SQLAlchemy 2.x) con migraciones Flask-Migrate.
- La validación/serialización usa marshmallow o pydantic.
- El linter es ruff y los tests usan pytest.

## Hooks específicos del stack

| Hook | Evento | Descripción |
|---|---|---|
| `pre-edit-check.js` | PreToolUse/Edit\|Write | Detecta `print()` en archivos `.py` (usar `app.logger`); bloquea secrets hardcodeados; protege `main` |
| `pre-bash-check.js` | PreToolUse/Bash | Bloquea `flask db downgrade base` y `DROP TABLE` en contexto de producción |

Ver `core/hooks/hooks-registry.yaml` para la lista completa.

## Activar en project.yaml

```yaml
profiles:
  active:
    - flask
```
