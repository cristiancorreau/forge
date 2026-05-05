# forge v2.0.2 — Síntesis ejecutiva independiente v7

**Fecha:** 2026-05-04  
**Metodología:** Dual-agent independiente — análisis crítico y favorable generados sin visibilidad cruzada, síntesis neutral  
**Versión analizada:** forge v2.0.2  
**Métricas:** 4297 líneas de código core · 464 tests · 15 profiles · 3 agentes especialistas

---

## Resumen ejecutivo

forge v2.0.2 es la primera versión del framework sin bugs P0 verificados. El ciclo completo de deuda técnica documentado en análisis anteriores está cerrado: la URL del submodule es correcta, el error de Windows tiene mensaje orientativo, la extensión VS Code está documentada e instalable, el campo `summary` existe en el JSON de audit, los flags `--forge` y `--only` están implementados, los 15 profiles están en la documentación de referencia, y las referencias a dominios eliminados han sido limpiadas. Esta convergencia no es accidental — el log de commits muestra cuatro prefijos `fix()` antes de los dos `feat()` del ciclo, lo que refleja disciplina de priorización.

Las dos adiciones de fondo en v7 son el profile de Laravel (con un agente de migration-specialist que cubre la ruta L6→L13 salto a salto con breaking changes específicos) y el profile de WordPress (con cobertura diferenciada para FSE nativo, Divi y Elementor). El análisis dual concuerda en que la profundidad de Laravel es genuina y verificable. El análisis crítico señala que los agentes de Divi y Elementor dependen de APIs de terceros con ciclos cortos de actualización, creando deuda de mantenimiento que el repositorio no tiene mecanismo formal para cubrir.

El análisis coincide en que los problemas que persisten son de gobernanza, no de implementación: ausencia de GitHub Actions, sin releases semánticos formales, extensión sin publicar en el Marketplace, y uso de `SendMessage` como primitiva de coordinación de agentes sin verificación pública de que esa API exista en la documentación oficial de Claude Code. Ninguno de estos problemas impide el uso del framework, pero sí determina el nivel de riesgo al que se expone un adoptador externo.

---

## Qué cambió entre v5 y v7

### Cerrado definitivamente

| Problema | Tipo | Evidencia en código |
|----------|------|---------------------|
| Windows sin advertencia (`termios`) | Bug P0 | forge.py línea 19: guard con mensaje orientativo |
| URL submodule con guión | Bug P0 | README.md línea 81: `socialwebcl/forge` |
| Extensión VS Code inaccesible | Gap P0 | README y guide.md con instrucciones VSIX |
| Campo `summary` ausente en JSON | Bug de contrato | forge-audit.py línea 590: campo confirmado |
| `--forge` y `--only` no implementados | Bug P1 | forge-audit.py líneas 843-850 |
| codex.md convención no verificada | Riesgo P1 | Archivo eliminado, adapter simplificado |
| 4 profiles sin documentación | Deuda P1 | agent-standard.md lista los 15 |
| Referencias a aitmpl.com | Deuda P1 | Cero ocurrencias fuera de analysis/ |
| Sin instrucciones de `submodule update` | Gap onboarding | README.md actualizado |

### Agregado en v7

| Feature | Impacto |
|---------|---------|
| Profile laravel (3 agentes, migration L6→L13) | Alto — cubre el mayor ecosistema PHP legacy |
| Profile wordpress (3 agentes, FSE/Divi/Elementor) | Medio — amplio alcance, mantenimiento complejo |
| Filtrado de oportunidades por stack | Alto — elimina ruido en proyectos con stack declarado |
| Audit UI redesign (OK colapsados, cards con desc.) | Medio — reduce scroll, mejora UX de onboarding |
| forge-add-opportunities.py | Medio — permite actualización programática de project.yaml |
| VS Code: QuickPick multi-select de oportunidades | Medio — completa el flujo audit→apply desde el editor |
| Agentes especialistas (init, audit, catalog) | Bajo-Medio — ayudan dentro de Claude Code, no externamente |
| Tests: +106 casos (358 → 464) | Alto — cobertura de contratos nuevos |

---

## Las 3 fortalezas más importantes en v7

### 1. Migration-specialist de Laravel: conocimiento de stack sin equivalente

El agente `migration-specialist` del profile de Laravel es el componente de mayor valor diferencial de v7. No es documentación genérica de Laravel — es un mapa de upgrades con breaking changes verificados por versión. Un equipo con un proyecto en L6 puede instruir al agente para guiar el proceso de upgrade paso a paso, con las deprecaciones exactas de cada salto. La alternativa es un dev leyendo el upgrade guide oficial de cada versión por separado, o pagando por un experto externo de Laravel.

La existencia de este agente no implica que sea mejor que contratar un experto. Implica que un equipo sin ese experto tiene ahora un punto de partida estructurado que codifica decisiones que de otro modo tendrían que descubrir por trial and error.

### 2. Audit filtrado por stack: señal vs ruido en oportunidades

En versiones anteriores, un proyecto con `stack.backend: laravel` veía como "oportunidades" `nextjs-admin`, `go-gin`, `sveltekit`, `expo`, y otros 10 profiles irrelevantes. La señal real (el profile `laravel` disponible) se perdía en el ruido.

Con `_PROFILE_RELEVANCE` y el filtrado en `find_opportunities()`, ese mismo proyecto ve solo los profiles que son candidatos reales para su stack. La lista de oportunidades pasa de ser ruido a ser información accionable. Para proyectos con stack bien declarado, esta es la mejora de UX de mayor impacto de este ciclo.

### 3. Cierre sistemático de deuda antes de expansión de features

El patrón del log de commits dice más sobre la madurez del proyecto que cualquier feature individual. En la ronda anterior de commits que llevó a v2.0.2:

```
fix(compat): handle Windows gracefully
fix(readme): correct submodule URL
fix(readme): add git submodule init instructions
fix(docs): sync agent-standard + README + SKILL.md
fix(codex): eliminate codex.md, add 12 adapter tests
fix(ux): improve onboarding for new users
test: add platform compat + VS Code extension + audit JSON contract tests
feat(profiles): add laravel and wordpress profiles
feat(audit): smart profile filtering + interactive opportunity selector
feat(audit): redesign terminal UI
```

Siete commits correctivos antes de dos commits de features. Esa secuencia demuestra que el maintainer prioriza la confiabilidad del onboarding sobre la expansión del featureset. Para un adoptador externo, eso es una señal positiva de sostenibilidad.

---

## Los 3 problemas más importantes que persisten

### 1. Gobernanza sin mecanismos formales: el riesgo de continuidad

El repositorio no tiene GitHub Actions, no tiene releases semánticos con tags git, y no tiene CHANGELOG. La versión `2.0.2` existe como string en dos archivos de código pero no como tag en el repositorio. Un adoptador que fija el submodule al commit actual puede recibir breaking changes silenciosos en el próximo pull.

Este no es un problema que el código resuelva — es una decisión de proceso. Un repositorio con la madurez de v7 merece al menos un workflow básico de CI y un primer tag semántico `v2.0.2`. La ausencia de estos mecanismos no indica mala calidad técnica (los 464 tests lo contradicen), sino que la madurez de proceso no ha seguido el ritmo de la madurez de código.

### 2. SendMessage como primitiva de coordinación sin verificación pública

El agente `orchestrator.md` usa `SendMessage({ to: "backend-engineer", message: "..." })` como primitiva de delegación de tareas. Esta función no aparece en la documentación pública de herramientas de Claude Code a la fecha de este análisis. El sistema de agentes de Claude Code usa el tool `Agent` con `subagent_type` para invocar subagentes — eso sí está documentado.

La diferencia es importante: si `SendMessage` es una convención que Claude interpreta como texto natural (no una API real), entonces cambios en el modelo podrían romper silenciosamente la coordinación del orchestrator. Si es una API real no documentada, la dependencia es frágil frente a cambios no anunciados.

Este riesgo es el de mayor impacto potencial porque afecta el componente central del framework: la capacidad del orchestrator de delegar trabajo a agentes especializados.

### 3. Profiles de Divi y Elementor: deuda de mantenimiento programada

Los agentes `divi-engineer.md` y `elementor-engineer.md` son correctos para las versiones actuales de Divi 5 y Elementor Pro 3.x. El problema es que ambas herramientas tienen ciclos de actualización agresivos y frecuentes breaking changes en sus APIs de extensibilidad (el `ET_Builder_Module` tuvo breaking changes entre Divi 4 y Divi 5; Elementor deprecated múltiples hooks entre versiones 3.x). 

A diferencia del agente `migration-specialist` de Laravel (que documenta una ruta de upgrade ya ocurrida y estable), los agentes de constructores de página documentan APIs de terceros que van a cambiar. Sin un mecanismo de actualización automática ni una señal de "fecha de validez" en los agentes, estos dos agentes se volverán incorrectos en 6-18 meses sin que el audit lo detecte.

---

## Score por dimensión

Escala 1-10. Comparación con v5.

| Dimensión | Score v5 | Score v7 | Δ | Justificación |
|-----------|:--------:|:--------:|:---:|---------------|
| **Instalación** | 4 | 8 | +4 | URL correcta, submodule instructions, Windows message, extensión documentada |
| **Developer Experience** | 6 | 8 | +2 | Audit UI rediseñado, filtrado por stack, opportunity picker integrado |
| **Cobertura de stacks** | 7 | 8 | +1 | 15 profiles todos documentados; cobertura de Divi/Elementor pesa negativamente |
| **CI/CD (del propio forge)** | 5 | 5 | 0 | Sin GitHub Actions. Audit integrable en CI de proyectos adoptadores: sin cambio |
| **Gobernanza** | 3 | 3.5 | +0.5 | Version bump a 2.0.2 pero sin tags ni CHANGELOG |
| **Runtime agnosticismo** | 8 | 8 | 0 | codex.md eliminado mejora pero no cambia el score |
| **Extensibilidad** | 7 | 8 | +1 | VS Code documentada e instalable; forge-add-opportunities.py |
| **Calidad de tests** | 7 | 8 | +1 | 464 tests, contratos JSON verificados, cobertura de platform compat |

**Score global ponderado v7: 7.0/10** (v5: 5.7/10)

El salto de 5.7 a 7.0 refleja principalmente el cierre de los bugs P0 de instalación y DX, que tenían peso alto en la ponderación. Las dimensiones de gobernanza y CI siguen siendo las más débiles.

---

## Veredicto diferenciado

**Para quién forge v2.0.2 tiene sentido claro:**
- Equipos de 2-8 personas en macOS/Linux con stack cubierto por alguno de los 15 profiles
- Proyectos PHP/Laravel que necesitan guía de upgrade de versiones — el migration-specialist es el componente de mayor ROI del framework
- Proyectos con requerimientos de compliance (GDPR, LGPD, Ley 21.719): el compliance-reviewer es el componente sin equivalente en el ecosistema
- Equipos que usan simultáneamente Claude Code y otro runtime (OpenCode, Kiro): forge es el único framework con adapters para los cuatro

**Para quién el balance no justifica el overhead:**
- Desarrolladores que recién comienzan con Claude Code y quieren empezar simple — la curva de forge (submodule, Python, YAML, tiers) precede al valor
- Proyectos individuales con stack no cubierto por profiles existentes
- Equipos que prefieren control total sobre el contexto de sus agentes sin herramientas intermedias
- Proyectos en Windows sin WSL configurado

**Condición recomendada para adopción:**
Fijar el submodule a un commit específico en vez de seguir `main`. La ausencia de releases semánticos hace que `main` sea una referencia inestable para dependencias de producción.

---

## Tabla comparativa del ciclo v5 → v7

| Área | v5 | v7 |
|------|----|----|
| Bugs P0 | 3 activos | 0 activos |
| Profiles documentados | 9/13 | 15/15 |
| Tests | 358 | 464 |
| VS Code accesibilidad | Sin documentación ni VSIX | Documentada, instalable |
| Oportunidades en audit | 15 profiles siempre | Solo relevantes al stack |
| JSON `summary` | Ausente (CI falsa seguridad) | Presente y testeado |
| Windows | `ModuleNotFoundError` | Mensaje orientativo |
| GitHub Actions | Sin | Sin |
| Tags semánticos | Sin | Sin |
