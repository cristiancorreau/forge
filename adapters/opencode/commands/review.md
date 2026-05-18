---
name: review
description: Revisión de código estructurada en un solo paso. Produce un veredicto APPROVED / CHANGES_REQUESTED / BLOCKED vinculante para /ship.
---

Orquesta una revisión de código estructurada y produce un veredicto vinculante para `/ship`.

Argumentos: vacío para cambios uncommitted, `HEAD~N..HEAD` para rango de commits, `PR-N` para un PR específico.

---

## Paso 0 — Determinar modo de invocación

Evaluar los argumentos:

- **Vacío**: revisar cambios uncommitted (`git diff HEAD`)
- **`HEAD~N..HEAD`** o cualquier rango git válido: revisar ese rango de commits
- **`PR-N`** (ej: `PR-42`): obtener el diff del PR con `gh pr diff 42`

Guardar el scope como descripción legible (ej: "cambios uncommitted", "últimos 3 commits", "PR #42").

---

## Paso 1 — Obtener el diff

Según el modo detectado:

- Cambios uncommitted: `git diff HEAD` (si está vacío, probar `git diff --cached`)
- Rango de commits: `git diff <rango>`
- PR: `gh pr diff <N>`

Si el diff está vacío: "No hay cambios para revisar en el scope indicado." y detener.

Mostrar un resumen de lo que se va a revisar:
```
Revisando: <scope>
Archivos modificados: <N>
Líneas añadidas/eliminadas: +X / -Y
```

---

## Paso 2 — Leer mode del proyecto

Leer `project.yaml` → `project.mode`. Si no existe: tratar como `startup`.

---

## Paso 3 — Revisión completa en un solo paso

OpenCode ejecuta la revisión en un único paso cubriendo todas las dimensiones.

**Seguridad**
- ¿Hay tokens, passwords o claves hardcodeadas?
- ¿Los endpoints nuevos o modificados verifican autenticación Y autorización?
- ¿Hay concatenación de input del usuario en queries SQL (riesgo de SQLi)?
- ¿Hay output de input del usuario sin escapar (riesgo de XSS)?
- ¿Se loguea PII sin enmascarar?

**Calidad**
- ¿Hay naming confuso o inconsistente con el resto del proyecto?
- ¿Hay código muerto o lógica duplicada?
- ¿Hay N+1 queries o loops en caminos críticos?
- ¿Faltan índices para queries que se ejecutan frecuentemente?

**Tests**
- ¿Cada función o endpoint modificado tiene al menos un test correspondiente?
- ¿Los casos borde están cubiertos?

**Compliance (solo si `project.mode` es enterprise)**
- ¿Hay cambios en el manejo de PII?
- ¿Se modificaron flujos de consentimiento?
- ¿Hay cambios en logs de auditoría?
- ¿Los cambios están alineados con los frameworks de compliance de `project.yaml`?

---

## Paso 4 — Sintetizar veredicto

Evaluar la totalidad de los hallazgos y asignar uno de estos veredictos:

### APPROVED
No hay hallazgos bloqueantes ni cambios requeridos.

### CHANGES_REQUESTED
Hay issues que deben resolverse pero no son críticos:
```
CHANGES_REQUESTED

Cambios requeridos:
1. [Descripción del issue] — [archivo:línea si aplica]
2. [Descripción del issue] — [archivo:línea si aplica]
```

### BLOCKED
Hay issues críticos que deben resolverse antes de poder hacer `/ship`:
```
BLOCKED

Issues críticos:
1. [Descripción] — [archivo:línea si aplica] — Severidad: CRITICAL
2. [Descripción] — [archivo:línea si aplica] — Severidad: HIGH

Esta sesión no es apta para /ship hasta resolver estos puntos.
```

---

## Paso 5 — Producir reporte

```
## Code Review — <scope>
Fecha: YYYY-MM-DD HH:MM
Modo: <startup|standard|enterprise>

### Hallazgos

#### Seguridad
[hallazgos o "Sin hallazgos."]

#### Calidad
[hallazgos o "Sin hallazgos."]

#### Tests
[hallazgos o "Sin hallazgos."]

#### Compliance
[hallazgos o "Sin hallazgos." o "N/A (modo no-enterprise)"]

---

### Veredicto: <APPROVED|CHANGES_REQUESTED|BLOCKED>

[Detalle del veredicto]
```

---

## Paso 6 — Guardar resultado

Escribir el archivo `.opencode/review-status.json` con el resultado:

```json
{
  "verdict": "<APPROVED|CHANGES_REQUESTED|BLOCKED>",
  "reviewer": "opencode/review",
  "timestamp": "<ISO 8601>",
  "scope": "<descripción del scope revisado>"
}
```

Si el directorio `.opencode/` no existe, crearlo.

Confirmar: "Review guardado en `.opencode/review-status.json`. `/ship` lo leerá para verificar que el review fue aprobado antes de hacer deploy."

---

## Si BLOCKED

Recordar explícitamente al final del reporte:

> **Esta sesión no es apta para `/ship` hasta resolver los puntos bloqueantes listados arriba.**

No sugerir hacer deploy ni continuar con otros pasos hasta que el usuario reporte que los issues fueron resueltos y vuelva a ejecutar `/review`.
