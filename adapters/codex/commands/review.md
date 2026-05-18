---
name: review
description: Template para revisar código con Codex CLI
usage: Copia el contenido de Prompt en tu sesión de Codex
---

## Prompt para Codex

Revisa el siguiente código o cambios: [RUTA DE ARCHIVO, RAMA, O "cambios sin commitear actuales"]

Ejecuta esta revisión en orden:

1. **Identificar el scope**
   - Si es un archivo: lee ese archivo completo.
   - Si es "cambios sin commitear": ejecuta `git diff` y `git diff --cached` para ver todos los cambios.
   - Si es una rama: ejecuta `git diff main...[nombre-rama]` para ver los cambios respecto a main.

2. **Checklist de seguridad**
   - [ ] ¿Hay tokens, passwords o secrets hardcodeados? (busca patrones como `password =`, `token =`, `api_key =`)
   - [ ] ¿Los endpoints de API verifican autenticación?
   - [ ] ¿Los endpoints de API verifican autorización (permisos por rol o ownership)?
   - [ ] ¿Las queries SQL usan parámetros preparados? (nunca concatenación de strings con input del usuario)
   - [ ] ¿Hay XSS potencial (inserción de HTML sin escapar)?
   - [ ] ¿Los errores exponen detalles técnicos en respuestas de producción?

3. **Checklist de calidad**
   - [ ] ¿El código tiene tests que lo verifican?
   - [ ] ¿Hay queries N+1 o loops en caminos críticos?
   - [ ] ¿Hay console.log / print de depuración que no deba estar?
   - [ ] ¿Hay código muerto o duplicado?
   - [ ] ¿El naming es claro y consistente con el resto del proyecto?

4. **Checklist de compliance** (si el proyecto maneja PII)
   - [ ] ¿Se está guardando PII en logs?
   - [ ] ¿Hay cambios en endpoints de derechos del titular (DSAR)?
   - [ ] ¿Hay cambios en consentimientos o logs de auditoría?

5. **Formato del reporte**
   Presenta los hallazgos así:
   ```
   BLOQUEANTES (deben resolverse antes del merge):
   - [archivo:línea] descripción del problema

   ADVERTENCIAS (recomendado resolver):
   - [archivo:línea] descripción

   SUGERENCIAS (opcionales):
   - descripción

   APROBADO: Sí / No
   ```

Si no hay bloqueantes ni advertencias, reporta simplemente: "Revisión completada — sin issues encontrados."
