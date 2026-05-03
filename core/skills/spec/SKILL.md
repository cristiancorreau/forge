# Skill: spec

Redactar specs de features siguiendo la plantilla del framework forge.
Activar antes de escribir cualquier spec nueva.

---

## Cuándo usar este skill

- Al crear una spec nueva en `docs/specs/`
- Al actualizar una spec existente después de cambios de implementación
- Al convertir un ticket/issue en una spec formal

---

## Plantilla obligatoria

```markdown
# [ID] Título de la Feature

> Estado: DRAFT | REVIEW | APPROVED | IMPLEMENTED
> Responsable: [nombre o rol]
> Creada: YYYY-MM-DD | Actualizada: YYYY-MM-DD

## Contexto

Por qué existe esta feature. Qué problema resuelve. Qué pasa si no la hacemos.

## Decisión

Qué vamos a implementar exactamente. Ser específico: endpoints, tablas, componentes.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Opción A | ... | ... | ... |
| Opción B | ... | ... | ... |

## Criterios de aceptación

- [ ] Criterio verificable 1
- [ ] Criterio verificable 2
- [ ] Criterio verificable N

## Impacto de compliance

Si el proyecto tiene `compliance.frameworks` configurado, completar:

- **Ley 21.719**: art. X → [descripción del impacto]
- **GDPR**: Art. Y → [descripción del impacto]
- No aplica (si no hay impacto de compliance)

## Dependencias

- Requiere que [otra spec ID] esté implementada
- Bloqueada por [issue/ticket]

## Notas de implementación

Cualquier decisión tomada durante la implementación que no estaba en la spec original.
```

---

## Reglas al redactar specs

1. **ID único y secuencial**: `A1`, `A2`, `B1`, `C3`... La letra indica la fase/módulo.
2. **Una spec por feature atómica**: si no podés implementarla en un sprint, dividila.
3. **Criterios de aceptación verificables**: cada uno debe poder marcarse DONE sin ambigüedad.
4. **Sin código de implementación en la spec**: la spec describe QUÉ, no CÓMO.
5. **Actualizar la spec durante la implementación**: si tomás una decisión no contemplada, agregala en "Notas de implementación".
