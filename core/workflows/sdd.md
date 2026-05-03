# Spec-Driven Development (SDD)

El flujo de trabajo central del framework forge.

## Principio

**Spec antes que código, siempre.**

Si no hay spec aprobada en `docs/specs/`, no se empieza a implementar.
Esta regla no tiene excepciones.

## Flujo completo

```
1. SPEC
   ├── Identificar la feature a implementar
   ├── Crear spec en docs/specs/[ID]-[nombre].md
   │   (usar skill: spec para la plantilla)
   ├── Revisar dependencias (¿qué specs deben estar listas primero?)
   └── Estado: DRAFT → [humano/lead aprueba] → APPROVED

2. KICKOFF
   ├── Leer spec aprobada
   ├── Mapear agentes necesarios
   ├── Identificar trabajo paralelo vs secuencial
   └── Spawnear team (usar skill: phase-kickoff)

3. IMPLEMENTACIÓN
   ├── Cada agente trabaja en su scope
   ├── Tests junto con el código (no al final)
   └── Si hay decisión no contemplada → actualizar spec antes de continuar

4. REVIEW
   ├── Compliance review (si el proyecto tiene frameworks configurados)
   ├── Security review (si hay endpoints nuevos o manejo de auth)
   └── Test coverage satisfactorio

5. MERGE
   ├── Actualizar spec a estado IMPLEMENTED
   ├── Actualizar CLAUDE.md sección "Phases activas"
   └── Tag de release si corresponde
```

## Reglas del flujo

- **Sin spec → sin código**: el orchestrator rechaza spawnear agentes sin spec aprobada.
- **Una spec por feature atómica**: si no puede implementarse en un sprint, dividirla.
- **Specs son living documents**: actualizarlas durante la implementación, no solo al inicio.
- **Los ADRs son inmutables**: una vez aprobado, crear uno nuevo para cambiar una decisión.

## Cómo crear una spec rápido

```bash
# 1. Crear el archivo
cp docs/specs/_template.md docs/specs/[ID]-[nombre].md

# 2. Completar los campos
# - Contexto: por qué existe esta feature
# - Decisión: qué vamos a implementar exactamente
# - Criterios de aceptación: lista de checkboxes verificables

# 3. Marcar como APPROVED cuando el humano/lead da el OK
```

## Señales de alerta

- "Lo hacemos rápido y documentamos después" → STOP. Spec primero.
- "Esto es tan chico que no necesita spec" → Si tarda más de 2h, necesita spec.
- "Ya sé lo que hay que hacer" → Escríbelo en la spec. Si es obvio, tardás 10 minutos.
