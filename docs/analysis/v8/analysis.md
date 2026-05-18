# forge v0.2.2 — Síntesis ejecutiva independiente v8

**Fecha:** 2026-05-05  
**Metodología:** Dual-agent independiente — análisis crítico y favorable generados sin visibilidad cruzada, síntesis neutral  
**Versión analizada:** forge v0.2.2  
**Métricas:** 5062 líneas de código core · 464 tests · 15 profiles · 6 slash commands · CI GitHub Actions

---

## Resumen ejecutivo

forge v0.2.2 es el primer ciclo donde el problema principal resuelto no fue un bug funcional sino gobernanza. GitHub Actions con matrix Python 3.9/3.11/3.12, el tag semántico `v0.2.2`, y un `CHANGELOG.md` estructurado llegaron en el mismo ciclo. La versión fue corregida de 2.0.2 a 0.2.x, lo que establece una convención semántica con espacio explícito para evolución.

El ciclo también agrega cuatro features de DX sustanciales: generación automática de CLAUDE.md durante `forge-init`, inyección de `scope:` en el frontmatter de cada agente a partir de `agent_paths` en `project.yaml`, generación de `.claude/settings.json` con permisos por stack, y tres slash commands (`/new-feature`, `/deploy-check`, `/review`) instalados automáticamente. El TUI de dos paneles en el picker de oportunidades del audit completa el set.

El análisis dual concuerda en que el salto de gobernanza es el más importante del ciclo, y en que el gap más urgente es la ausencia de tests para el código nuevo. Las cuatro features mencionadas no tienen cobertura en la suite. El code ratio creció 18% (4297 → 5062 líneas) sin que los tests crecieran en absoluto (464 → 464). Esto no rompe el framework hoy, pero establece una deuda que se acumula silenciosamente.

---

## Qué cambió entre v7 y v8

### Cerrado definitivamente

| Problema | Tipo | Evidencia en código |
|----------|------|---------------------|
| Sin GitHub Actions | Gap gobernanza | `.github/workflows/tests.yml`: matrix 3.9/3.11/3.12 |
| Sin tags semánticos | Gap gobernanza | Tag `v0.2.2` en repositorio |
| Sin CHANGELOG | Gap gobernanza | `CHANGELOG.md` con formato Keep a Changelog |
| Versioning inconsistente | Error proceso | VERSION `0.2.2`, antes `2.0.2` |

### Agregado en v8

| Feature | Impacto |
|---------|---------|
| CLAUDE.md auto-generado en forge-init | Alto — el archivo de contexto de Claude Code ya no es manual |
| Scope injection por agente | Medio-Alto — cuando agent_paths está configurado, cada agente solo ve su directorio |
| `.claude/settings.json` por stack | Medio — permisos versionables adecuados al lenguaje del proyecto |
| Slash commands en forge-init | Medio — `/new-feature`, `/deploy-check`, `/review` instalados desde el primer día |
| TUI de dos paneles en oportunidades | Medio — lista navegable + detalle sin scroll en el picker del audit |
| Comando "Regenerar CLAUDE.md" en VS Code y CLI | Bajo-Medio — actualización sin reinstalar agentes |

### No cambió

- 464 tests (cero nuevos)
- 15 profiles (sin profiles nuevos)
- SendMessage en orchestrator (sin verificación)
- Extensión VS Code sin publicar en Marketplace

---

## Las 3 fortalezas más importantes en v8

### 1. Gobernanza: de proyecto experimental a dependencia mantenible

El repositorio tenía en v7 todos los atributos de un proyecto personal bien ejecutado: código de calidad, tests, documentación. Le faltaban los atributos de una dependencia externa confiable: CI, tags, CHANGELOG. En v8, los tres están presentes.

El badge de CI en el README es una señal visible para cualquier evaluador externo: el estado de los tests es público y actualizado en cada push. El tag `v0.2.2` permite fijar el submodule a una referencia estable sin depender de un commit hash. El CHANGELOG permite saber qué cambió entre versiones sin clonar el repositorio ni leer el log de commits.

Estos tres cambios no modificaron una línea de código funcional. Pero redujeron el riesgo de adopción de un proyecto externo de "depende de commits en main" a "tiene releases semánticos con CI verificado". Esa es la diferencia entre un proyecto que un tech lead puede aprobar como dependencia y uno que no puede.

### 2. CLAUDE.md automático: el archivo de contexto que nunca se configura

El problema de onboarding más frecuente en proyectos que adoptan Claude Code manualmente es que el CLAUDE.md se escribe una vez, se desactualiza, y los agentes pierden contexto sobre la estructura del proyecto. forge-init ahora genera un CLAUDE.md desde `project.yaml` con tabla de agentes, sus scopes, comandos relevantes y stack declarado.

El mecanismo técnico es importante: `generate-claude-md.py` se importa dinámicamente vía `importlib.util.spec_from_file_location`, lo que evita modificar `sys.path` y mantiene el módulo aislado. El flag `--force` bypasea el prompt interactivo para uso en CI o re-generaciones desde el CLI y la extensión VS Code.

El resultado práctico para un equipo que adopta forge: el día 1, Claude Code tiene un archivo de contexto con el roster de agentes, qué hace cada uno, y en qué paths opera. Sin intervención manual.

### 3. TUI de dos paneles: audit que enseña en vez de listar

El picker de oportunidades pasó de una lista numerada estática a un TUI interactivo de dos paneles: izquierda con navegación (↑↓, Space para seleccionar, `a` para todo), derecha con el detalle del ítem seleccionado (descripción, agentes que instala, trigger recomendado).

El cambio de paradigma es importante: antes, el audit listaba oportunidades y el usuario tenía que saber de antemano qué era `security-audit` o `wiki-ingest`. Ahora, el panel derecho describe el skill, qué problema resuelve, y cómo activarlo. El audit se vuelve un mecanismo de descubrimiento, no solo de inventario.

El fallback está bien diseñado: Windows, terminales < 60 columnas, y entornos no-TTY/CI reciben el picker simple original. La lógica de detección es explícita (`sys.stdout.isatty()`, `termios` availability, `shutil.get_terminal_size()`).

---

## Los 3 problemas más importantes que persisten

### 1. Test coverage gap: el código nuevo sin cobertura

El ciclo agregó ~750 líneas de código nuevo y cero tests nuevos. Las cuatro áreas sin cobertura:

**`_inject_scope()`** — modifica frontmatter YAML en texto plano. Los edge cases son numerosos: sin bloque YAML, con `scope:` ya existente, con `---` de cierre ausente, con indentación inconsistente. Una corrupción de frontmatter rompe el agente silenciosamente.

**`_generate_claude_md()`** — usa `importlib.util.spec_from_file_location` para importar un módulo por path. Si el path de `generate-claude-md.py` cambia (renombre, reorganización de directorio), falla con `AttributeError: module has no attribute 'generate_claude_md'`. No hay test que detecte esta rotura.

**`_generate_settings_json()`** — emite `.claude/settings.json` con `permissions.allow`. El contenido depende de `project.language` y del stack declarado. Si el YAML de configuración tiene un valor inesperado, puede emitir JSON con claves incorrectas o un archivo vacío.

**`_two_panel_opp_picker()`** — tiene tres paths: TUI completo, fallback simple, y modo no-interactivo. Solo el modo no-interactivo está implícitamente cubierto por los tests existentes del audit.

El patrón de solución ya existe en la suite: `test_forge_audit.py` verifica el contrato JSON de la salida del audit. El mismo patrón aplica a las otras tres funciones.

### 2. scope injection es una feature invisible para proyectos nuevos

La lógica de `_inject_scope()` está correctamente implementada. El problema es de flujo de usuario: `agent_paths` en `project.yaml.tpl` tiene todos los valores en `null`. El wizard no pregunta sobre paths durante la configuración. Cuando `forge-init` llama a `_get_agent_scope()` y obtiene `null` para todos los agentes, no inyecta scope y no informa al usuario que la feature existe.

El resultado: un equipo que instala forge v0.2.2 desde cero, sigue el wizard, y corre `forge-init` obtiene agentes sin scope. La feature está implementada pero inactiva para la mayoría de los nuevos proyectos. El costo de activarla (editar manualmente `agent_paths` en `project.yaml`) es bajo, pero el problema es que el usuario no sabe que tiene que hacerlo.

### 3. SendMessage: el riesgo central no resuelto

El agente `core/agents/orchestrator.md` usa `SendMessage({ to: "backend-engineer", message: "..." })` para delegar trabajo. Esta primitiva no aparece en la documentación pública de herramientas de Claude Code. El sistema documentado de Claude Code para invocar subagentes usa el tool `Agent` con `subagent_type`.

Si `SendMessage` es una convención que el modelo interpreta como texto natural, funciona hasta que un cambio de modelo o prompt cambia esa interpretación. Si es una API real no documentada, depende de que Anthropic no la modifique sin aviso. En ambos casos, el fallo es silencioso: el orchestrator simplemente no delega, sin error observable.

Este riesgo afecta el componente central del framework. Es el único problema del análisis que requiere verificación externa (abrir una sesión real de Claude Code y probar la primitiva) antes de poder cerrar o escalar.

---

## Score por dimensión

Escala 1-10. Comparación con v7.

| Dimensión | Score v7 | Score v8 | Δ | Justificación |
|-----------|:--------:|:--------:|:---:|---------------|
| **Instalación** | 8 | 9 | +1 | CLAUDE.md + settings.json + slash commands auto-instalados. Day-1 experience completa. |
| **Developer Experience** | 8 | 9 | +1 | TUI dos paneles, scope injection, slash commands contextuales, CLAUDE.md actualizable. |
| **Cobertura de stacks** | 8 | 8 | 0 | Sin profiles nuevos. |
| **CI/CD (del propio forge)** | 6 | 8 | +2 | GitHub Actions con matrix 3.9/3.11/3.12, badge público. |
| **Gobernanza** | 3.5 | 7.5 | +4 | CI + tags + CHANGELOG + versioning. Resta: Marketplace, maintainer único. |
| **Runtime agnosticismo** | 8 | 8 | 0 | Sin cambios en adapters. |
| **Extensibilidad** | 8 | 8.5 | +0.5 | VS Code: comando "Regenerar CLAUDE.md" en panel y CLI. |
| **Calidad de tests** | 8 | 7 | -1 | 464 tests sin cambio. Código creció 18%. Cuatro features sin cobertura. |

**Score global ponderado v8: 8.2/10** (v7: 7.0/10)

El +1.2 refleja principalmente el cierre de gobernanza. La caída en calidad de tests es la única regresión del ciclo.

---

## Veredicto diferenciado

**Para quién forge v0.2.2 tiene sentido claro:**
- Equipos que evaluaron forge en v7 y dudaron por la gobernanza informal: el obstáculo principal está cerrado
- Proyectos Claude Code que inician desde cero: el día 1 tienen CLAUDE.md, settings.json y slash commands funcionales sin intervención manual
- Equipos con stack cubierto por los 15 profiles y paths bien definidos: la scope injection por agente reduce el contexto irrelevante de forma significativa

**Para quién la adopción tiene condiciones:**
- Proyectos con stack no cubierto: el wizard ofrece scaffolding de profile Tier 2, pero el esfuerzo inicial es mayor
- Equipos que necesitan auditar el comportamiento del orchestrator antes de confiar en la delegación automática: el riesgo de SendMessage sigue sin verificación externa

**Condición técnica recomendada:**
```bash
git submodule add https://github.com/socialwebcl/forge .agentic
git -C .agentic checkout v0.2.2
```
Ya no es necesario fijar a un commit hash. El tag `v0.2.2` con CI verde es la referencia recomendada.

---

## Tabla comparativa del ciclo v7 → v8

| Área | v7 | v8 |
|------|----|----|
| GitHub Actions | Sin | ✅ matrix 3.9/3.11/3.12 |
| Tags semánticos | Sin | ✅ v0.2.2 |
| CHANGELOG | Sin | ✅ Keep a Changelog |
| CLAUDE.md en init | Manual | ✅ Auto-generado |
| settings.json | Sin | ✅ Por stack |
| Slash commands | 3 (wiki) | ✅ 6 (+ new-feature, deploy-check, review) |
| Scope por agente | Sin | ✅ Cuando agent_paths configurado |
| TUI audit | Lista numerada | ✅ Dos paneles navegables |
| Tests | 464 | 464 (sin cambio) |
| VS Code Marketplace | Sin publisher | Publisher agregado, sin publicar |
