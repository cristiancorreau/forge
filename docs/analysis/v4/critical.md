# forge v2.0 — Análisis crítico independiente

> Análisis basado exclusivamente en el código fuente actual del repositorio.
> Fecha: 2026-05-03. Versión analizada: forge v2.0, 44 commits, single maintainer.

---

## Resumen ejecutivo

forge es un framework de desarrollo con agentes IA que, en su versión 2.0, ha madurado considerablemente: 358 tests, 13 profiles, modo CI y un CLI navegable. Sin embargo, bajo esa capa de pulimento persisten cuatro problemas estructurales que hacen que el proyecto no sea recomendable para adopción en equipos reales.

El primer problema es el vendor lock-in con Claude Code de Anthropic. Aunque el README declara que forge es "agnóstico al runtime", el agente central del sistema (`orchestrator.md`) utiliza APIs privadas de Claude Code —`Agent()`, `subagent_type`, `run_in_background`, `SendMessage`, `isolation: worktree`— que no existen en OpenCode ni Kiro. Todos los profiles y agentes core también hacen referencia explícita a `CLAUDE.md` como fuente de verdad del proyecto. La promesa de agnosticismo es nominal.

El segundo problema son múltiples inconsistencias entre la documentación y el código que, en producción, causarían fallos silenciosos. La más grave: el contrato JSON de `forge-audit.py --json` no tiene campo `summary`, pero todos los ejemplos de CI en `README.md`, `docs/guide.md` y `forge.py` usan `jq '.summary.errors == 0'` —un comando que siempre devolvería `null` y nunca fallaría el pipeline aunque haya errores críticos. Adicionalmente, `docs/guide.md` documenta una flag `--forge .agentic` que el script no implementa, y el menú del CLI ofrece "auditar agente específico (--only)" que `forge-audit.py` no acepta.

El tercer problema es que el modelo de instalación como git submodule introduce fricción operativa significativa para cualquier equipo que no sea ya avanzado en Git. El proceso de actualización de forge implica coordinar bumps de submodule, auditorías previas y merges selectivos por agente —un flujo que la guía describe en 6 pasos y que no tiene ningún mecanismo de automatización.

El cuarto problema es de gobernanza: el proyecto tiene un único maintainer (44 commits, 100% del autor `Cristian Correa`) con cero PRs externos visibles. Para un framework que gestiona la configuración de agentes de producción, esto representa un riesgo de bus factor 1 que ningún equipo empresarial debería ignorar.

La conclusión es que forge resuelve bien un problema específico de un equipo específico, pero no está en condiciones de ser adoptado por equipos externos sin asumir riesgos operativos y de mantenimiento que el framework no mitiga.

---

## Análisis por área

### 1. Vendor lock-in con Claude Code

El lock-in no se ha resuelto con la adición de adapters para OpenCode y Kiro. El problema está en el agente que orquesta todo el sistema.

`core/agents/orchestrator.md` (líneas 25-54) contiene código de llamada que es 100% específico de Claude Code:

```
Agent({
  subagent_type: "backend-engineer",
  isolation: "worktree",
  run_in_background: true
})
SendMessage({ to: "backend-engineer", message: "..." })
```

Estos no son conceptos genéricos de "multi-agentes": son las APIs del tool `Agent` de Claude Code y el tool `SendMessage` que solo existen en ese runtime. Si un equipo instala forge con `--tool opencode`, el orchestrator generado en `AGENTS.md` contendrá instrucciones que OpenCode nunca podrá ejecutar.

Adicionalmente, todos los agentes core y los 13 profiles hacen referencia a `CLAUDE.md` como contexto de proyecto (ej. `profiles/hono-drizzle/agents/api-engineer.md` línea 12, `profiles/django/agents/api-engineer.md` línea 12, `profiles/go-gin/agents/api-engineer.md` línea 13). Esto genera un acoplamiento implícito incluso en los adapters "agnósticos".

Los adapters de OpenCode y Kiro solo generan archivos de descripción de roster (AGENTS.md y steering files), no resuelven la brecha de comportamiento. Un equipo en OpenCode no tiene acceso al mecanismo de coordinación que el orchestrator asume.

### 2. Inconsistencias críticas entre documentación y código

**CI roto por diseño.** El contrato JSON de `forge-audit.py --json` (líneas 417-424) emite:
```json
{
  "project": "...",
  "agents": {...},
  "opportunities": [...],
  "orphans": [...]
}
```

No existe campo `summary`. Sin embargo, los siguientes archivos documentan la integración CI así:

- `README.md` línea 173: `jq -e '.summary.errors == 0'`
- `docs/guide.md` línea 332: `jq -e '.summary.errors == 0'`
- `forge.py` líneas 696 y 967: `jq '.summary'` y `jq '.summary.errors'`

Un pipeline de CI usando estos ejemplos nunca fallaría ante errores de auditoría, porque `.summary` devuelve `null` en jq sin error. Ningún test verifica la estructura del JSON de salida —`test_forge_audit.py` no tiene ningún test que ejercite `run_audit(as_json=True)`.

**Flag `--forge` inexistente.** `docs/guide.md` cita el flag `--forge .agentic` en cinco ocasiones (líneas 112, 146, 180, 205, 282). El script `forge-audit.py` no implementa ese flag; su `main()` solo procesa `--json` y usa autodiscovery del directorio forge. El comando documentado siempre ejecutará el audit sin ese parámetro, pero un usuario que copie el comando de la guía no recibirá ningún error —el flag se ignora silenciosamente.

**Opción "Agente específico" del menú.** `forge.py` línea 712 llama `forge-audit.py --only={agent}`. El script no implementa `--only` —ejecuta el audit completo. La opción del menú dice auditar "sin revisar el roster completo" y siempre hace lo contrario.

**Catálogo del CLI desactualizado.** `forge.py` línea 754 describe "9 profiles" cuando el repositorio tiene 13. `README.md` en la tabla Tier 2 no lista astro, django, vuenuxt, go-gin ni sveltekit. El scaffold menu (línea 807) solo menciona 4 profiles "disponibles hoy". La documentación describe un estado del proyecto anterior a las mejoras recientes.

**Template desactualizado.** `templates/project.yaml.tpl` (comentario junto a `profiles`) lista los profiles disponibles sin incluir los 4 nuevos.

### 3. Modelo de instalación como submodule

El README propone `git submodule add` como mecanismo de instalación. Esto introduce varios problemas prácticos para equipos reales:

- Cada desarrollador debe ejecutar `git submodule update --init` al clonar —un paso que los equipos olvidan con frecuencia y que genera errores difíciles de diagnosticar.
- Actualizar forge requiere un proceso de 6 pasos con auditoría previa y commits separados para el bump del submodule y los agentes actualizados (`docs/guide.md`, Parte 3). No hay script que automatice este flujo.
- Si el repositorio de forge cambia su URL o history, los proyectos que lo usan como submodule rompen. No hay versioning semántico ni releases etiquetados en el repositorio.
- `forge-teardown.py` intenta remover el submodule con `git rm --cached .agentic` y `git config --remove-section`, pero si el submodule ya fue removido manualmente, los comandos fallan silenciosamente (líneas 117-121: el error se ignora con `pass`).

Alternativas como un paquete pip o una descarga de release etiquetada eliminarían la mayoría de esta fricción, pero no existen.

### 4. Cobertura de casos de uso reales

Los tests (358 en total) son predominantemente estructurales: verifican que el frontmatter existe, que los campos son correctos, que el YAML generado contiene ciertos strings. No hay tests que simulen un flujo de trabajo real de un equipo.

Cobertura ausente:
- No hay tests para el contrato JSON del audit (el bug del `summary` no sería detectado).
- No hay tests end-to-end que ejerzan el flujo completo: wizard → init → audit → update.
- No hay tests que verifiquen que el orchestrator generado funciona en OpenCode o Kiro.
- Los 18 tests de `test_forge_init_integration.py` corren `forge-init.py` con subprocesos, pero verifican solo que los archivos se copian —no que los agentes instalados son correctamente interpretados por ningún runtime.

El framework tiene buena cobertura de su propia mecánica interna (copia de archivos, parsing de YAML, lógica del wizard), pero no valida el artefacto que produce en condiciones reales.

### 5. Escalabilidad en equipos y gobernanza

El modelo de "enterprise" de forge (9+ personas) agrega fases de sprint y agentes de compliance, pero no resuelve preguntas básicas de escalabilidad de equipos:

- ¿Cómo coordinan dos ingenieros del mismo equipo cuándo actualizar forge? No hay proceso documentado.
- ¿Cómo se propagan cambios en agentes core a 20 proyectos que usan forge como submodule? No hay mecanismo.
- La limitación de Claude Code Pro de "máximo 3 agentes simultáneos" está hardcodeada en `orchestrator.md` línea 79. El modo enterprise no cambia esto —es una limitación de la plataforma que forge no puede resolver.

El proyecto tiene un único maintainer. El `CONTRIBUTING.md` menciona "PRs bienvenidos" pero no hay evidencia de contribuciones externas. Para un framework que gestiona la configuración de agentes de producción en equipos enterprise, el bus factor 1 es un riesgo operativo real: si el maintainer deja de mantener forge, los proyectos que lo usan como submodule quedan con una dependencia no mantenida en su historial git.

### 6. Stacks no cubiertos por profiles

El wizard (`forge-wizard.py`) ofrece Laravel y Angular como opciones de stack (líneas 229, 240), pero no existen profiles para ellos. Un equipo que seleccione Laravel en el wizard recibirá `profiles: []` y la nota "No hay profile Tier 2 para esta combinación de stack" —después de haber pasado por 10 pantallas de selección. El mecanismo de scaffold (`forge-scaffold-profile.py`) existe pero requiere que el equipo cree el agente especializado desde cero, que es exactamente lo que forge debería evitar.

---

## Problemas persistentes vs. nuevos

**Persistentes (no resueltos por las mejoras v2.0):**
- Lock-in con Claude Code en el agente orchestrator (APIs `Agent()`, `SendMessage`, `run_in_background`)
- Modelo de instalación por submodule sin alternativa
- Bus factor 1 (single maintainer)
- Ausencia de tests para el contrato JSON de CI

**Nuevos o agravados por las mejoras:**
- La adición de 4 profiles nuevos amplió la brecha entre la documentación (que dice "9 profiles") y el código (que tiene 13). Esto ocurre en tres archivos diferentes: `forge.py`, `README.md`, y `templates/project.yaml.tpl`.
- El modo `--batch` y la integración CI se documentaron con ejemplos que usan `jq '.summary.errors'`, un campo que nunca existió en el JSON de salida.

---

## Riesgos de adopción

| Riesgo | Probabilidad | Impacto |
|--------|-------------|---------|
| CI pipeline de audit nunca falla (bug `.summary`) | Alta — el ejemplo está en README | Alto — falsa seguridad |
| Proyecto queda con submodule no mantenido | Media | Alto — deuda técnica permanente |
| Orchestrator incompatible fuera de Claude Code | Alta si el equipo usa otro runtime | Medio — workflow roto |
| Equipo copia comando `--forge .agentic` de la guía y no entiende por qué no hace lo esperado | Media | Bajo-Medio |
| Laravel/Angular seleccionados en wizard sin profile resultante | Media | Bajo — frustración, no falla |

---

## Conclusión: por qué no se recomienda forge

forge resuelve un problema real: estandarizar cómo los equipos configuran agentes IA en sus proyectos. La visión es correcta y el nivel de pulimento del CLI es notable para un proyecto de 44 commits.

Sin embargo, hay tres razones concretas por las que no se recomienda para proyectos reales hoy:

**Primero**, el bug del contrato JSON (`summary` inexistente) significa que cualquier equipo que implemente la integración CI documentada en README o guide.md tendrá un pipeline que nunca detecta problemas de auditoría, generando falsa seguridad. Este no es un problema teórico —está documentado como el caso de uso central para equipos enterprise.

**Segundo**, la promesa de agnosticismo de runtime es falsa en la práctica. El componente central del framework (`orchestrator`) usa APIs de Claude Code que no tienen equivalente en otros runtimes. Un equipo que adopte forge creyendo que puede migrar a OpenCode o Kiro en el futuro enfrentará una refactorización de su agente más crítico.

**Tercero**, adoptar forge como submodule introduce una dependencia de un proyecto con un único maintainer, sin releases semánticos, sin canal de soporte y sin comunidad de usuarios. La documentación para proyectos existentes y el proceso de actualización de forge son suficientemente complejos como para requerir conocimiento detallado del framework —conocimiento que el equipo adoptante debe adquirir y mantener en ausencia de la comunidad que normalmente lo haría.

Para equipos que quieran trabajar con agentes IA en Claude Code, el enfoque más pragmático sigue siendo mantener agentes propios en `.claude/agents/` directamente en el repositorio, con convenciones internas documentadas en el `CLAUDE.md` del proyecto —sin la capa de indirección que forge agrega y sin la fricción del submodule.
