[English](../en/runtimes/codex.md) · **Español**

# Forge v2 en Codex CLI

> **Status:** Soporte completo
> **Adapter:** `adapters/codex/`
> **Archivo de contexto:** `AGENTS.md` (raíz del repositorio)

---

## ¿Qué es Codex CLI?

Codex CLI es el agente de terminal de OpenAI. Funciona en modo full-auto: lee el contexto del proyecto desde `AGENTS.md` en la raíz del repositorio, ejecuta comandos de shell, edita archivos y puede completar tareas de desarrollo complejas sin intervención manual en cada paso.

A diferencia de Claude Code (que usa `.claude/` y slash commands), Codex no tiene un sistema de comandos registrables. La forma de darle instrucciones estructuradas es mediante plantillas de prompt que el usuario copia en la sesión.

---

## Instalación rápida

```bash
# Inicializar forge en el proyecto (genera project.yaml + agentes + hooks)
npx @cristiancorreau/forge init

# Generar la configuración nativa de Codex (AGENTS.md + .codex/)
npx @cristiancorreau/forge generate --runtime codex
```

`forge generate --runtime codex` lee `project.yaml` y produce:

- **[OK] AGENTS.md** — genera el archivo de contexto desde `project.yaml`
- **[OK] .codex/** — crea el directorio y la configuración (`codex.yaml`, hooks onStart/onFinish)

Al finalizar, commitear los archivos generados:

```bash
git add AGENTS.md .codex/
git commit -m 'chore(codex): initialize Forge v2 Codex adapter'
```

---

## Cómo funciona Forge en Codex

### AGENTS.md como memoria del agente

Codex CLI carga `AGENTS.md` desde la raíz del repositorio al inicio de cada sesión. Es el equivalente de `CLAUDE.md` en Claude Code, pero orientado a ejecución autónoma: incluye reglas de seguridad y límites de autonomía inline porque Codex no tiene un mecanismo de hooks que pueda bloquear acciones individuales.

Forge genera `AGENTS.md` con el comando CLI `npx @cristiancorreau/forge generate --runtime codex`, que lee `project.yaml` y produce:

- **Stack** — lenguaje, backend, frontend, base de datos, testing
- **Workflow SDD** — regla de spec antes que código, pasos de implementación
- **Reglas de seguridad** — prohibición de hardcoding de secrets, queries parametrizadas, sin force push a main
- **Límites de autonomía** — no eliminar archivos sin confirmación, correr tests antes de marcar completo
- **Roster de agentes** — agentes activos, de compliance y especializados del proyecto (con descripciones leídas desde `core/agents/` o `profiles/`)
- **Forge v2 Commands** — tabla de comandos disponibles con referencia a cada archivo de plantilla
- **Reglas de producción (pre-bash-check)** — lista de comandos bloqueados en contexto de producción
- **Branch guard** — instrucción de no editar código directamente en `main` o `master`

Para regenerar `AGENTS.md` después de cambiar `project.yaml`:

```bash
npx @cristiancorreau/forge generate --runtime codex
```

### Commands (plantillas de prompt, no slash commands)

Codex CLI no soporta slash commands. Forge provee plantillas de prompt en `adapters/codex/commands/` que el usuario copia al inicio de la sesión o cuando necesita ejecutar una acción específica.

| Comando | Archivo | Cuándo usarlo |
|---------|---------|---------------|
| `session-start` | `adapters/codex/commands/session-start.md` | Al iniciar cada sesión de trabajo |
| `plan` | `adapters/codex/commands/plan.md` | Antes de implementar — verifica o crea la spec |
| `work` | `adapters/codex/commands/work.md` | Implementar una feature con spec APPROVED |
| `review` | `adapters/codex/commands/review.md` | Revisar código o cambios antes del merge |
| `ship` | `adapters/codex/commands/ship.md` | Verificar que el proyecto está listo para deploy |
| `session-close` | `adapters/codex/commands/session-close.md` | Al cerrar cada sesión de trabajo |

**Cómo usarlos:** cada archivo tiene un frontmatter con `name`, `description` y `usage`, seguido de una sección `## Prompt para Codex`. Copiar el contenido de esa sección, reemplazar los placeholders entre corchetes (`[NOMBRE O RUTA A LA SPEC]`, etc.), y pegarlo en la sesión de Codex.

Ejemplo con `work.md`:

```
Implementa la siguiente feature: F2-08 — Codex CLI runtime docs

Sigue estos pasos en orden estricto:
1. Verificar spec aprobada
   - Lee docs/specs/F2-08-codex-runtime-docs.md
   ...
```

### Hooks (onStart / onFinish)

Codex CLI soporta tres eventos de hook configurables en `.codex/codex.yaml`:

| Hook | Equivalente en Claude Code | Cuándo corre |
|------|---------------------------|--------------|
| `onStart` | `UserPromptSubmit` / `SessionStart` | Al inicio de cada sesión |
| `onFinish` | `Stop` | Al finalizar la sesión |
| `onDiff` | (sin equivalente directo) | Cuando Codex aplica cambios al filesystem |

Forge configura `onStart` y `onFinish`. El `.codex/codex.yaml` generado por el setup:

```yaml
model: o4-mini  # cambiar según preferencia: o4-mini | o3 | gpt-4o

hooks:
  onStart:  bash .codex/forge-codex-start.sh
  onFinish: bash .codex/forge-codex-finish.sh
```

**forge-codex-start.sh** verifica al inicio de cada sesión:

1. git y node disponibles en PATH
2. Branch actual no es `main` ni `master` (warn si lo es)
3. Cambios sin commitear en el worktree (warn)
4. `project.yaml` existe (warn si no)
5. `project.yaml` tiene `project.name` y `project.mode` (warn si faltan)
6. Variables de entorno `PROD_*` / `PRODUCTION_*` activas (warn si hay)

Si todo está limpio, el hook no imprime nada. Si hay advertencias, las lista con etiquetas descriptivas. A diferencia de Claude Code, **el hook onStart no puede bloquear la sesión**: siempre termina con `exit 0`.

**forge-codex-finish.sh** corre al cerrar cada sesión:

1. Detecta archivos modificados o staged con `git diff`
2. Lee `project.yaml` para encontrar el comando de check configurado (`scripts.check`)
3. Si no hay comando configurado, auto-detecta por tipo de archivo:
   - TypeScript/TSX: `tsc --noEmit` (o `pnpm turbo typecheck` en monorepos)
   - Python: `python3 -m py_compile` por archivo
   - PHP: `composer validate`
   - Ruby: `bundle exec ruby -c`
4. Imprime el resultado del check en la terminal
5. Siempre termina con `exit 0`

---

## Diferencias críticas vs Claude Code

| Feature | Claude Code | Codex CLI |
|---------|-------------|-----------|
| Archivo de contexto | `CLAUDE.md` | `AGENTS.md` |
| Comandos | Slash commands (`/plan`, `/work`, etc.) | Plantillas de prompt en `adapters/codex/commands/` |
| Hook pre-acción | `PreToolUse` (puede bloquear) | No disponible |
| Hook post-acción | `PostToolUse` | No disponible |
| Hook de sesión | `UserPromptSubmit` / `Stop` por turno | `onStart` / `onFinish` por sesión |
| Hook de filesystem | No disponible | `onDiff` |
| Bloqueo por hook | Sí (`exit 2` detiene la sesión) | No (solo informacional, siempre `exit 0`) |
| Agentes paralelos | Subagentes con worktrees + `SendMessage` | Full-auto solo |
| Deploy con MCP | Herramientas MCP de Vercel | Comandos CLI (plantilla `ship.md`) |
| Branch guard | Hook `PreToolUse` bloquea edición en main | Instrucción en `AGENTS.md` (voluntaria) |
| Debug detection | Hook `Stop` revisa archivos automáticamente | `forge-codex-finish.sh` al cerrar sesión |
| Review status | `.claude/review-status.json` | No hay equivalente nativo |

---

## Uso diario

Flujo SDD recomendado para una sesión típica:

**1. Iniciar sesión** — pegar el prompt de `session-start.md`:

```
Inicia la sesión de trabajo. Ejecuta estos checks en orden y reporta el resultado:
1. Verificar herramientas disponibles...
```

Codex verifica branch, cambios sin commitear y `project.yaml`, luego reporta:

```
Sesión iniciada — Mi Proyecto
Branch: feature/auth-refresh-2026-05-17
Estado: limpio
Warnings: ninguno
```

**2. Planificar** — pegar el prompt de `plan.md` con el nombre de la feature:

```
Quiero planificar la siguiente feature: auth token refresh
```

Codex busca la spec en `docs/specs/`, la crea si no existe (estado `DRAFT`), o propone el plan de implementación si está `APPROVED`.

**3. Implementar** — pegar el prompt de `work.md` con la ruta a la spec:

```
Implementa la siguiente feature: docs/specs/F2-09-auth-token-refresh.md
```

Codex verifica que la spec esté en estado `APPROVED`, implementa en el orden correcto (schema → types → backend → frontend → tests), y actualiza la spec a `IMPLEMENTED` al terminar.

**4. Revisar** — pegar el prompt de `review.md`:

```
Revisa el siguiente código: cambios sin commitear actuales
```

Codex corre el checklist de seguridad y calidad, reporta bloqueantes, advertencias y sugerencias.

**5. Preparar deploy** — pegar el prompt de `ship.md`:

```
Prepara el proyecto para deploy en: staging
```

Codex verifica worktree limpio, corre tests y build, revisa variables de entorno y debug statements.

**6. Cerrar sesión** — pegar el prompt de `session-close.md`. Codex registra lo completado, lo pendiente y el estado final del repo.

---

## Limitaciones conocidas

- **Sin slash commands.** No hay mecanismo de comandos registrables. Las plantillas de prompt son el workaround: requieren acción manual del usuario (copiar y pegar).

- **Sin subagentes paralelos.** Codex opera en modo full-auto solo. El patrón de Forge de spawn de subagentes con worktrees y `SendMessage` es específico de Claude Code y no tiene equivalente en Codex CLI.

- **onStart no puede bloquear.** A diferencia del hook `UserPromptSubmit` de Claude Code (que puede terminar con `exit 2` para detener la sesión), el hook `onStart` de Codex siempre continúa independientemente del exit code. Las advertencias son informacionales.

- **onFinish corre por sesión, no por turno.** Claude Code ejecuta el hook `Stop` al finalizar cada turno del agente. Codex ejecuta `onFinish` una sola vez al cerrar la sesión completa, lo que reduce la granularidad de los checks post-acción.

- **Sin PreToolUse / PostToolUse.** Codex no puede interceptar herramientas individuales antes o después de ejecutarlas. Las reglas de seguridad (branch guard, pre-bash-check) están embebidas en `AGENTS.md` como instrucciones de texto. El agente debe respetarlas voluntariamente; no hay enforcement mecánico.

- **Sin review-status.json.** Claude Code mantiene `.claude/review-status.json` para trackear el estado de revisión entre sesiones. Codex no tiene un mecanismo equivalente nativo; el seguimiento debe hacerse en el frontmatter de las specs (`docs/specs/`).

---

## Seguridad

Codex CLI opera en full-auto mode: puede ejecutar comandos de shell, editar archivos y hacer commits sin confirmación por acción individual. En ausencia de `PreToolUse` hooks, **`AGENTS.md` es la única capa de enforcement activa**.

Las reglas de seguridad embebidas en `AGENTS.md` cubren:

- Prohibición de hardcodear tokens, passwords o secrets
- Queries SQL con parámetros preparados
- Sin PII en logs
- Verificación de autenticación y autorización en cada endpoint
- Sin force push a main/master
- Comandos destructivos de base de datos bloqueados en contexto de producción
- Branch guard: no editar código fuente directamente en `main` o `master`

**Para trabajo que toca producción**, usar el flag `--approval-mode suggest`:

```bash
codex --approval-mode suggest
```

En este modo, Codex propone cada acción y espera confirmación explícita antes de ejecutarla. Es el equivalente más cercano a la protección mecánica que provee el hook `PreToolUse` de Claude Code.

Si el proyecto tiene alto riesgo (base de datos de producción, datos de usuarios, sistemas de pago), considerar usar Claude Code como runtime principal, que sí puede bloquear comandos destructivos antes de ejecutarlos.
