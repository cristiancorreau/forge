# Skills del framework forge

## Mapa de skills y dependencias

```
new-feature ──────────────────────────────────────────────────┐
│                                                              │
├── spec              (Fase 1 — verificar/crear spec)          │
├── phase-kickoff     (Fase 3 — si se crea team de agentes)    │
├── security-audit    (Fase 4 — checklist antes de API routes) │
├── db-migrate        (Fase 5 — si hay cambios de schema)      │
├── obsidian-sync     (Fase 6 — OPCIONAL, si está configurado) │
└── local2prod        (Fase 6 — deploy a producción)           │
    └── obsidian-sync (Paso 5 — OPCIONAL)               ───────┘
```

## Catálogo

| Skill | Categoría | Requiere herramienta externa | Invocado por |
|-------|-----------|------------------------------|--------------|
| `spec` | Core | No | new-feature, orchestrator |
| `phase-kickoff` | Core | No | orchestrator, new-feature |
| `security-audit` | Universal | No | new-feature, security-auditor |
| `db-migrate` | Universal | No (solo el ORM del proyecto) | new-feature |
| `local2prod` | Universal | CLI del provider de deploy | new-feature |
| `new-feature` | Universal | No (orquesta los otros) | Usuario directo |
| `obsidian-sync` | Integración | Obsidian + Local REST API | new-feature, local2prod |

## Categorías

### Core — siempre presentes
- **`spec`**: redactar specs siguiendo la plantilla obligatoria
- **`phase-kickoff`**: protocolo para iniciar un sprint o fase nueva

### Universales — activar según el proyecto
Configurar en `project.yaml` bajo `skills.active`:
- **`security-audit`**: checklist de auth, authz, IDOR, input validation
- **`db-migrate`**: flujo seguro de migraciones (Prisma, Drizzle, Rails, Alembic, Goose)
- **`local2prod`**: commit → push → esperar CI → verificar (Vercel, Railway, Fly, custom)
- **`new-feature`**: checklist completo de implementación (orquesta los otros)

### Integraciones — requieren herramienta externa
Configurar en `project.yaml` bajo `skills.integrations`:
- **`obsidian-sync`**: mantiene vault de Obsidian sincronizado con el código

## Cómo conviven

Los skills son componibles: `new-feature` invoca los demás en el orden correcto.
Las integraciones son opcionales — si no están configuradas en `project.yaml`, los
skills que las referencian las saltean silenciosamente.

No hay conflicto entre skills porque cada uno tiene un dominio claro:
- `security-audit` y `db-migrate` son standalone (no se invocan entre sí)
- `local2prod` solo invoca `obsidian-sync` opcionalmente
- `new-feature` es el único que orquesta los demás

## Cómo agregar un skill nuevo

1. Crear `core/skills/<nombre>/SKILL.md` con frontmatter `name`, `description`, `triggers`
2. Definir claramente: cuándo usarlo, qué hace, qué no hace
3. Declarar relación con otros skills al final ("Relación con otros skills")
4. Agregar al catálogo en este README
5. Si requiere configuración en `project.yaml`, actualizar `templates/project.yaml.tpl`
