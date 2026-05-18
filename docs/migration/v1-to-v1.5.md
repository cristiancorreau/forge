# Guía de migración: v0.2.x → v0.3.x

Esta guía cubre la actualización de proyectos que usan Forge v0.2.x al milestone v0.3.x ("v1.5" en el plan Forge v2). La migración es aditiva: no elimina ni reemplaza nada existente.

---

## 1. Qué cambia en v0.3.x

### Nuevos slash commands

- `/session-start` — inicializa una sesión de trabajo: detecta la rama activa, carga contexto del proyecto, registra la apertura en la memoria del proyecto.
- `/session-close` — cierra la sesión: genera un resumen de lo realizado, actualiza el estado en GitHub Projects si está configurado, y limpia el contexto de sesión.

### Nuevos hooks

- `pre-edit-check.py` — se ejecuta antes de cada edición de archivo. Verifica que el agente no está en la rama protegida (`main`/`master`) y que el archivo no contiene patrones prohibidos definidos en `project.yaml`.
- `post-turn-check.sh` — se ejecuta al final de cada turno del agente. Corre typecheck básico si el proyecto tiene TypeScript, y valida que no se introdujeron patrones SQL destructivos si el proyecto usa Prisma.

### Nuevas secciones en `project.yaml`

- `github.project` — configuración de GitHub Projects para sincronizar estado de tareas desde el agente.
- `rules.forbidden_in_production` — lista de strings/comandos que el hook bloquea activamente durante la sesión.

### Nuevo directorio en el proyecto

- `.claude/hooks/` — directorio donde residen los hooks de Forge para el proyecto.

---

## 2. Migración paso a paso

### a. Actualizar el submódulo

```bash
cd .agentic
git fetch --tags
git checkout v0.3.0
cd ..
git add .agentic
git commit -m "chore(deps): update forge to v0.3.0"
```

### b. Re-ejecutar forge-init

```bash
python3 .agentic/scripts/forge-init.py --tool claude-code --force
```

Esto instala automáticamente:

- `session-start.md` y `session-close.md` en `.claude/commands/`
- `pre-edit-check.py` y `post-turn-check.sh` en `.claude/hooks/`
- Entradas de hooks en `.claude/settings.json` apuntando a los scripts anteriores

### c. (Opcional) Agregar las nuevas secciones a `project.yaml`

Las secciones son opcionales. Si no las agregas, los hooks se ejecutan con comportamiento base (sin integración a GitHub Projects y sin reglas de producción personalizadas).

```yaml
github:
  project:
    number: 3
    owner: socialwebcl
    repo: mi-proyecto
    status_field_id: PVTSSF_xxx
    status_done: 98236657

rules:
  forbidden_in_production:
    - "prisma migrate reset"
    - "--force-reset"
    - "DROP TABLE"
```

### d. Verificar que los hooks funcionan

1. Abre Claude Code en el proyecto.
2. Intenta editar un archivo estando en `main` → deberías ver el mensaje de bloqueo de `pre-edit-check.py`.
3. Ejecuta `/session-start` → deberías ver el flujo de inicialización de sesión con detección de rama activa.

---

## 3. Si ya tienes hooks personalizados

Si tu proyecto tiene archivos propios en `.claude/hooks/`, `forge-init` **no los sobreescribe** por defecto. Tienes dos opciones:

**Opción A — Sobreescribir y volver a agregar tu lógica:**

```bash
python3 .agentic/scripts/forge-init.py --tool claude-code --force
```

Luego agrega tu lógica personalizada al final de `pre-edit-check.py` o en un script separado que este invoque.

**Opción B — Merge manual:**

Copia el contenido de los hooks de Forge desde `.agentic/hooks/` y combínalos con tus hooks existentes. Los hooks de Forge están diseñados para ser composables: tu lógica puede vivir al final del archivo o en un wrapper que llame al hook de Forge primero.

---

## 4. Si ya tienes slash commands personalizados

Los nuevos comandos (`session-start`, `session-close`) son **aditivos**. No reemplazan ningún comando existente. Tus comandos personalizados en `.claude/commands/` se conservan intactos.

---

## 5. Rollback

Si necesitas volver a v0.2.x:

```bash
cd .agentic && git checkout v0.2.2 && cd ..
python3 .agentic/scripts/forge-init.py --tool claude-code --force
```

Los comandos y hooks anteriores se restauran. No se pierde ningún dato del proyecto.
