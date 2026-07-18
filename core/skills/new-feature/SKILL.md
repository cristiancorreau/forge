---
name: new-feature
description: "Checklist completo para implementar una nueva feature desde planificación hasta deploy, orquestando los otros skills del proyecto en el orden correcto. Usar al iniciar cualquier feature nueva."
---

# Skill: new-feature

Checklist completo para implementar una nueva feature desde planificación hasta deploy.
Orquesta los otros skills del proyecto en el orden correcto.

Triggers: /new-feature, "nueva feature", "quiero agregar", "implementar", 
"agregar funcionalidad", "nueva sección", "empezar feature".

---

## Cuándo usar este skill

Al comenzar a implementar cualquier feature nueva, por pequeña que sea.
Asegura que no se saltee la spec, la seguridad ni el deploy.

---

## Fase 1 — Verificar que existe la spec

```
¿Existe docs/specs/<ID>-<nombre>.md con estado APPROVED?
  → Sí: continuar
  → No: STOP — usar el skill /spec para crear la spec primero
```

Leer la spec antes de escribir una sola línea de código.
Identificar qué módulos toca: BD, API, UI, infra, auth.

---

## Fase 2 — Leer documentación existente del área

Si el proyecto tiene un knowledge base (Obsidian, wiki, docs/):

| Si la feature toca... | Leer primero... |
|-----------------------|-----------------|
| API / endpoints | docs de API del proyecto |
| Schema de BD | docs de BD / migraciones previas |
| UI / componentes | design system del proyecto |
| Auth / sesiones | docs de auth del proyecto |
| Deploy / infra | docs de infra / variables de entorno |

Si el proyecto usa `obsidian-sync`: leer las notas del vault antes de implementar.

---

## Fase 3 — Evaluar si crear agent team

**Crear team de agentes cuando**:
- La feature toca más de 3 archivos en capas distintas (BD + API + UI)
- El trabajo es paralelizable (backend y frontend pueden ir en paralelo)
- La feature tiene criterios de compliance que requieren review independiente

**NO crear team cuando**:
- Es un cambio en 1-2 archivos
- Es un bug fix puntual
- Es una consulta o lectura de código

Si se crea team → usar el skill `phase-kickoff` para coordinar el spawn de agentes.

---

## Fase 4 — Checklist de seguridad antes de implementar API routes

Invocar el skill `/security-audit` como checklist mental antes de escribir cualquier endpoint:

- [ ] ¿El endpoint verifica autenticación?
- [ ] ¿El endpoint verifica autorización por rol?
- [ ] ¿Si accede por ID, verifica ownership del recurso?
- [ ] ¿El input del body está validado con un schema explícito?
- [ ] ¿Las queries usan parámetros preparados (no interpolación)?

---

## Fase 5 — Orden de implementación recomendado

```
1. Schema de BD (si hay modelos nuevos)
   → Invocar skill /db-migrate para el flujo seguro

2. Types / interfaces compartidos
   → Definir antes del backend para que el frontend pueda consumirlos

3. Backend — API / servicios
   → Tests junto con el código, no al final

4. Frontend — UI / componentes
   → Consume los tipos ya definidos

5. Build check
   → Verificar que no hay errores de compilación antes de commitear
```

---

## Fase 6 — Post-implementación (no saltear)

1. **Actualizar la spec** con decisiones tomadas durante la implementación
   (agregar en sección "Notas de implementación" del archivo de spec)

2. **Verificación visual** [si la feature tiene UI]
   - Si el proyecto tiene `browser-test` activo → invocar `/browser-test` para tomar screenshot de evidencia
   - Verificar estados: loading, error, vacío, con datos

3. **Actualizar documentación del proyecto** [si aplica]
   - Si el proyecto usa `obsidian-sync` → invocar ese skill ahora
   - Si hay wiki o docs/ → actualizar la sección correspondiente

4. **Deploy** → invocar skill `/local2prod`
   - Esperar estado READY/SUCCESS antes de declarar la feature terminada

5. **Marcar spec como IMPLEMENTED**
   ```bash
   # En docs/specs/<ID>-<nombre>.md, cambiar:
   # > Estado: APPROVED
   # por:
   # > Estado: IMPLEMENTED
   ```

6. **Actualizar CLAUDE.md** — mover el ID de spec de "En curso" a "Completadas"

---

## Checklist final

- [ ] Spec leída y estado APPROVED verificado
- [ ] Documentación del área leída antes de implementar
- [ ] Checklist de seguridad aplicado a endpoints nuevos
- [ ] DB migrada correctamente (dev y prod si aplica)
- [ ] Build pasando sin errores
- [ ] Screenshot de evidencia tomado (si hay UI y `browser-test` activo)
- [ ] Spec actualizada con decisiones de implementación
- [ ] Documentación del proyecto actualizada
- [ ] Deploy exitoso (estado READY confirmado)
- [ ] Spec marcada como IMPLEMENTED

---

## Relación con otros skills

Este skill orquesta los siguientes — no los reemplaza, los invoca en orden:

```
new-feature
├── spec (Fase 1 — verificar/crear spec)
├── phase-kickoff (Fase 3 — si se crea team de agentes)
├── security-audit (Fase 4 — checklist de seguridad)
├── db-migrate (Fase 5 — si hay cambios de schema)
├── browser-test (Fase 6 — [OPCIONAL] screenshot de evidencia si hay UI)
├── obsidian-sync (Fase 6 — [OPCIONAL] si el proyecto lo tiene configurado)
└── local2prod (Fase 6 — deploy a producción)
```

Dependencias opcionales: `browser-test` solo se invoca si está en `project.yaml` bajo `skills.active`.
`obsidian-sync` solo se invoca si está en `project.yaml` bajo `skills.integrations`.
