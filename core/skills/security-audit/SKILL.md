# Skill: security-audit

Checklist de seguridad para endpoints de API y módulos que manejan autenticación,
autorización o datos sensibles. Agnóstico al stack.

Triggers: /security-audit, "auditar seguridad", "revisar endpoints", "security check",
"vulnerabilidades", "es seguro", "revisar auth".

---

## Cuándo usar este skill

- Al implementar nuevos endpoints de API
- Al modificar lógica de autenticación o autorización
- Antes de mergear cualquier PR que toque rutas protegidas
- Cuando el security-auditor lo solicita como parte de un review

---

## Checklist por endpoint

### 1. Autenticación — ¿quién sos?

```
✓ El token/sesión se verifica ANTES de procesar el request
✓ Si no hay token válido → 401 inmediato, sin procesar nada
✓ La verificación está en CADA método del handler (GET, POST, PUT, DELETE)
  — no solo en el primero que se implementó

✗ NUNCA saltear auth porque "es solo GET" o "es público por diseño" sin confirmarlo
✗ NUNCA confiar en headers que el cliente puede modificar (X-User-Id, X-Role)
```

Patrón genérico:
```typescript
// Verificar antes de cualquier lógica
const session = await getSession(request);
if (!session) return Response.json({ error: 'No autenticado' }, { status: 401 });
```

### 2. Autorización — ¿podés hacer esto?

```
✓ Verificar que el usuario tiene el ROL requerido para la operación
✓ Verificar que el usuario tiene ACCESO al recurso específico (no solo al tipo)
✓ Las operaciones de escritura requieren más verificación que las de lectura
```

Patrón genérico:
```typescript
// Rol
if (session.role !== 'admin') return Response.json({ error: 'Sin permiso' }, { status: 403 });

// Acceso al recurso (IDOR check — ver punto 3)
const resource = await db.find(id);
if (resource.ownerId !== session.userId && session.role !== 'admin') return 403;
```

### 3. IDOR — Insecure Direct Object Reference

```
✓ Al acceder por ID, verificar que el recurso pertenece al usuario (o que tiene permiso)
✓ No asumir que si el ID es "difícil de adivinar" está protegido
✓ Siempre cargar el recurso de la BD y verificar ownership antes de operar

Patrón de riesgo:
  GET /api/documents/:id → devuelve el doc sin verificar si es del usuario
  DELETE /api/comments/:id → borra sin verificar ownership
```

### 4. Validación de input

```
✓ Validar tipos, longitudes y formatos antes de pasar a la BD o cualquier servicio
✓ Usar un schema de validación explícito (Zod, Yup, Joi, Pydantic, etc.)
✓ No castear el body con 'as Type' — validar explícitamente
✓ Parámetros preparados siempre — NUNCA interpolar input del usuario en queries SQL

✗ NUNCA: `db.query("SELECT * FROM users WHERE id = " + userId)`
✓ SIEMPRE: `db.query("SELECT * FROM users WHERE id = $1", [userId])`
```

### 5. Exposición de información

```
✓ Los errores de producción no exponen stacktraces ni mensajes internos al cliente
✓ No loguear PII (email, teléfono, contraseña) en stdout/logs
✓ Los IDs de BD no son el único control de acceso (ver IDOR)
```

---

## Comandos de escaneo rápido

Adaptar el path a la estructura del proyecto:

```bash
# Endpoints/handlers sin verificación de sesión:
grep -r "export.*function\|app\.\(get\|post\|put\|delete\)" src/routes --include="*.ts" -l | \
  xargs grep -L "session\|auth\|token\|verify" 2>/dev/null

# Queries SQL con interpolación (peligro de inyección):
grep -rn "queryRaw\|query\`\|execute\`" src/ --include="*.ts" | grep -v "queryRawTyped\|drizzle"

# Input del body sin validación de schema:
grep -rn "req\.body\|request\.json()\|await req\.json()" src/ --include="*.ts" | \
  grep -v "parse\|validate\|schema\|zod\|yup"
```

---

## Severidades

- **CRÍTICO**: Sin auth en endpoint admin, SQL injection directa, IDOR sin verificación de ownership, RCE.
- **ALTO**: Bypass de autorización por rol, mass assignment, información sensible en respuestas de error.
- **MEDIO**: Sin rate limiting en endpoints de auth/IA, verbose errors en producción, CSRF en rutas sensibles.
- **BAJO**: Headers de seguridad faltantes, dependencias desactualizadas sin CVE activo, slugs permisivos.

---

## Relación con otros skills

- Este skill es invocado por `new-feature` como parte del checklist de implementación.
- El agente `security-auditor` puede invocarlo en sus reviews.
- No depende de otros skills (es standalone).
