# SPEC-060 Resiliencia de skills — anti-racionalización + gates de verificación

> Estado: APPROVED
> Responsable: forge maintainers
> Creada: 2026-06-13 | Actualizada: 2026-06-13

## Contexto

Los agentes de IA tienden a *saltarse pasos* cuando un skill no lo impide
explícitamente: "lo testeo después", "esto es muy simple para una spec", "ya lo
probé a mano". El resultado es código que "parece bien" pero no está verificado.

El proyecto open-source [`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills)
(MIT, Copyright (c) 2025 Addy Osmani) popularizó un patrón eficaz contra esto:
cada skill incluye una **tabla de racionalizaciones** (la excusa típica y su
refutación), una lista de **señales de alerta** y un **gate de verificación con
evidencia obligatoria** ("'parece bien' nunca alcanza"). forge ya distribuye
skills a 19 runtimes y ya mide calidad con `forge eval` (SPEC-053), pero no
recompensa ni exige este patrón.

Esta spec adapta el patrón al formato y al idioma de forge (no copia los
contenidos de agent-skills; reescribe el mecanismo en español y lo integra al
scorer determinístico). Se acredita la inspiración por su licencia MIT.

## Decisión

1. **Formato de skill — tres secciones nuevas, opcionales pero puntuadas:**
   - `## Excusas comunes` — tabla `| Excusa | Realidad |` que documenta la
     racionalización típica y por qué no aplica.
   - `## Señales de alerta` — lista de red flags que indican que el agente se
     está salteando el proceso.
   - `## Verificación` — checklist `- [ ]` cuyo cierre exige **evidencia**
     (salida de test/build, no "parece bien").

2. **`forge eval` — nueva categoría `resilience` (8ª categoría, 0–10):**
   - tabla de racionalizaciones presente → 4 pts
   - sección de señales de alerta presente → 3 pts
   - gate de verificación con evidencia (checklist + referencia a salida/log) → 3 pts

   El `overallScore` pasa a promediar 8 categorías. El two-gate (SPEC-054)
   mantiene umbral 75 y piso 6 por categoría; ahora un skill sin resiliencia
   cae por el piso, forzando el patrón en skills `installable`.

3. **Dogfooding:** los meta-skills `forge-skill-creator` y `forge-skill-improver`
   incorporan las tres secciones y siguen pasando su propio gate. El creador
   enseña a emitirlas en cada skill nuevo.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Extender `testability` en vez de categoría nueva | No cambia el conteo de categorías | Mezcla conceptos; oculta la dimensión nueva | No expresa la funcionalidad como dimensión propia |
| Copiar los SKILL.md de agent-skills | Rápido | Copia literal, inglés, no respeta el estilo forge | Licencia/originalidad: se adapta, no se copia |
| Sólo documentar el patrón sin puntuarlo | Cero riesgo | No mueve la aguja: nadie lo aplica | No agrega "funcionalidad" real |

## Criterios de aceptación

- [ ] `evalSkill()` devuelve **8** categorías, incluida `resilience`.
- [ ] `scoreResilience()` puntúa las tres secciones de forma determinística.
- [ ] `overallScore` promedia 8 categorías (fórmula robusta a la cantidad).
- [ ] `forge-skill-creator` y `forge-skill-improver` pasan su gate (overall ≥ 75, piso ≥ 6) con la categoría nueva.
- [ ] `forge eval --json` reporta `resilience` en `categories`.
- [ ] Tests del scorer cubren: skill con las 3 secciones (10/10) y skill sin ellas (0/10).
- [ ] Suite completa verde.

## Impacto de compliance

Ninguno. Cambio interno de scoring y documentación; no toca datos de usuarios.

## Atribución

Patrón inspirado en [`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills)
(MIT). forge reimplementa el mecanismo (scorer determinístico + secciones en
español); no incorpora texto del repo original.
