# Skill: wiki-query

Responde preguntas usando el wiki del proyecto como base de conocimiento,
citando las páginas relevantes. Opcionalmente archiva la respuesta como página
de síntesis.

Triggers: /wiki-query, "¿qué dice el wiki sobre", "buscar en wiki", "qué
sabemos de", "wiki:", "query:", "consultar wiki", "what does the wiki say about",
"look up in wiki".

---

## Cuándo usar este skill

- Antes de implementar algo que el wiki podría ya tener documentado
- Para responder preguntas sobre decisiones pasadas, conceptos técnicos o regulación
- Cuando el usuario pregunta por algo que podría estar en el conocimiento acumulado del proyecto

---

## Protocolo de consulta

### Paso 1 — Leer el índice

Leer `docs/wiki/index.md` para identificar qué páginas son relevantes a la pregunta.

Si no hay wiki (`docs/wiki/` no existe o está vacío): indicar que el wiki está vacío
y sugerir usar `/wiki-ingest` para agregar conocimiento.

### Paso 2 — Leer páginas relevantes

Leer las páginas identificadas. Prioridad:

1. `synthesis/` — síntesis cross-cutting ya compiladas
2. `concepts/` — definiciones y detalles técnicos
3. `entities/` — contexto sobre proyectos, personas, sistemas
4. `sources/` — si se necesita detalle de una fuente específica

Leer solo lo necesario — no cargar todo el wiki si la pregunta es acotada.

### Paso 3 — Responder con citas

Formato de respuesta:

```
<Respuesta concisa y directa>

**Fuentes wiki:**
- [[concepts/nombre]] — extracto relevante
- [[entities/nombre]] — extracto relevante

**Gaps detectados:** <páginas que harían falta pero no existen>
```

Si el wiki no tiene suficiente información, decirlo explícitamente y sugerir
qué fuentes ingestar para cubrir el gap.

### Paso 4 — Archivar (opcional)

Si la pregunta produjo una síntesis nueva (no trivial, reutilizable), archivarla:

```
docs/wiki/synthesis/<tema>.md
```

Formato:
```markdown
---
title: <Pregunta o tema>
tags: [tag1, tag2]
sources: [[[concepts/X]], [[entities/Y]]]
date: YYYY-MM-DD
---

# <Título>

<Síntesis completa con citas>

## Páginas relacionadas
- [[concepts/X]]
- [[entities/Y]]
```

Agregar al `index.md` y al `log.md`.

---

## Cuándo NO usar este skill

- Para preguntas sobre el estado actual del código → leer el código directamente
- Para preguntas sobre PRs o git → usar `git log` / `gh`
- Para preguntas donde el wiki claramente no tiene la respuesta → decirlo y sugerir ingest

---

## Relación con otros skills

- `wiki-ingest` popula el wiki que este skill consulta
- `wiki-lint` mantiene la integridad de los links que este skill cita
- Invocado implícitamente por `new-feature` para leer contexto antes de implementar
