# ship

Pipeline de deploy de 10 pasos. Solo disponible cuando `project.yaml` tiene sección `deploy`.

## Verificación inicial

Leer `project.yaml`. Si no existe sección `deploy`: "deploy no configurado en project.yaml. Agregá la sección deploy para usar /ship." y detener.

---

## Paso 1 — Verificar review

Leer `.claude/review-status.json` (es el archivo que persiste `/review` en su Paso 6).

- **Si el archivo existe**: parsear su contenido y validar el campo `verdict`.
  - `verdict == "APPROVED"`: continuar. (Opcional: si el `timestamp` del review es anterior al último commit relevante, advertir que el review podría estar desactualizado y pedir confirmación.)
  - `verdict == "CHANGES_REQUESTED"` o `verdict == "BLOCKED"`: "El último review resultó en `<verdict>`. Resolvé los puntos y volvé a ejecutar `/review` antes de hacer deploy." y detener.
- **Si el archivo NO existe** (fallback): "No se encontró `.claude/review-status.json`. ¿Confirmás que el código fue revisado y aprobado? (s/n)"
  - Si n: "Ejecutá `/review` antes de hacer deploy." y detener.

## Paso 2 — Verificar git status

Ejecutar `git status --short`.

Si hay cambios sin commitear: "Hay cambios sin commitear. Commiteá primero antes de hacer deploy." y detener.

Si el working tree está limpio: continuar.

## Paso 3 — Merge PR a main (condicional)

Preguntar: "¿Querés mergear el PR actual a main antes del deploy? (s/n)"

Si sí:
- Ejecutar `gh pr checks` para verificar que todos los checks pasan
- Si algún check falla: "El PR tiene checks fallando. Resolvelos antes de mergear." y detener.
- Si todos pasan: ejecutar `gh pr merge --merge`

Si no: continuar sin mergear.

## Paso 4 — Trigger deploy

Leer `project.yaml` → `deploy.provider`:

- **vercel**: el deploy se triggeará automáticamente con el merge/push. Ejecutar `gh api repos/:owner/:repo/deployments --jq '.[0].id'` o `vercel ls --json | jq '.[0].uid'` para obtener el deployment ID más reciente. Guardar este ID para el polling.
- **railway**: ejecutar `railway up` si está disponible en el PATH.
- **fly**: ejecutar `fly deploy`.
- **aws**: indicar el comando apropiado según la configuración y pedir al usuario que lo ejecute.
- Provider no reconocido: "Provider '`<valor>`' no reconocido. Soportados: vercel, railway, fly, aws."

## Paso 5-8 — Polling de estado con backoff

**REGLA CRITICA: máximo 1 consulta al estado del deploy por minuto. Esta regla existe porque los providers rate-limitan su API. Nunca encadenar polls consecutivos sin pausa.**

Loop de polling (máximo 20 intentos = 20 minutos):

```
Para cada intento:
  1. Consultar estado del deploy (una sola consulta)
  2. Evaluar resultado:
     - BUILDING / QUEUED / IN_PROGRESS:
         Reportar: "Deploy en progreso (intento N/20)... esperando 60 segundos."
         Esperar 60 segundos antes del siguiente poll.
     - ERROR / FAILED / CANCELED:
         Leer build logs completos.
         Reportar el error al usuario con los logs relevantes.
         DETENER — no continuar al Paso 9.
     - READY / SUCCESS:
         Continuar al Paso 9.
  3. Si se alcanzan 20 intentos sin READY: reportar timeout y detener.
```

**Consultas según provider:**
- Vercel: `vercel inspect <deployment-id> --json | jq '.readyState'`
- Railway: `railway status`
- Fly: `fly status`

## Paso 9 — Verificar runtime logs

Leer los primeros 60 segundos de logs post-deploy:
- Vercel: `vercel logs <deployment-url> --since 1m`
- Railway/Fly: logs equivalentes del provider

Si hay errores en los logs:
- Reportar los errores al usuario con contexto
- Sugerir rollback: "¿Querés hacer rollback al deploy anterior? (s/n)"
- **NO ejecutar rollback automáticamente — siempre requiere confirmación explícita.**
- Si el usuario confirma rollback: ejecutar el comando de rollback del provider.

Si los logs están limpios: continuar.

## Paso 10 — Smoke tests (condicional)

Si `project.yaml` → `deploy.smoke_tests` está definido y tiene URLs:

Para cada URL de smoke test:
```
curl -s -o /dev/null -w "%{http_code}" <url>
```

- Si el código HTTP es 2xx: marcar como pasado.
- Si el código HTTP es 4xx o 5xx: reportar fallo.

Si algún smoke test falla:
- Reportar qué URL falló y el código HTTP
- Sugerir rollback: "¿Querés hacer rollback? (s/n)"
- **NO ejecutar rollback automáticamente.**

Si todos pasan o no hay smoke tests definidos: continuar.

---

## Al terminar exitosamente

Obtener la URL de producción de `project.yaml` → `deploy.production_url` o del output del provider.

Reportar: "Deploy exitoso. URL: [production_url]"

Agregar entrada al daily note si existe `docs/daily-notes/` (buscar el archivo del día actual):
```
## Deploy
- Fecha: YYYY-MM-DD HH:MM
- Estado: exitoso
- URL: [production_url]
```

---

## Si hay errores en cualquier paso

Reportar claramente:
- En qué paso ocurrió el error
- Qué salió mal (con logs si están disponibles)
- Qué acción correctiva se sugiere

**Nunca continuar automáticamente después de un error de deploy.** Siempre esperar confirmación explícita del usuario antes de cualquier acción de remediación.
