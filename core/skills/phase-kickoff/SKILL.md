---
name: phase-kickoff
description: "Protocolo para iniciar una nueva fase de desarrollo en un proyecto forge. Usar al comienzo de cada sprint o fase nueva."
---

# Skill: phase-kickoff

Protocolo para iniciar una nueva fase de desarrollo en un proyecto forge.
Activar al comienzo de cada sprint o fase nueva.

Triggers: /phase-kickoff, "iniciar sprint", "kickoff de fase", "empezar fase"

---

## Cuándo usar este skill

Al iniciar trabajo en una nueva fase o sprint del proyecto.

---

## Pasos del kickoff

### 1. Revisar el estado actual

```bash
# Ver qué está en curso y qué falta
cat CLAUDE.md | grep -A 10 "Phases activas"
ls docs/specs/
git log --oneline -10
```

### 2. Leer specs de la fase

Para cada spec de la fase que empieza:
- Leer el archivo en `docs/specs/[ID]-[nombre].md`
- Verificar que el estado sea `APPROVED` (no `DRAFT`)
- Verificar que las dependencias estén implementadas

### 3. Identificar dependencias entre specs

Antes de asignar trabajo, mapear cuáles specs deben ir en qué orden:

```
Ejemplo:
  A1 (schema) → A2 (consent store) → B1 (banner)
  A1 (schema) → A3 (vendor catalog) [paralelo con A2]
```

### 4. Spawnear el team

Con el mapa de dependencias claro:
- Specs sin dependencias → pueden ir en paralelo (background agents)
- Specs con dependencias → secuenciales o con SendMessage de coordinación

### 5. Actualizar CLAUDE.md

Al terminar la fase, actualizar la sección de "Phases activas":

```markdown
## Phases activas y estado

- **Sprint actual:** Sprint N
- **Completadas:** [IDs completados]
- **En curso:** [IDs en progreso]
- **Pendientes:** [IDs pendientes]
```

---

## Checklist de kickoff

- [ ] Specs de la fase leídas y en estado APPROVED
- [ ] Dependencias entre specs mapeadas
- [ ] Team spawneado con agentes apropiados
- [ ] CLAUDE.md actualizado con fase activa
- [ ] No hay specs en DRAFT sin aprobación del humano
