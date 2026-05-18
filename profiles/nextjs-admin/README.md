# Profile: nextjs-admin

Dashboard de administración construido con Next.js 15 App Router + shadcn/ui + Tailwind 4. Diseñado para proyectos que necesitan un panel de administración interno con server components, TanStack Query y tests E2E con Playwright.

## Agentes incluidos

- **admin-engineer** — construye el dashboard de admin: server components, client components con shadcn/ui, formularios con React Hook Form + Zod, y tablas/charts con Recharts.

## Cuándo usar este profile

- El proyecto necesita un panel de administración con Next.js 15.
- La librería de UI es shadcn/ui (no Material UI, no Chakra).
- El estado del servidor se maneja con TanStack Query.
- El directorio de admin está separado del frontend público (`apps/admin/` o `packages/admin/`).

## Hooks específicos del stack

| Hook | Evento | Descripción |
|---|---|---|
| `pre-edit-check.py` | PreToolUse/Edit\|Write | Detecta `console.log`/`debugger` en `.ts`/`.tsx`, bloquea secrets hardcodeados, protege `main` |
| `pre-bash-check.py` | PreToolUse/Bash | Bloquea `prisma migrate reset` en producción si el proyecto usa Prisma como ORM |
| `prisma-safety.py` | PreToolUse/Bash | Protección adicional para migraciones Prisma destructivas (stack: nextjs-admin) |

Ver `core/hooks/hooks-registry.yaml` para la lista completa.

## Activar en project.yaml

```yaml
profiles:
  active:
    - nextjs-admin
```
