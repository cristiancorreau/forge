# forge: conclusión balanceada v2

**Análisis comparativo de dos posturas técnicas**
**Fecha:** 3 de mayo de 2026
**Versión:** 2.0
**Commit analizado:** `d828157`

---

## Síntesis de ambas posturas v2

El debate sobre forge en su segunda revisión ya no es si el concepto es sólido. Ambos análisis —el favorable y el crítico— coinciden en que la arquitectura de tres tiers, el `project.yaml` como fuente de verdad, y el pipeline SDD son ideas bien fundamentadas. El desacuerdo se desplazó: ahora gira en torno a si las mejoras concretas incorporadas desde v1 son suficientes para recomendar adopción, o si los problemas estructurales restantes siguen haciendo el riesgo demasiado alto.

El informe favorable v2 argumenta que la pregunta de v1 —"¿funciona el concepto?"— ya tiene respuesta afirmativa en el código. Los 112 tests son el artefacto central de ese argumento: cubren flujos de punta a punta, verifican cada profile contra el estándar del framework, documentan regresiones explícitamente, y usan fixtures bien diseñadas. Los adapters de OpenCode y Kiro pasaron de directorios vacíos a implementaciones funcionales con cobertura de tests. `forge-teardown.py` existe, tiene lógica deliberada sobre qué le pertenece al framework y qué al proyecto, y permite que la adopción sea reversible sin pérdida de trabajo. El ecosistema de profiles se duplicó de cuatro a ocho, cubriendo el stack TypeScript moderno, FastAPI, Rails, Express, NestJS y Playwright. La postura favorable concluye que forge está listo para operar.

El informe crítico v2 reconoce estos avances pero mantiene su recomendación negativa por razones que cambiaron en naturaleza respecto a v1. Ya no se trata de adapters vacíos ni del bug de `install_agent`. Se trata de fragilidades estructurales que las mejoras visibles no resolvieron: la documentación central (`agent-standard.md`) describe un ecosistema diferente al que existe en el código —los profiles `rails` y `fastapi` tienen agentes distintos a los documentados, y los profiles `express` y `nestjs` no aparecen en la tabla en absoluto—. El flag `--tool opencode` no invoca el adapter de OpenCode; ejecuta exactamente el mismo código que `--tool claude-code`. El audit sigue generando fix messages con formato no ejecutable. El pre-commit hook sigue mutando archivos sin supervisión del desarrollador. Y el suite de tests, extenso en número, tiene brechas exactamente donde más importaría tener cobertura: los fix messages del audit, el comportamiento del hook, el comportamiento de `--tool opencode`.

La tensión entre ambas posturas revela que forge v2 es un proyecto que mejoró sustancialmente en las cosas que se pueden medir (número de tests, número de profiles, existencia de adapters) y menos en las cosas que solo se detectan con uso real (coherencia entre documentación y código, integración real del flag --tool opencode, ejecutabilidad de los fix messages del audit). Las mejoras son reales. Las fragilidades también.

---

## Tabla comparativa pros vs. contras (v2, con evolución desde v1)

| Dimensión | A favor | En contra | Cambio vs. v1 |
|---|---|---|---|
| **Arquitectura de agentes** | Taxonomía de tres tiers verificada por tests paramétricos en todos los profiles | `agent-standard.md` documenta un ecosistema diferente al existente en el código | Persiste: la documentación central sigue desincronizada, ahora con mayor divergencia |
| **Fuente de verdad** | `project.yaml` ahora conecta fases del sprint con `generate-claude-md.py`; tests lo verifican | `--force` sigue siendo destructivo; no existe merge ni diff interactivo | Mejora parcial: la conexión de fases se implementó; la destrucción al update persiste |
| **Seguridad** | Reglas explícitas en agentes se replican en steering files de Kiro; misma lógica en los tres runtimes | El `compliance-reviewer` opera sin texto legal; disclaimer solo visible si se lee el agente directamente | Mejora: se agregó disclaimer explícito; riesgo operativo persiste en uso bajo presión |
| **Compatibilidad de runtimes** | Adapters funcionales para OpenCode y Kiro con 24 tests de integración | `--tool opencode` no invoca el adapter de OpenCode; instala Claude Code; Codex sin adapter | Mejora parcial: los adapters existen pero `--tool opencode` los ignora |
| **Tooling de auditoría** | Flag `--only` implementado y testeado en ambas sintaxis; output JSON para CI | Fix messages siguen con formato no ejecutable (`forge-init.py` sin path ni prefijo) | Mejora parcial: `--only` existe ahora; el problema de fondo de los fix messages persiste |
| **Onboarding / Salida** | `forge-teardown.py` con dry-run por defecto; distingue qué es del framework vs. del proyecto | Teardown no elimina `CLAUDE.md`, `project.yaml`, hook, ni submodule; requiere 4-6 pasos manuales adicionales | Mejora clara: camino de salida existe; no es completo pero es superior a nada |
| **Ecosistema de profiles** | 8 profiles: hono-drizzle, nextjs-admin, expo, playwright-crawler, fastapi, express, rails, nestjs | `fullstack-engineer` de rails sin descripción en `forge-init.py`; inconsistencia entre adapters | Mejora clara: de 4 a 8 profiles; nuevos problemas de coherencia interna aparecieron |
| **Cobertura de tests** | 112 tests con integración, unitarios, estructurales y de regresión; fixtures bien diseñadas | Sin tests para `token-stats.py`, hook pre-commit, fix messages del audit, `--tool opencode` con output específico | Mejora clara: de 0 a 112 tests; brechas críticas subsisten exactamente donde importa |
| **Bug de `install_agent`** | Corregido con fix limpio y test de regresión explícito | — | Resuelto completamente |
| **Similitud como métrica de calidad** | Umbrales documentados con comentario de calibración | SequenceMatcher confunde especialización intencional con desactualización; problem de fondo sin cambios | Sin cambio: solo mejora de comunicación, no de fondo |
| **Hook pre-commit** | Se agrega mensaje informativo antes de la mutación | Sigue mutando `docs/progress.html` sin que el desarrollador lo haya staged ni revisado | Sin cambio significativo: el comportamiento de mutación persiste |
| **Descriptor de fullstack-engineer** | El adapter de Kiro tiene la entrada correcta | `forge-init.py` no tiene entrada para `fullstack-engineer`; descripción genérica en `AGENTS.md` | Problema nuevo en v2: inconsistencia entre adapters para el mismo agente |

---

## Qué cambió desde v1

### Problemas de v1 que están resueltos

**Bug de `install_agent` (crítico en v1):** La función evaluaba `dst.exists()` después de copiar el archivo, retornando siempre `UPDATE` para instalaciones nuevas. Corregido con `already_existed = dst.exists()` antes del `shutil.copy2()`. Hay un test de regresión explícito que lo documenta y lo protege.

**Flag `--only` inexistente (crítico en v1):** El audit sugería `--force --only=<agente>` como acción correctiva, pero `--only` no existía en `forge-init.py`. Ahora existe, está implementado en ambas sintaxis, y tiene cobertura de tests en dos archivos distintos.

**Adapters vacíos para OpenCode y Kiro (crítico en v1):** Los directorios `adapters/opencode/` y `adapters/kiro/` tenían código ausente. Ahora tienen implementaciones funcionales que leen desde el mismo `project.yaml` y se adaptan a las convenciones de cada runtime. Hay 24 tests de integración cubriendo ambos.

**Desconexión de fases en `CLAUDE.md` generado (señalado en v1):** El generador ahora tiene una función `_render_phases()` que lee `sprint.phases` y genera el listado real con sus specs y status. La fuente de verdad ahora alimenta el documento principal.

**Ausencia de teardown (señalado en v1):** `forge-teardown.py` existe con dry-run por defecto, eliminación selectiva y 8 tests de cobertura. El camino de salida ahora existe.

**Ausencia de disclaimer en compliance (señalado en v1):** El agente `compliance-reviewer` ahora tiene una sección "Limitaciones" que advierte que opera sobre conocimiento de entrenamiento, no sobre texto legal oficial. El disclaimer se propaga al steering file de Kiro.

**Ecosistema de profiles insuficiente (señalado en v1):** De 4 a 8 profiles: se agregaron `fastapi`, `express`, `rails`, `nestjs`. Cada profile tiene cobertura en el test paramétrico de `test_profiles.py`.

**Compatibilidad con Python 3.9 (señalado en v1):** Los scripts usan `Optional[str]` en lugar de `str | None` para mantener compatibilidad con entornos estables no en la última versión menor.

### Problemas de v1 que persisten

**Mutación silenciosa en el hook pre-commit:** El hook sigue haciendo `git add` sobre `docs/progress.html` sin que el desarrollador lo haya revisado. El mensaje informativo agregado en v2 mitiga mínimamente el problema pero no cambia el comportamiento. Ningún test lo cubre.

**Similitud de texto como métrica de calidad en el audit:** `SequenceMatcher.ratio()` con umbrales fijos sigue siendo la métrica principal para detectar desactualización. Los umbrales tienen ahora un comentario de calibración, pero el problema de fondo no cambió: un agente especializado con baja similitud al core aparece como "desactualizado" aunque esté perfectamente al día.

**Mecanismo de actualización destructivo:** `--force` sobreescribe sin merge ni diff. No existe alternativa. Un agente altamente customizado se pierde al actualizar.

**Fix messages del audit no ejecutables:** El formato cambió del problema de v1 (`--only` inexistente) a un problema de v2 (`forge-init.py` sin path ni prefijo). Un usuario que copie y ejecute la acción correctiva del audit recibirá `command not found`. El problema de fondo persiste con distinta naturaleza.

### Problemas nuevos detectados en v2

**`agent-standard.md` desincronizado con más divergencia que en v1:** La documentación central describe rails con `backend-engineer` (pendiente) y fastapi con `backend-engineer` (pendiente), pero los agentes reales son `fullstack-engineer` y `api-engineer` respectivamente. Además, `express` y `nestjs` no aparecen en la tabla en absoluto. Un equipo que lea esta documentación para seleccionar profiles recibirá información incorrecta.

**`fullstack-engineer` sin descripción en `forge-init.py`:** El diccionario `role_descriptions` no tiene entrada para ese nombre, por lo que proyectos que usen el profile `rails` verán la descripción genérica "Agente de implementación" en su `AGENTS.md`. El adapter de Kiro sí tiene la entrada correcta, lo que agrava la inconsistencia.

**`--tool opencode` no invoca el adapter de OpenCode:** El flag acepta `opencode` como valor pero ejecuta exactamente el mismo código que `claude-code`, instalando en `.claude/agents/` y generando el formato de Claude Code. Un usuario de OpenCode que siga el README recibirá una instalación incorrecta sin mensaje de error ni exit code distinto de cero.

**Brechas críticas en el suite de tests:** No hay tests para `token-stats.py`, para el comportamiento del hook pre-commit, para el formato de los fix messages del audit, ni para verificar que `--tool opencode` genere output específico de OpenCode. Los 112 tests cubren bien los happy paths pero no los comportamientos que más importaría detectar antes que los usuarios.

**Teardown incompleto para desvinculación real:** Después de `forge-teardown --confirm`, el proyecto mantiene `CLAUDE.md`, `project.yaml`, el hook activo y el submodule. Se requieren 4-6 pasos manuales adicionales para quedar completamente desvinculado.

---

## Veredicto final actualizado con condiciones

**forge v2 es recomendable** cuando se cumplen simultáneamente estas condiciones:

1. El equipo tiene entre 3 y 8 personas usando agentes de IA activamente en el loop de desarrollo.
2. El stack técnico coincide con alguno de los ocho profiles implementados.
3. El proyecto tiene requisitos de compliance reales, y el equipo entiende que el `compliance-reviewer` es un primer filtro técnico, no una revisión legal.
4. El equipo adopta el flujo SDD sin excepciones.
5. El runtime principal es Claude Code, o el equipo está dispuesto a invocar manualmente los adapters de OpenCode y Kiro como scripts separados.
6. El equipo puede tolerar que `--tool opencode` no invoque el adapter de OpenCode hasta que se corrija.

**forge v2 no es recomendable** cuando alguna de estas condiciones aplica:

1. El equipo necesita que `--tool opencode` genere configuración orientada a OpenCode (no lo hace).
2. El equipo es de 1-2 personas en modo exploración donde el overhead de SDD y `project.yaml` supera el beneficio.
3. El equipo tiene agentes altamente customizados que no pueden ser sobreescritos.
4. El equipo confiaría en los fix messages del audit para ejecutar correcciones (el formato actual no es ejecutable directamente).
5. El equipo depende de la documentación de `agent-standard.md` para seleccionar profiles (la documentación está desincronizada con el código).

---

## Recomendación para distintos perfiles de equipo

### Equipo de producto, 4-8 personas, Claude Code como runtime principal

**Adoptar forge v2.** Este es el caso de uso donde la mejora respecto a v1 es más evidente. Los 112 tests dan confianza razonable de que el framework no se va a degradar silenciosamente en los flujos principales. Los 8 profiles cubren los stacks más frecuentes. El teardown hace la adopción reversible. La inversión de setup (~2 horas) se amortiza en la primera semana de uso activo con agentes.

Condición: el equipo debe saber que `agent-standard.md` no refleja el ecosistema real, que los fix messages del audit no son ejecutables directamente, y que `--force` destruye customizaciones sin merge.

### Equipo con stack no cubierto por los 8 profiles

**Evaluar si el stack se puede agregar como un profile Tier 2.** El test paramétrico en `test_profiles.py` facilita que un profile nuevo pase la batería de verificaciones sin esfuerzo adicional. Contribuir un profile es materialmente más viable en v2 que en v1 porque la estructura de tests ya exists. Si la contribución no es una opción, la alternativa sigue siendo: agentes directamente en `.claude/agents/` sin dependencia de forge.

### Equipo que evalúa múltiples runtimes (Claude Code + OpenCode o Kiro)

**Adoptar con ajuste de expectativas.** Los adapters de Kiro y OpenCode tienen implementaciones funcionales y tests. Pero la integración no es simétrica: `forge-init.py --tool kiro` llama al adapter vía subprocess (funciona), mientras que `forge-init.py --tool opencode` no llama al adapter (no funciona como se espera). Para Kiro, forge v2 es un primer ciudadano real. Para OpenCode, el adapter debe invocarse manualmente. Un equipo que entienda esto puede operar con ambos; un equipo que espere simetría completa se encontrará con comportamiento sorpresivo.

### Equipo enterprise con obligaciones de compliance regulatorio

**Adoptar con protocolo complementario.** El `compliance-reviewer` con poder de veto, el disclaimer legal en el agente, y la propagación del disclaimer al steering file de Kiro hacen la propuesta más honesta que en v1. El audit con output JSON (`--json`) es particularmente valioso en este perfil: hace los estándares ejecutables en CI. El equipo debe complementar el agente con revisión legal profesional y no depender de los fix messages del audit como comandos ejecutables.

### Startup o equipo de 1-2 personas en exploración

**No adoptar.** La recomendación de v1 se mantiene sin cambios. El overhead de configuración, mantenimiento del `project.yaml`, gestión del submodule y la fricción del flujo SDD superan el beneficio para equipos pequeños en modo exploración. Un `CLAUDE.md` bien escrito a mano y agentes simples en `.claude/agents/` cubren el 80% del valor a una fracción del costo operativo de forge.

### Equipo que quiere evaluar sin compromiso previo

**Adoptar con el entendimiento de que el teardown no es completo.** `forge-teardown.py` elimina los artefactos principales, pero no es una desinstalación limpia en un solo comando: CLAUDE.md, project.yaml, el hook y el submodule requieren remoción manual adicional. El equipo que quiera evaluar forge por un sprint puede hacerlo con riesgo acotado, pero debe conocer los pasos de limpieza completos antes de empezar.

---

## Nota sobre la evolución del proyecto

forge v2 demuestra que el equipo detrás del framework responde al feedback con trabajo real. Los problemas más evidentes de v1 —adapters vacíos, bug de `install_agent`, flag `--only` inexistente, ausencia de tests y teardown— están todos corregidos o implementados. Este patrón de respuesta al feedback es, en sí mismo, una señal positiva sobre la dirección del proyecto.

Lo que preocupa en v2 no son los problemas que se resolvieron, sino los que aparecieron al agregar funcionalidad: la documentación central se desincronizó más, no menos; el flag `--tool opencode` promete algo que no entrega; los nuevos profiles introdujeron un agente (`fullstack-engineer`) que no está correctamente registrado en el script principal. Estos son los síntomas típicos de un proyecto que crece más rápido que su suite de tests puede verificar.

La conclusión correcta no es descartar forge, sino reconocer que está en una etapa donde la adopción implica participación activa: reportar los problemas encontrados, contribuir tests para los comportamientos no cubiertos, y no confiar en la documentación cuando difiere del código. Para equipos con capacidad y disposición para ese nivel de participación, forge v2 ofrece una base arquitectónica sólida y un ritmo de mejora demostrable. Para equipos que necesitan un framework estable y maduro que funcione exactamente como documenta, la espera está justificada.
