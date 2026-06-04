# docs/specs — Specs del repositorio forge

Este directorio es el hogar del flujo Spec-Driven Development (SDD) de forge.
forge predica el gate spec-first, así que su propio repo lo cumple: todo cambio
no trivial empieza con una spec aprobada aquí.

## Ciclo de vida de una spec

Cada spec atraviesa estos estados (campo `Estado:` en su cabecera):

| Estado        | Significado                                                            |
|---------------|------------------------------------------------------------------------|
| `DRAFT`       | Borrador en redacción. Aún no se revisa.                                |
| `REVIEW`      | Lista para revisión. `forge-quality-reviewer` la evalúa.               |
| `APPROVED`    | Aprobada. Habilita la implementación (gate spec-first satisfecho).      |
| `IMPLEMENTED` | El cambio se construyó y mergeó. La spec queda como registro histórico. |

El gate es estricto: sin una spec `APPROVED`, `forge-quality-reviewer` bloquea
el PR. Esto está declarado en `project.yaml`:

```yaml
rules:
  require_spec_before_implementation: true
```

## Cómo crear una spec

1. Copiar la plantilla: `cp docs/specs/_template.md docs/specs/<id>-<slug>.md`
   (o usar el skill `/spec`, que la redacta siguiendo la plantilla forge).
2. Elegir un `<id>` corto y estable (ej: `SPEC-001`, `CLI-007`).
3. Completar Contexto, Decisión, Alternativas y Criterios de aceptación.
4. Pasar el estado a `REVIEW` y pedir revisión.
5. Tras aprobación (`APPROVED`), implementar.
6. Al mergear, cambiar a `IMPLEMENTED` y registrar Notas de implementación.

## Convenciones

- Un archivo por spec. Nombre: `<id>-<slug-en-kebab-case>.md`.
- `_template.md` es la plantilla canónica (copiada de `core/templates/spec-template.md`).
  No editarla con contenido de una spec concreta.
- Los criterios de aceptación deben ser verificables (checkboxes).
- Si el cambio toca compliance, completar la sección "Impacto de compliance".
