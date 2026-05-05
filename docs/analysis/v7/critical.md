# forge — Análisis crítico independiente v7

**Fecha:** 2026-05-04  
**Versión analizada:** forge v2.0.2  
**Metodología:** Lectura directa de código. No se incorpora output de análisis previos.  
**Alcance:** forge.py (1013 líneas), forge-wizard.py (886), forge-audit.py (855), forge-init.py (472), extension.ts (1071), 15 profiles, 464 tests, docs/.

---

## Resumen ejecutivo

forge v2.0.2 ha cerrado sistemáticamente la deuda técnica identificada en análisis previos. La URL del submodule es correcta, el error de Windows tiene un mensaje orientativo en vez de un traceback críptico, la extensión VS Code está documentada e instalable, los 15 profiles están en la tabla de referencia, el adapter Codex eliminó el archivo de convención no verificada, el campo `summary` existe en el JSON de audit, y los flags `--forge` y `--only` están implementados. Esta es la primera versión del framework que no tiene bugs P0 verificados.

Lo que permanece son problemas de segunda categoría con impacto real pero no bloqueante: ausencia de CI/CD en el propio repositorio, extensión VS Code sin `publisher` ni acceso vía Marketplace, dependencia de `SendMessage` como API de coordinación de agentes sin verificación pública de que esa API exista en Claude Code, y gobernanza de maintainer único sin releases semánticos formales. Estos no detienen la adopción, pero generan incertidumbre sobre la continuidad del proyecto.

Los dos agregados más importantes de v2.0.2 —los profiles de Laravel y WordPress— merecen examen específico. La profundidad del profile de Laravel es genuina: el agente de migration-specialist cubre L6→L7→L8→L9→L10→L11→L12→L13 con breaking changes por versión. Pero la cobertura de WordPress sigue un patrón diferente: tres agentes para Divi, Elementor y FSE es un nivel de especialización por herramienta específica de proveedor que expone a forge a una deuda de mantenimiento cuando Divi actualiza su API o Elementor cambia sus hooks. El riesgo no es técnico, es de obsolescencia.

---

## Análisis por área

### 1. Problemas de v5 cerrados — verificación en código

La metodología requiere verificar cada claim en el código, no confiar en los commits.

**P0.1 — Windows**: `forge.py` líneas 19-21:
```python
if sys.platform == 'win32':
    print("forge requiere macOS o Linux. En Windows, usá WSL2: ...")
    sys.exit(1)
```
Confirmado. Ya no hay `ModuleNotFoundError` críptico.

**P0.2 — URL README**: `README.md` línea 81:
```
git submodule add https://github.com/socialwebcl/forge .agentic
```
Correcto. Sin guión.

**P0.3 — VS Code extension**: La extensión tiene sección completa en README con instrucciones de instalación vía VSIX. Instalable. El valor que antes era cero ahora es parcial — el usuario puede usarla, aunque con fricción (debe compilar o usar el VSIX manualmente).

**Bug JSON summary**: `forge-audit.py` líneas 589-601 emite `"summary": { "agents_total": ..., "ok": ..., "errors": ..., "orphans": ... }`. El campo existe. Los ejemplos del README son ahora funcionales.

**Flag `--forge`**: implementado en líneas 843-847 de `forge-audit.py`.
**Flag `--only`**: implementado en líneas 848-850.
**Profiles en agent-standard.md**: los 15 profiles están documentados, incluidos laravel y wordpress.
**`aitmpl.com`**: sin ocurrencias fuera de la carpeta `analysis/`.

Todos los P0 y P1.1/P1.4 confirmados cerrados.

---

### 2. La extensión VS Code: mejorada pero aún sin Marketplace

La extensión creció de 624 a 1071 líneas de TypeScript. Las adiciones más significativas:

- `showOpportunitiesPicker()`: QuickPick multi-select para seleccionar profiles/skills desde el panel de audit, llama a `forge-add-opportunities.py` para aplicar los cambios.
- `AuditOpportunity` interface con `type`, `slug`, `msg`, `fix` — estructura tipada para datos del audit.
- Vistas `forgeActionsView`, `forgeProjectView`, `forgeAgentsView` con `viewsWelcome` para estados vacíos.
- Estados `forge.installed` y `forge.active` gestionados via `setContext`.

Sin embargo, el campo `publisher` sigue ausente en `package.json`:
```json
{
  "name": "forge-agent-framework",
  "displayName": "forge — Agent Framework",
  "version": "0.1.2"
  // sin publisher
}
```

Esto significa que la extensión solo puede instalarse vía VSIX local. La documentación actualizada instrye al usuario a compilarla con `npx vsce package --no-dependencies && code --install-extension forge-agent-framework-0.1.2.vsix`. Esto es un paso más accesible que antes (antes no había documentación de instalación), pero sigue siendo una barrera real para cualquier dev que no maneja Node.js o no tiene vsce instalado.

El segundo problema de la extensión es de diseño: `forge.install` (el comando para instalar forge en un proyecto nuevo) abre una terminal y ejecuta:
```bash
git submodule add https://github.com/socialwebcl/forge .agentic
```
Si el usuario no tiene acceso de escritura al repositorio remoto o el submodule ya existe, la terminal muestra un error sin que la extensión lo capture ni maneje. La extensión no verifica el estado del proceso de instalación ni proporciona feedback dentro del panel de VS Code.

---

### 3. Profiles de Laravel y WordPress: valor y deuda

**Laravel** (`api-engineer`, `fullstack-engineer`, `migration-specialist`): el agente migration-specialist cubre la ruta completa L6→L13 con breaking changes específicos por salto de versión. Ejemplos reales del contenido:

- L6→L7: `Illuminate\Support\Str::orderedUuid()` reemplaza `Ramsey\Uuid`, nueva convención de guards en auth.
- L10→L11: eliminar use de `App\Http\Kernel` (reemplazado por bootstrap/app.php), actualizar `artisan route:cache`.
- L12→L13: soporte nativo de PHP 8.4, deprecación de `string backed enums`.

Este nivel de detalle es verificable en el código del agente y tiene valor real para un equipo que mantiene un proyecto Laravel legacy. Sin embargo, el contenido de este agente es el que más rápidamente quedará desactualizado: cada release de Laravel hace que parte de las instrucciones sean incorrectas para versiones posteriores. El agente no tiene mecanismo de actualización automática ni indicación de fecha de validez.

**WordPress** (`wp-engineer`, `divi-engineer`, `elementor-engineer`): la decisión de crear tres agentes separados para constructores de página es cuestionable desde el ángulo de mantenimiento. Divi cambia su API con cada versión mayor (el `ET_Builder_Module` tuvo breaking changes entre Divi 4 y Divi 5). Elementor Pro tiene un ciclo de actualizaciones agresivo. Estos agentes se vuelven incorrectos más rápido que los agentes de frameworks donde el autor controla la API (Laravel, Rails, FastAPI).

La especialización en herramientas de terceros de ciclo corto crea deuda de mantenimiento que el repositorio actualmente no tiene capacidad de cubrir (un maintainer, sin CI que detecte cuando el contenido queda obsoleto). El valor inicial es real; el valor en 12 meses es incierto.

---

### 4. Audit UI redesign: mejor UX, misma información

El rediseño del audit terminal agrupó los agentes OK en una línea por tier:
```
  ✓  backend-engineer  ·  orchestrator  ·  test-engineer
```
Esto reduce el scroll para proyectos saludables, lo cual es positivo. Los "opportunity cards" con descripción y trigger de cada skill también mejoran la UX.

El problema es más sutil: el filtrado de oportunidades por relevancia de stack (`_PROFILE_RELEVANCE`) depende de que el usuario haya completado los campos `stack.backend`, `stack.frontend`, `project.language`, o `project.type` en `project.yaml`. Si ninguno de esos campos está definido, el audit muestra **todos** los profiles como oportunidades. El comentario en el código dice:

```python
# Filtrar por relevancia solo si el proyecto declara info de stack
if has_stack_info and not _profile_is_relevant(profile_name, config):
    continue
```

Para un usuario que corrió el wizard y tiene stack declarado, el filtrado funciona bien. Para un usuario que tiene un `project.yaml` básico generado a mano o un proyecto en migración desde otro sistema, el audit sigue mostrando 15 profiles potencialmente irrelevantes.

---

### 5. Gobernanza: el riesgo pendiente de mayor plazo

El repositorio tiene 464 tests que pasan, CI local es sólido. Lo que falta:

- **Sin GitHub Actions**: no existe `.github/workflows/`. Los tests no se corren automáticamente ante cada push o PR. Un contribuidor externo que rompa un test puede no saberlo.
- **Sin releases semánticos**: la versión `2.0.2` está hardcodeada en `forge.py` línea 36 y en `vscode-extension/package.json`. No hay tags git (`git tag` retorna vacío). Los adoptadores que fijan el submodule a `main` reciben breaking changes sin advertencia.
- **Sin CHANGELOG**: no hay registro de qué cambió entre versiones. El historial de commits es la única fuente, pero no es accesible sin clonar el repositorio.
- **Un maintainer**: @socialwebcl. Los commits de los últimos 15 han sido todos del mismo autor. No hay proceso de handover documentado.
- **Autocatálogo**: `socialwebcl/forge` sigue siendo el primer resultado de `aitmpl-search.py --category framework`. Esto no es un bug sino una percepción de conflicto de interés en el propio catálogo de recomendaciones.

La combinación de tests sólidos sin CI externo es paradójica: la calidad del código es verificable localmente pero la confianza de calidad continua es invisible para adoptadores externos.

---

### 6. SendMessage: API sin verificación pública

El agente `core/agents/orchestrator.md` usa dos primitivas de coordinación:

```
subagent_type: "backend-engineer"
SendMessage({ to: "backend-engineer", message: "Tipos listos..." })
```

`subagent_type` está documentado en la API pública de Claude Code (la invocación del tool `Agent`). `SendMessage` como función de coordinación entre agentes en la misma sesión **no aparece en la documentación pública de Claude Code**. Esta función está referenciada en el contexto de la conversación de Claude Code, pero no en la especificación de herramientas del sistema de agentes.

Esto no significa que no funcione — puede ser una convención que Claude Code interpreta en contexto. Pero el riesgo es que si esa convención cambia o es removida silenciosamente por Anthropic, el orchestrator deja de coordinar agentes y el fallo es silencioso (el agente simplemente no delega, sin error visible).

---

## Tabla de riesgos actualizada

| Riesgo | Estado v5 | Estado v7 | Impacto |
|--------|-----------|-----------|---------|
| Windows sin WSL | Bloqueante | Cerrado | — |
| URL submodule incorrecta | Bug | Cerrado | — |
| Extensión VS Code inaccesible | Crítico | Parcial (VSIX, sin Marketplace) | Medio |
| codex.md convención no verificada | Medio | Cerrado (eliminado) | — |
| Profiles no documentados | Medio | Cerrado | — |
| JSON summary ausente | Alto (CI falsa seguridad) | Cerrado | — |
| Sin GitHub Actions | Medio | Persiste | Medio |
| Sin releases semánticos | Medio | Persiste | Medio-Alto |
| SendMessage API sin verificar | Desconocido | Persiste | Alto (silencioso) |
| Profiles WordPress/Divi obsolescencia | N/A | Nuevo | Medio |
| Maintainer único | Medio | Persiste | Alto (largo plazo) |

---

## Conclusión

forge v2.0.2 es la primera versión del framework sin bugs P0 verificados. El trabajo de los últimos ciclos fue predominantemente correctivo: cerrar deuda, documentar lo que existía, agregar tests donde faltaban. El resultado es un framework más confiable y accesible que en v5.

Los riesgos que persisten son de naturaleza diferente: no son errores de implementación sino decisiones de gobernanza. Un adoptador externo sigue dependiendo de un repositorio sin CI ni releases formales gestionado por un solo maintainer. El valor funcional del framework es genuino y verificable. La pregunta para el tech lead no es si forge funciona, sino si el equipo puede gestionar la dependencia en un submodule sin mecanismos formales de estabilidad.
