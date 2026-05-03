# Skill: db-migrate

Flujo seguro para ejecutar migraciones de base de datos. Compatible con Prisma, Drizzle,
ActiveRecord (Rails), Alembic (Python) y Goose (Go).

Triggers: /db-migrate, "migrar schema", "actualizar base de datos", "migrar BD",
"cambios en schema", "nueva migración".

---

## Cuándo usar este skill

- Al modificar el schema de la base de datos
- Antes y después de agregar modelos, columnas o índices
- Al resolver conflictos de migración entre branches

---

## Paso 1 — Determinar ambiente y ORM

El ORM está en `project.yaml` bajo `stack.database`. El ambiente determina el flujo:

| Ambiente | Objetivo |
|----------|---------|
| **Desarrollo local** | Iteración rápida, puede reiniciarse |
| **Staging** | Igual que producción, con datos de prueba |
| **Producción** | Sin pérdida de datos, con backup previo |

---

## Paso 2 — Validar antes de migrar (siempre)

### Prisma
```bash
npx prisma validate          # verifica que el schema compila
npx tsc --noEmit             # verifica que los tipos siguen siendo válidos
```

### Drizzle
```bash
npx drizzle-kit check        # detecta drift entre schema y BD
npx tsc --noEmit
```

### ActiveRecord (Rails)
```bash
rails db:migrate:status      # ver migraciones pendientes
```

### Alembic (Python)
```bash
alembic check                # compara heads con BD actual
```

### Goose (Go)
```bash
goose status                 # ver migraciones pendientes
```

---

## Paso 3 — Ejecutar migración

### Desarrollo

**Prisma**
```bash
npx prisma migrate dev --name <descripcion-snake-case>
# o para sync rápido sin historial:
npx prisma db push
```

**Drizzle**
```bash
npx drizzle-kit push         # sync directo
# o con historial:
npx drizzle-kit generate && npx drizzle-kit migrate
```

**Rails**
```bash
rails db:migrate
```

**Alembic**
```bash
alembic revision --autogenerate -m "descripcion"
alembic upgrade head
```

**Goose**
```bash
goose create descripcion sql
goose up
```

---

### Producción — pasos adicionales obligatorios

1. **Backup ANTES de migrar**
   ```bash
   # PostgreSQL genérico:
   pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

   # O usar el script del proyecto si existe (db:backup:prod)
   ```

2. **Verificar que la migración no es destructiva**
   ```bash
   # Leer el archivo SQL generado antes de aplicar
   # Señales de peligro: DROP COLUMN, DROP TABLE, TRUNCATE, NOT NULL sin default
   ```

3. **Aplicar en producción**

   **Prisma**: `npx prisma migrate deploy` (nunca `db push` en prod)

   **Drizzle**: `npx drizzle-kit migrate` (el proyecto debe tener un script dedicado)

   **Rails**: `RAILS_ENV=production rails db:migrate`

   **Alembic**: `alembic upgrade head` (con DATABASE_URL de producción)

   **Goose**: `goose -env production up`

---

## Paso 4 — Post-migración (siempre)

1. **Regenerar cliente/tipos** (si aplica)
   ```bash
   npx prisma generate          # Prisma
   npx drizzle-kit generate     # Drizzle (si usa tipos generados)
   ```

2. **Verificar que el build sigue pasando**
   ```bash
   # TypeScript: pnpm build / npm run build
   # Python: mypy . / pytest
   # Go: go build ./...
   ```

3. **Actualizar documentación** — si el proyecto tiene knowledge base (Obsidian, wiki), actualizar la sección de base de datos.

---

## Señales de alerta — STOP y consultar

```
✗ La migración contiene DROP COLUMN o DROP TABLE en producción sin backup confirmado
✗ El ORM reporta "drift" entre schema y BD — investigar causa antes de continuar
✗ npx prisma migrate reset o rails db:schema:load en producción → borra todo
✗ --force-reset / --force en cualquier contexto productivo
```

---

## Relación con otros skills

- `new-feature` lo invoca cuando la feature requiere cambios de schema.
- No depende de otros skills (es standalone).
- Si el proyecto usa Obsidian, actualizar vault después de migrar en producción.
