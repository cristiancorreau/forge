---
name: onboard
description: Analiza un proyecto existente con los agentes especializados y genera documentación (arquitectura, onboarding, revisión de seguridad). Usar al adoptar un repo o cuando alguien nuevo debe entenderlo. No usar para proyectos vacíos sin código.
version: "1.0.0"
triggers:
  - /onboard
metadata:
  type: reference
---
# Skill: onboard

Analiza un proyecto ya creado con los agentes especializados de forge y produce
documentación real: arquitectura, guía de onboarding y revisión de seguridad.
Convierte la base factual de `forge analyze` en una vista comprensible del repo.

Triggers: /onboard, "documentar el proyecto", "onboarding", "entender este repo",
"analizar el código", "qué hace este proyecto".

No usar para proyectos vacíos sin código ni para crear una feature nueva (para
eso está `/new-feature`).

## Cuándo usar este skill

- Justo después de `forge adopt` sobre un repo existente.
- Cuando un dev nuevo (humano o agente) necesita entender el proyecto.
- Antes de tocar un código que nadie del equipo conoce bien.

## Prerequisitos

Antes de empezar, verifica:
- Estás en la raíz del repo (hay `project.yaml`; si no, ejecuta `forge adopt` primero).
- El árbol de trabajo está limpio o respaldado en git (este skill escribe en `docs/`).
- `forge analyze` corre sin error sobre el repo.

## Paso 1 — Base factual con forge analyze

```bash
forge analyze --json > .forge/analysis.json
```

Esto da el sustrato determinístico: stack, hotspots (directorios y archivos más
grandes), marcadores TODO/FIXME, tests y los **agentes sugeridos**. No alucines
la estructura: ancla todo lo que sigue en esta salida.

## Paso 2 — Despachar agentes especializados (lectura del código)

Asigna cada entregable al agente correcto, en paralelo cuando no haya dependencia:

1. `docs-writer` → `docs/architecture.md`: módulos, límites, flujo de datos y los
   entrypoints reales (los de `forge analyze`, no inventados).
2. `docs-writer` → `docs/onboarding.md`: cómo levantar el proyecto, comandos de
   dev/test/build (de los `scripts` detectados), y el "primer cambio seguro".
3. `security-auditor` → `docs/security-review.md`: hallazgos con severidad
   (CRÍTICO/ALTO/MEDIO/BAJO), anclados a archivo:línea.
4. Ingenieros del stack (`backend-engineer`/`frontend-engineer`) → notas por
   módulo de los hotspots más grandes.

## Paso 3 — Alimentar el wiki semántico

Pasa cada documento generado por `/wiki-ingest` para que el conocimiento quede
consultable con `/wiki-query`. El wiki factual ya existe (lo siembra `forge
adopt`); este paso agrega la capa interpretada.

## Ejemplo

```bash
forge analyze --write          # deja docs/analysis/<fecha>-analysis.md
# luego, en el agente:
/onboard                       # genera architecture.md + onboarding.md + security-review.md
```

## Criterios de aceptación

- [ ] `docs/architecture.md`, `docs/onboarding.md` y `docs/security-review.md` creados.
- [ ] Cada afirmación ancla en la salida de `forge analyze` o en archivo:línea real.
- [ ] Los comandos de onboarding salen de los `scripts` detectados, no inventados.
- [ ] Los documentos quedaron ingeridos en el wiki.

## Manejo de errores

Si `forge analyze` falla, detente: probablemente falta `project.yaml` (ejecuta
`forge adopt`) o la ruta no es un repo. Si un agente no puede anclar una
afirmación en el código, debe marcarla como "a confirmar" en vez de inventar.

## Relación con otros skills

- `forge adopt` instala forge en el repo y siembra el wiki factual; `/onboard` lo documenta.
- `/wiki-ingest` y `/wiki-query` guardan y consultan el conocimiento sintetizado.
- `/security-audit` profundiza la revisión de seguridad cuando hace falta.

Devuelve los documentos generados y un resumen de hallazgos. Esta skill es
autocontenida y debería consumir menos de 4000 tokens de instrucción.

## Excusas comunes

| Excusa | Realidad |
|---|---|
| "Leo unos archivos y deduzco la arquitectura" | Sin `forge analyze` vas a inventar estructura; ancla en la salida real. |
| "La revisión de seguridad la hago después" | Después no se hace. Es un entregable del flujo, no opcional. |
| "El proyecto es chico, no necesita onboarding" | Lo chico crece y rota gente; el costo de entender se paga igual. |

## Señales de alerta

- Afirmaciones de arquitectura sin un archivo:línea o una señal de `forge analyze` que las respalde
- Comandos de "cómo correr el proyecto" que no existen en los `scripts` detectados
- Declarar "documentado" sin haber ingerido nada al wiki
- Saltarse `docs/security-review.md` porque "parecía seguro"

## Verificación

- [ ] `forge analyze --json` corrió sin error — pega la salida usada como base
- [ ] Cada documento cita su evidencia (salida de analyze o archivo:línea)
- [ ] Los comandos de onboarding se verificaron contra `scripts` (no inventados)
- [ ] Los tres documentos quedaron ingeridos al wiki (`/wiki-query` los encuentra)
