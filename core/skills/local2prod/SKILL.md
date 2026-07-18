---
name: local2prod
description: "Flujo completo de publicación a producción, compatible con Vercel, Railway, Fly.io, GitHub Actions y pipelines custom. Usar al hacer deploy; nunca dar una tarea por terminada sin el deploy en estado READY/SUCCESS."
---

# Skill: local2prod

Flujo completo de publicación a producción. Compatible con Vercel, Railway, Fly.io,
GitHub Actions y pipelines custom.

NUNCA dar una tarea por terminada sin que el deploy esté en estado READY/SUCCESS.

Triggers: /local2prod, "publicar", "deploy", "subir a producción", "push a prod",
"lanzar cambios", "ir a producción".

---

## Cuándo usar este skill

Al terminar una feature y querer desplegarla a producción.
El provider de deploy está en `project.yaml` bajo `deploy.provider`.

---

## Paso 1 — Commit

Si hay cambios sin commitear:

```bash
git add <archivos relevantes>   # preferir archivos específicos, no git add -A
git status                      # confirmar qué va al commit

git commit -m "tipo(scope): descripción en imperativo

Co-Authored-By: <modelo> <noreply@anthropic.com>"
```

Si ya hay un commit listo, ir directo al Paso 2.

---

## Paso 2 — Push

```bash
git push origin <branch>
```

En proyectos con trunk-based development, el push a `main` trigerea el deploy automáticamente.
En proyectos con PRs, el deploy se crea al mergear.

---

## Paso 3 — Esperar deploy READY

**Regla de polling — OBLIGATORIA**:
1. Hacer UNA verificación, leer el resultado, reportar el estado.
2. Si sigue en Building/Running: decirle al usuario el estado actual y esperar **~60 segundos** antes de la siguiente verificación.
3. **NUNCA** encadenar verificaciones automáticamente sin pausa.
4. Máximo 1 verificación por minuto.

### Por provider

**Vercel** (leer provider config de project.yaml o env vars):
```bash
vercel ls --scope <teamId> 2>&1 | head -8
# Columna Status: ● Building → esperar | ● Ready → OK | ✗ Error → ver logs
```

**Railway**:
```bash
railway status
# o: railway run --service <name> -- echo OK
```

**Fly.io**:
```bash
fly status --app <app-name>
# Buscar: Machines running
```

**GitHub Actions**:
```bash
gh run list --limit 3
gh run watch <run-id>    # bloquea hasta que termine
```

**Custom / otro**:
```bash
# Usar el comando definido en project.yaml bajo deploy.check_command
```

### Si hay ERROR

```bash
# Vercel:
vercel inspect <deployment-url> --logs 2>&1 | tail -40

# GitHub Actions:
gh run view <run-id> --log-failed

# Railway / Fly:
# Ver logs en el dashboard del provider
```

1. Identificar el error (build, typecheck, runtime)
2. Corregir el código
3. Volver al Paso 1

---

## Paso 4 — Verificar runtime logs

Una vez que el deploy está READY, verificar que no haya errores de runtime (500, crashes, errores de DB):

```bash
# Vercel:
vercel logs <deployment-url> 2>&1 | tail -20

# Fly:
fly logs --app <app-name>

# Railway:
railway logs
```

Si hay errores → corregir y repetir desde Paso 1.

---

## Paso 5 — Actualizar documentación [OPCIONAL]

Si el proyecto tiene un knowledge base configurado (Obsidian, wiki, Notion):

- Si hubo cambios de infra (nuevas env vars, cambios de schema, nuevas rutas) → actualizar la sección de deploy/infra.
- Si el proyecto usa `obsidian-sync` → invocar ese skill ahora.

---

## Reglas críticas

- **NUNCA** declarar la tarea terminada sin `state: READY / SUCCESS` confirmado.
- **NUNCA** asumir que el push implica deploy exitoso — siempre verificar.
- Si el deploy falla 3 veces seguidas → notificar al usuario y detener. No seguir en loop automático.
- Si el pipeline queda en QUEUED por más de 2 minutos → investigar si hay otro deploy bloqueando.

---

## Relación con otros skills

- `new-feature` lo invoca como último paso del flujo de implementación.
- `obsidian-sync` puede ser invocado en el Paso 5 si está configurado (opcional).
- No tiene dependencias obligatorias — puede usarse standalone.
