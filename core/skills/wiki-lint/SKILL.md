# Skill: wiki-lint

Verifica la integridad estructural del wiki: índice, links, huérfanos y salud
general. Auto-repara lo que puede; reporta lo que necesita decisión humana.

Triggers: /wiki-lint, "lint wiki", "verificar wiki", "revisar wiki", "chequear
wiki", "wiki health", "wiki check".

---

## Cuándo usar este skill

- Después de un `wiki-ingest` para verificar consistencia
- Periódicamente (por ejemplo, al inicio de cada sprint)
- Cuando se sospecha que hay links rotos o páginas huérfanas

---

## Checklist de linting

### 1. Integridad del índice

Leer `docs/wiki/index.md` y verificar:

```
✓ Cada [[link]] del índice apunta a un archivo que existe
✗ Archivos en concepts/, entities/, sources/, synthesis/ que NO están en el índice
```

Auto-reparar: agregar al índice los archivos que faltan (con descripción vacía marcada `TODO`).

### 2. Wikilinks rotos

Buscar en todas las páginas wiki referencias `[[ruta/nombre]]` y verificar que
el archivo `docs/wiki/ruta/nombre.md` existe.

```bash
grep -rn "\[\[" docs/wiki/ --include="*.md" | grep -v "raw/"
```

Reportar: lista de links rotos con el archivo donde aparecen.

### 3. Páginas huérfanas

Páginas que no son referenciadas por ninguna otra página ni por el índice.

```bash
# Para cada archivo en wiki/ (excluyendo index, log, raw/)
# verificar si su nombre aparece en algún [[link]] de otra página
```

Reportar: lista de huérfanas. No auto-borrar — requiere decisión humana.

### 4. Integridad del log

Verificar que `docs/wiki/log.md` existe y tiene al menos una entrada.
El log es append-only — nunca modificar entradas pasadas.

Reportar si el log no ha sido actualizado en los últimos 30 días (wiki posiblemente abandonado).

### 5. Consistencia de frontmatter

Para cada página wiki (excluyendo raw/):
- Tiene bloque `---` con `title`, `tags`, `updated`
- El campo `updated` tiene formato válido `YYYY-MM-DD`
- El campo `sources` lista solo archivos que existen en `sources/`

Auto-reparar: agregar campos faltantes con valor `TODO`.

### 6. Raw/ inmutable

Verificar que ningún archivo en `raw/` ha sido modificado desde su ingest.
Comparar fecha de modificación vs fecha en frontmatter.

---

## Formato de reporte

```
Wiki Lint — <project>
══════════════════════════

RESUMEN
  <N> páginas en el wiki
  <N> en el índice
  <N> issues encontrados

ISSUES
  ✗ [CRÍTICO] Link roto: [[concepts/X]] en entities/Y.md — archivo no existe
  ⚠ [WARN]    Huérfana: sources/fuente-vieja.md — sin referencias
  ⚠ [WARN]    Falta en índice: concepts/nuevo-concepto.md
  → [INFO]    Log sin actualizaciones en 15 días

AUTO-REPARADO
  ✓ Agregado concepts/nuevo-concepto.md al índice
  ✓ Agregado campo 'updated: TODO' a 2 páginas con frontmatter incompleto

REQUIERE ATENCIÓN MANUAL
  • sources/fuente-vieja.md — ¿borrar o referenciar?
  • [[concepts/X]] roto en entities/Y.md — ¿crear X o actualizar la referencia?
```

---

## Relación con otros skills

- `wiki-ingest` puede crear inconsistencias que este skill detecta
- `wiki-query` depende de los links que este skill verifica
- Sin dependencias de otros skills (es standalone)
