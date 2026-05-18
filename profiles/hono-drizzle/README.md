# Profile: hono-drizzle

Backend API con Hono + Drizzle ORM + PostgreSQL, ejecutado en Bun (dev) y Node 22 LTS (prod). Ideal para proyectos donde se necesita un API REST de alto rendimiento con tipado end-to-end.

## Agentes incluidos

- **api-engineer** — implementa endpoints Hono, schemas Drizzle, migraciones y tests con Vitest.

## Cuándo usar este profile

- El stack de backend usa Hono como framework HTTP.
- El ORM elegido es Drizzle (no Prisma, no TypeORM).
- La base de datos es PostgreSQL.
- El runtime de desarrollo es Bun.

## Hooks específicos del stack

| Hook | Evento | Descripción |
|---|---|---|
| `pre-edit-check.py` | PreToolUse/Edit\|Write | Detecta `console.log`/`debugger` en `.ts`/`.tsx`, bloquea secrets hardcodeados, protege `main` |
| `pre-bash-check.py` | PreToolUse/Bash | Bloquea `drizzle-kit push` sin `--force` en producción; bloquea `DROP TABLE`, `TRUNCATE`, `rm -rf /` |

Ver `core/hooks/hooks-registry.yaml` para la lista completa.

## Activar en project.yaml

```yaml
profiles:
  active:
    - hono-drizzle
```
