# North Star — adopción medida sin telemetría

> Issue #109 · decisión del board (jun 2026). forge **no llama a casa**: la
> adopción se mide por observación externa, no instrumentando el binario.

## La métrica

**North Star:** *repos públicos con un `project.yaml` gestionado por forge.*

Mide adopción real (un proyecto configurado y commiteado), no vanity (installs npm).
El embudo asociado: **% de `forge recommend` (read-only) → `forge adopt`/`--apply`**.

## El marcador

`project.yaml` es un nombre de archivo genérico (Pulumi, Cloud Build, etc.), así que
contarlo a secas da miles de falsos positivos. Por eso forge estampa un **marcador
único y determinista** como primera línea de todo `project.yaml` que genera:

```
# generated-by: forge vX.Y.Z
```

Es un comentario YAML (invisible para cualquier parser) y se escribe de forma
idempotente en `init`, `adopt` y cuando un `forge panel`/install crea el archivo.
Implementado en `packages/cli/src/lib/marker.ts` (`forgeMarker`, `withForgeMarker`).

## Cómo medir (GitHub code search)

Búsqueda pasiva, sin API privada ni telemetría:

```
# en github.com/search (Code)
"# generated-by: forge" path:project.yaml
```

o vía `gh`:

```bash
gh search code '"# generated-by: forge"' --filename project.yaml --json repository \
  | jq -r '.[].repository.nameWithOwner' | sort -u | wc -l
```

Contar **repos distintos** (no archivos) es el North Star.

## Baseline

- **Fecha de inicio:** 2026-06-06 (introducción del marcador, forge v3.3.x).
- **Baseline esperado:** ~0–1 repos públicos al día 1 (el propio forge dogfoodea su
  `project.yaml`, que a partir de ahora incluye el marcador al regenerarse). La señal
  arranca de cero por diseño: solo cuentan los `project.yaml` generados **con** el
  marcador, de aquí en adelante.
- **Re-correr** la búsqueda al cierre de cada sprint y registrar el conteo.

## Postura de privacidad

forge **nunca** envía datos desde la máquina del usuario. El ranking de
`forge recommend` es match determinístico contra `detect.ts` (no telemetría), y la
medición de adopción es 100% externa (GitHub code search del marcador público). El
marcador no contiene nada del usuario: solo `forge vX.Y.Z`.
