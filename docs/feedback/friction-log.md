# Friction Log — Forge

Esta es la bitácora de fricción de Forge. Cada vez que un desarrollador tropieza con el framework —un comando que no hace lo que promete, un flujo confuso, un error críptico, una integración que se rompe— se anota aquí. El log es la entrada principal al roadmap de Forge v2: sin fricción documentada, no hay prioridad. La regla es simple: **cada vez que alguien tropieza con Forge, se anota**.

---

## Template

```
## [F-NNN] Título corto de la fricción

| Campo | Valor |
|-------|-------|
| Fecha | YYYY-MM-DD |
| Dev | nombre |
| Proyecto | nombre del proyecto |
| Comando | /session-start, forge-init, forge-audit, etc. |
| Fricción | Descripción detallada de qué salió mal o fue confuso |
| Severidad | P0 (bloqueante) / P1 (importante pero hay workaround) / P2 (molesto, UX) |
| Propuesta | Cómo podría resolverse |
| Estado | Abierta / En progreso / Resuelta en v0.X.X |
```

---

## Ejemplo de referencia

## [F-000] session-start no detecta ramas con prefijo distinto a `feat/`

| Campo | Valor |
|-------|-------|
| Fecha | 2026-05-01 |
| Dev | cris |
| Proyecto | fesw-encuestas |
| Comando | /session-start |
| Fricción | El comando busca ramas con prefijo `feat/` para sugerir la rama activa. Si el proyecto usa `feature/`, `fix/` o ramas sin prefijo convencional, session-start no detecta nada y pide crear una rama nueva aunque ya exista una en curso. El desarrollador tiene que ingresarla manualmente o arriesga crear una rama duplicada. |
| Severidad | P1 (importante pero hay workaround: ingresar la rama a mano) |
| Propuesta | Parametrizar los prefijos aceptados en `project.yaml` bajo `git.branch_prefixes`. Leer esa lista en session-start antes de hacer el fallback a "crear rama nueva". |
| Estado | Resuelta en v0.3.1 |

---

## Entradas activas

<!-- Agrega aquí las fricciones abiertas o en progreso. Orden: más reciente primero. -->

---

## Fricciones resueltas

<!-- Mueve aquí las entradas una vez que el Estado cambia a "Resuelta en v0.X.X". -->

| ID | Título | Resuelta en |
|----|--------|-------------|
| F-000 | session-start no detecta ramas con prefijo distinto a `feat/` | v0.3.1 |

---

## Cómo contribuir

Para agregar una fricción: copia el template, asígnale el siguiente número F-NNN, y agrégala bajo **Entradas activas**.
