# Skill: wiki-ingest

Ingesta una fuente nueva en el wiki del proyecto. Almacena el original en `raw/`,
compila conocimiento en páginas wiki, actualiza el índice y registra la operación.

Triggers: /wiki-ingest, "ingestar", "agregar al wiki", "aprender de", "leer e
incorporar", "ingest this", "add to wiki", "incorporar este documento",
"guardar conocimiento de".

Argumento: URL, path a archivo, o texto pegado directamente.

---

## Cuándo usar este skill

- Al incorporar documentación técnica, papers, specs regulatorias o decisiones de diseño
- Al leer código fuente de dependencias relevantes para el proyecto
- Al registrar una decisión de arquitectura que no está en un ADR formal
- Cuando el usuario dice "recordá esto" o "guardá esto en el wiki"

---

## Protocolo de ingest

### Paso 1 — Obtener la fuente

```
Si es URL     → agent-browser open <url> && agent-browser get text "article,main"
Si es archivo → Read(path)
Si es texto   → usar el texto tal como está
```

### Paso 2 — Almacenar en raw/ (inmutable)

```
Path: wiki/raw/<tema>/<YYYY-MM-DD>-<slug-del-titulo>.md

Formato del archivo raw:
---
source: <url o path original>
date: <YYYY-MM-DD>
title: <título inferido>
---

<contenido tal cual, sin editar>
```

`raw/` es append-only — NUNCA editar ni borrar archivos existentes.

### Paso 3 — Extraer conocimiento

Leer el contenido y identificar:

1. **Entidades** — personas, proyectos, empresas, sistemas, frameworks mencionados
2. **Conceptos** — ideas, patrones, métodos, protocolos
3. **Hechos clave** — afirmaciones concretas, cifras, fechas, decisiones
4. **Contradicciones** — si algo contradice páginas wiki existentes

### Paso 4 — Actualizar páginas wiki

Para cada concepto identificado:
- Si `wiki/concepts/<nombre>.md` existe → agregar sección con nueva info + citar fuente
- Si no existe → crear la página desde la plantilla

Para cada entidad identificada:
- Si `wiki/entities/<nombre>.md` existe → actualizar con nueva info
- Si no existe → crear la página desde la plantilla

Crear siempre `wiki/sources/<slug>.md` con resumen de la fuente:

```markdown
---
title: <título>
source: <url o path>
ingested: <YYYY-MM-DD>
tags: [tag1, tag2]
---

# <título>

## Resumen
<2-3 párrafos con los puntos más importantes>

## Hechos clave
- <hecho 1>
- <hecho 2>

## Conceptos mencionados
- [[concepts/nombre]] — breve contexto
- [[concepts/nombre2]] — breve contexto

## Entidades mencionadas
- [[entities/nombre]] — rol en la fuente
```

### Paso 5 — Actualizar index.md y log.md

En `wiki/index.md`:
- Agregar filas nuevas en las tablas correspondientes (concepts, entities, sources)
- Si la categoría no existe, crearla

En `wiki/log.md` (append-only — NUNCA editar entradas anteriores):

```markdown
## [<YYYY-MM-DD>] ingest | <título de la fuente>

- **Fuente**: <url o path>
- **Páginas creadas**: [[concepts/X]], [[entities/Y]], [[sources/Z]]
- **Páginas actualizadas**: [[concepts/W]]
- **Contradicciones detectadas**: <si hay alguna, describirla>
```

---

## Formato de páginas wiki

### concepts/<nombre>.md

```markdown
---
title: Nombre del Concepto
tags: [tag1, tag2]
sources: [[[sources/fuente1]], [[sources/fuente2]]]
updated: YYYY-MM-DD
---

# Nombre del Concepto

Definición en 1-2 oraciones.

## Detalles

Desarrollo del concepto. Cross-referencias con [[concepts/otro]] o [[entities/entidad]].

## En este proyecto

Cómo aplica específicamente al proyecto actual.

## Fuentes
- [[sources/fuente1]] — contexto
```

### entities/<nombre>.md

```markdown
---
title: Nombre de la Entidad
type: project | person | company | framework | api
tags: [tag1, tag2]
sources: [[[sources/fuente1]]]
updated: YYYY-MM-DD
---

# Nombre de la Entidad

Descripción en 1-2 oraciones.

## Relevancia para el proyecto

Por qué importa.

## Fuentes
- [[sources/fuente1]] — contexto
```

---

## Contradicciones

Si la nueva fuente contradice algo en el wiki:

1. Agregar en la página afectada una sección `## Contradicciones`
2. Describir qué fuente dice qué
3. Marcar cuál es la versión actual adoptada por el proyecto
4. Registrar en log.md

---

## Relación con otros skills

- `wiki-query` consume las páginas que este skill crea
- `wiki-lint` verifica la integridad después de un ingest
- el agente `docs-writer` (no es un skill) puede invocar wiki-ingest al documentar una decisión nueva
