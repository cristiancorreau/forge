# review

Orquesta una revisión de código estructurada y produce un veredicto vinculante para `/ship`.

Scope: $ARGUMENTS (ej: vacío para cambios uncommitted, `HEAD~3..HEAD` para últimos 3 commits, `PR-42` para un PR específico, `--codex` para output en texto plano)

---

## Paso 0 — Determinar modo de invocación

Evaluar `$ARGUMENTS`:

- **Vacío**: revisar cambios uncommitted (`git diff HEAD`)
- **`HEAD~N..HEAD`** o cualquier rango git válido: revisar ese rango de commits (`git diff <rango>`)
- **`PR-N`** (ej: `PR-42`): obtener el diff del PR con `gh pr diff 42`
- **`--codex`**: activar modo Codex CLI — output en texto plano sin markdown ni tablas, misma lógica de revisión

Guardar el scope como descripción legible (ej: "cambios uncommitted", "últimos 3 commits", "PR #42") para incluirlo en el reporte final.

---

## Paso 1 — Obtener el diff

Según el modo detectado en el Paso 0:

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

Leer `project.yaml` → `project.mode`:

- `startup`: revisión en un solo paso (Paso 3A)
- `standard`: revisión multi-agente paralela sin compliance (Paso 3B)
- `enterprise`: revisión multi-agente paralela con compliance (Paso 3B)
- Si `project.yaml` no existe o no tiene `project.mode`: tratar como `startup`

---

## Paso 3A — Revisión única (modo startup)

Revisar el diff completo cubriendo todas las dimensiones en un solo paso:

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

Ir directamente al Paso 4.

---

## Paso 3B — Revisión multi-agente paralela (modo standard/enterprise)

Lanzar los siguientes agentes en paralelo. Cada uno debe revisar el diff completo enfocándose en su dominio.

### Agente 1 — Security reviewer

Revisar exclusivamente dimensiones de seguridad:
- Secrets hardcodeados (tokens, passwords, API keys, certificados)
- Endpoints sin verificación de autenticación o autorización
- Input del usuario concatenado en queries SQL
- Output sin escapar que pueda resultar en XSS
- PII en logs sin enmascarar
- Dependencias nuevas con vulnerabilidades conocidas

Reportar: lista de hallazgos con severidad (CRITICAL / HIGH / MEDIUM / LOW) y línea exacta.

### Agente 2 — Quality reviewer

Revisar exclusivamente dimensiones de calidad de código:
- Naming confuso, inconsistente o engañoso
- Código muerto (funciones no llamadas, variables no usadas)
- Lógica duplicada que debería extraerse
- N+1 queries o llamadas a DB dentro de loops
- Índices faltantes para las queries nuevas o modificadas
- Violaciones de principios de responsabilidad única del agente

Reportar: lista de hallazgos con descripción y sugerencia de mejora.

### Agente 3 — Test reviewer

Revisar exclusivamente cobertura de tests:
- Por cada función o endpoint modificado: ¿existe un test que lo cubra?
- Por cada caso borde identificado en el diff: ¿hay un test para él?
- ¿Se eliminaron tests sin eliminar también la funcionalidad correspondiente?
- ¿Los tests nuevos son significativos (no triviales o que siempre pasan)?

Reportar: lista de funciones/endpoints sin cobertura y gaps de casos borde.

### Agente 4 — Compliance reviewer (solo enterprise)

Revisar exclusivamente dimensiones de compliance:
- ¿Hay cambios en el manejo de PII (recolección, almacenamiento, transmisión)?
- ¿Se modificaron flujos de consentimiento o se agregaron nuevos?
- ¿Hay cambios en logs de auditoría (adición, modificación o eliminación de eventos)?
- ¿Los cambios están alineados con los frameworks de compliance definidos en `project.yaml`?

Reportar: impactos de compliance con referencia al artículo o control específico si aplica.

---

## Paso 4 — Sintetizar veredicto

(Para modo startup: aplicar directamente. Para standard/enterprise: consolidar los reportes de todos los agentes.)

Evaluar la totalidad de los hallazgos y asignar uno de estos veredictos:

### APPROVED
No hay hallazgos bloqueantes ni cambios requeridos. Los cambios se ven bien.

### CHANGES_REQUESTED
Hay issues que deben resolverse pero no son críticos. Listar cada uno claramente:
```
CHANGES_REQUESTED

Cambios requeridos:
1. [Descripción del issue] — [archivo:línea si aplica]
2. [Descripción del issue] — [archivo:línea si aplica]
```

### BLOCKED
Hay issues críticos de seguridad, compliance o correctitud que deben resolverse antes de poder hacer `/ship`. Listar cada uno claramente:
```
BLOCKED

Issues críticos:
1. [Descripción] — [archivo:línea si aplica] — Severidad: CRITICAL
2. [Descripción] — [archivo:línea si aplica] — Severidad: HIGH

Esta sesión no es apta para /ship hasta resolver estos puntos.
```

---

## Paso 5 — Producir reporte

Formatear el reporte final:

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

#### Compliance (solo enterprise)
[hallazgos o "Sin hallazgos." o "N/A (modo no-enterprise)"]

---

### Veredicto: <APPROVED|CHANGES_REQUESTED|BLOCKED>

[Detalle del veredicto]
```

Si el modo es `--codex`: producir el mismo contenido pero en texto plano sin encabezados markdown, sin tablas, sin bloques de código.

---

## Paso 6 — Guardar resultado

Escribir el archivo `.claude/review-status.json` con el resultado:

```json
{
  "verdict": "<APPROVED|CHANGES_REQUESTED|BLOCKED>",
  "reviewer": "claude-code/review",
  "timestamp": "<ISO 8601>",
  "scope": "<descripción del scope revisado>"
}
```

Si el directorio `.claude/` no existe, crearlo.

Confirmar al usuario: "Review guardado en `.claude/review-status.json`. `/ship` lo leerá para verificar que el review fue aprobado antes de hacer deploy."

---

## Si BLOCKED

Recordar explícitamente al final del reporte:

> **Esta sesión no es apta para `/ship` hasta resolver los puntos bloqueantes listados arriba.**

No sugerir hacer deploy ni continuar con otros pasos hasta que el usuario reporte que los issues fueron resueltos y vuelva a ejecutar `/review`.
