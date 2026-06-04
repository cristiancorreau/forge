# Skill: session-start

Inicializa una sesión de trabajo: detecta el estado del repo, identifica el
escenario y enruta según corresponda. Es el primer paso del flujo de trabajo
SDD, antes de cualquier edición de código.

Triggers: /session-start, "iniciar sesión", "arrancar sesión", "empezar a trabajar"

---

## Cuándo usar este skill

- Al abrir el editor/agente y comenzar a trabajar en el repo
- Para retomar una rama de feature en progreso
- Para decidir si continuar un PR abierto o arrancar algo nuevo

No usar para cerrar la sesión — para eso está `session-close`.

---

## Paso 1 — Leer estado del repo

Ejecutar los siguientes comandos y guardar sus resultados:

- `git branch --show-current` → rama actual
- `git status --short` → cambios sin commitear
- `git log --oneline -5` → commits recientes
- `gh pr list --author @me --state open --json number,title,headRefName 2>/dev/null` → PRs abiertos (saltar si gh no está disponible)
- `git branch --sort=-committerdate --format='%(refname:short)' | grep -v 'HEAD' | head -8` → ramas recientes

## Paso 2 — Leer configuración del proyecto

- Si existe `project.yaml` en el directorio actual, leerlo para obtener: `project.mode`, `project.name`, `stack.*`, `agents.active`
- Si existe `wiki/index.md`, leerlo para obtener contexto del proyecto
- Si ninguno existe, continuar con defaults: mode=startup, sin checks de compliance

## Paso 3 — Evaluar escenario y actuar

### Escenario A — Ya en una rama de feature (no es main/master/develop)

- Mostrar los últimos 5 commits de esta rama para contexto
- Mostrar archivos con cambios sin commitear si los hay
- Reportar: "Continuando sesión en [branch]. Contexto: [mensaje del último commit]."
- Preguntar: "¿Qué trabajamos hoy?"

### Escenario B — En main/master con PRs abiertos o ramas recientes de feature

- Listar los PRs abiertos del Paso 1 como menú numerado
- Listar las ramas recientes que no sean main/master/develop del Paso 1
- Preguntar: "¿Continuás uno de estos o arrancamos algo nuevo?"
- Si el usuario elige continuar uno existente: hacer checkout de esa rama
- Si el usuario quiere algo nuevo: pasar al flujo del Escenario C

### Escenario C — En main/master sin trabajo previo identificado

- Esperar el primer mensaje del usuario describiendo qué quiere trabajar
- Antes de cualquier edición de código, proponer un nombre de rama siguiendo la convención:
  - `feature/<tema-corto>-$(date +%Y-%m-%d)` para features
  - `fix/<tema-corto>-$(date +%Y-%m-%d)` para correcciones
  - `chore/<tema-corto>-$(date +%Y-%m-%d)` para tareas técnicas
  - `docs/<tema-corto>-$(date +%Y-%m-%d)` para documentación
- Crear la rama: `git checkout -b <nombre-propuesto>`
- Confirmar: "Branch creada: [nombre]. Listo para trabajar."

## Paso 4 — Recordatorio de reglas de sesión

Una vez determinado el escenario, enunciar estas reglas una sola vez:

"Reglas de sesión: (1) No editar código en main. (2) Conventional Commits. (3) Spec antes de implementar si el proyecto es standard/enterprise. (4) Cerrar con /session-close."

## Comportamiento adaptativo

- Si `gh` no está disponible: omitir los pasos que lo requieren y agregar nota "gh no disponible — revisar PRs en GitHub.com manualmente"
- Si `project.yaml` no existe: continuar con defaults, no interrumpir el flujo
- Si la rama actual no sigue la convención de nombres: mencionarlo pero no bloquear

---

## Relación con otros skills

`session-start` abre el ciclo de trabajo; `session-close` lo cierra. Entre ambos,
`new-feature` orquesta la implementación (spec → seguridad → migración → deploy).

```
session-start  →  new-feature (spec, security-audit, db-migrate, …)  →  session-close
```
