# Sprint Workflow

Cómo gestionar sprints en proyectos forge.

## Estructura de un sprint

```
Sprint N (14 días por defecto)
├── Día 1-2: Kickoff
│   ├── Revisar specs pendientes de la phase
│   ├── Aprobar specs DRAFT que estén listas
│   └── Asignar trabajo al team
├── Día 3-11: Implementación
│   ├── Agentes trabajan en sus specs
│   ├── Daily: actualizar CLAUDE.md con bloqueadores
│   └── PRs abiertos por feature (no por archivo)
├── Día 12-13: Review
│   ├── Compliance review (si aplica)
│   ├── Security review (si aplica)
│   └── Testing E2E
└── Día 14: Cierre
    ├── Mergear PRs aprobados
    ├── Actualizar sección "Phases activas" en CLAUDE.md
    └── Tag de release
```

## Tracking de progreso

El progreso se visualiza en `docs/progress.html`.

## Estado de las specs en CLAUDE.md

Mantener esta sección actualizada:

```markdown
## Phases activas y estado

- **Sprint actual:** Sprint N
- **Completadas:** A1, A2, A3
- **En curso:** B1, B2
- **Pendientes:** B3, B4, C1
- **Bloqueadores:** [descripción si hay]
```

## Criterios para "completada"

Una spec está COMPLETADA cuando:
- [ ] Código implementado y mergeado a main
- [ ] Tests pasando en CI
- [ ] Spec actualizada a estado IMPLEMENTED
- [ ] Compliance review aprobado (si aplica)
- [ ] Documentación actualizada (si aplica)
