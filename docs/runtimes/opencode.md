# Forge v2 en OpenCode

> **Status:** Soportado
> **Ultima revision:** 2026-05
> **Generator:** `npx @cristiancorreau/forge generate --runtime opencode`

---

## Que es OpenCode?

OpenCode es un agente de coding open-source para la terminal, compatible con Claude, GPT-4 y otros modelos via API. Usa `AGENTS.md` como contexto de sistema, de manera analoga a como Claude Code usa `CLAUDE.md`.

**Diferencia fundamental respecto a Claude Code:** OpenCode no tiene herramienta `Agent` ni soporte para subagentes paralelos. Todo el trabajo ocurre en una unica sesion secuencial. Esta es la diferencia de runtime mas importante al usar Forge en OpenCode.

---

## Instalacion

### Requisitos previos

```bash
# Instalar OpenCode
npm install -g opencode-ai   # o segun la instruccion oficial de opencode.ai
```

La CLI de forge corre con Node.js 20+ (sin dependencias de sistema adicionales).

### Generar AGENTS.md y los comandos Forge

```bash
# Desde la raiz del proyecto (requiere project.yaml)
npx @cristiancorreau/forge generate --runtime opencode
```

Esto genera `AGENTS.md` en la raiz del proyecto (con el roster de agentes, stack
del proyecto, reglas globales de seguridad y guardrails de compliance) e instala
los comandos de OpenCode en `.opencode/commands/`.

Los 6 comandos disponibles son:

| Comando | Descripcion |
|---------|-------------|
| `/session-start` | Inicializa sesion, detecta branch y estado del repo |
| `/plan` | Crea o revisa specs en `docs/specs/` (flujo SDD) |
| `/work` | Implementa una spec en modo serial |
| `/review` | Revision de codigo con veredicto vinculante |
| `/ship` | Pipeline de deploy con polling y smoke tests |
| `/session-close` | Cierra sesion con commit, daily note y PR |

### Configurar contexto automatico

Crear `.opencode/config.json` para que OpenCode cargue AGENTS.md en cada sesion:

```json
{
  "model": "claude-sonnet-4-5",
  "context": {
    "files": [
      "AGENTS.md",
      "project.yaml"
    ]
  }
}
```

---

## Diferencias respecto a Claude Code

### Comandos disponibles

| Comando Forge | Claude Code | OpenCode | Diferencias |
|---------------|-------------|----------|-------------|
| `/session-start` | No existe | Si | Exclusivo de OpenCode |
| `/plan` | No existe (SDD inline) | Si | Exclusivo de OpenCode |
| `/work` | `/new-feature` | Si | Logica diferente (ver seccion agent teams) |
| `/review` | `/review` | Si | Un solo paso en vez de multi-agente |
| `/ship` | `/deploy-check` | Si | Usa CLI (`vercel`, `railway`, `fly`) en vez de MCP Vercel |
| `/session-close` | No existe | Si | Exclusivo de OpenCode |
| `/wiki-ingest` | Si | No | Requiere Claude Code |
| `/wiki-query` | Si | No | Requiere Claude Code |
| `/wiki-lint` | Si | No | Requiere Claude Code |

### Agent teams — la diferencia mas importante

En **Claude Code**, `/work` (o la skill `new-feature`) delega la implementacion a un equipo de subagentes que corren en paralelo:

```
Orchestrator
├── backend-engineer  [worktree A, run_in_background: true]
├── frontend-engineer [worktree B, run_in_background: true]
└── test-engineer     [worktree C, run_in_background: true]
         ↓ (todos en paralelo, coordinados via SendMessage)
    merge + review
```

En **OpenCode**, el mismo comando `/work` ejecuta todo en serie dentro de la sesion actual. No hay subagentes, no hay paralelismo:

```
Sesion unica
  → [Backend] implementar endpoints
  → [Frontend] construir componentes UI
  → [Tests] escribir tests
  → verificar (lint + tests)
  → actualizar spec
```

**El modelo de orquestador cambia:** en OpenCode no hay un agente separado que coordina — el modelo adopta distintos roles en secuencia dentro de la misma sesion. El AGENTS.md describe el roster para que el modelo conozca el dominio de cada rol, pero no los spawna como procesos independientes.

**Workaround recomendado para features grandes:** en vez de una spec grande que en Claude Code se paralelizaria, dividir en specs atomicas y ejecutarlas en sesiones sucesivas:

```
# En vez de: una spec grande implementada por 3 agentes en paralelo
#            → en OpenCode tarda lo mismo pero con mas riesgo de contexto largo

# Preferir: specs atomicas en sesiones separadas
/plan fase1 "Endpoints de autenticacion"  → /work → /review → /ship
/plan fase2 "Componentes de login"         → /work → /review → /ship
/plan fase3 "Tests E2E del flujo"          → /work → /review → /ship
```

### Hooks

Claude Code tiene un sistema de hooks que interceptan herramientas en tiempo real:

| Hook Claude Code | Efecto | Equivalente en OpenCode |
|-----------------|--------|------------------------|
| `PreToolUse:Edit` — branch guard | Bloquea edicion en main antes de ejecutar la herramienta | Guardrail embebido en AGENTS.md **+ reforzado en commit** por `.githooks/pre-commit` |
| `PreToolUse:Bash` — debug detection | Detecta `console.log`/`print` antes del commit | Guardrail embebido en AGENTS.md **+ reforzado en commit** por `.githooks/pre-commit` |
| `PreToolUse:Bash` — produccion safety | Bloquea comandos destructivos sin confirmacion | **No existe.** Guardrail embebido en AGENTS.md |
| `Stop` — resumen de sesion | Al terminar la sesion, ejecuta script de persistencia | Reemplazado por el flujo `/session-close` |
| `pre-commit` git hook | Inyecta stats en progress.html | **Compatible.** El `.githooks/pre-commit` compartido (POSIX, sin Python) refuerza branch guard y debug detection en cada commit |

**Mecanismo alternativo:** `npx @cristiancorreau/forge generate --runtime opencode` incluye secciones de guardrail en el AGENTS.md generado y, además, escribe un git hook compartido `.githooks/pre-commit` (POSIX, sin Python) que refuerza branch guard y detección de debug en cada commit. Activarlo una vez con `git config core.hooksPath .githooks`. Esto convierte las reglas de hooks en instrucciones de sistema que el modelo sigue durante la sesion, respaldadas por el git hook. Ver `adapters/opencode/HOOKS.md` para el texto exacto de cada guardrail y como incluirlos.

La seguridad en OpenCode depende de que AGENTS.md este bien escrito y cargado en contexto — no de ejecucion automatica de scripts. Para proyectos con requerimientos de compliance estrictos, esta diferencia es relevante.

### Veredictos de /review

El sistema de veredictos `APPROVED / CHANGES_REQUESTED / BLOCKED` funciona identico en ambos runtimes. La diferencia es de implementacion:

| Aspecto | Claude Code | OpenCode |
|---------|-------------|----------|
| Quien revisa | Equipo de agentes (security-auditor, compliance-reviewer) en paralelo | El modelo en un unico paso cubriendo todas las dimensiones |
| Archivo de estado | `.claude/review-status.json` | `.opencode/review-status.json` |
| Veredicto vinculante | Si — `/ship` lo lee antes de deployar | Si — `/ship` lo lee antes de deployar |
| Compliance review | Solo en modo enterprise, via agente dedicado | Solo en modo enterprise, incluido en el paso unico |

El veredicto escrito en `.opencode/review-status.json` es leido por `/ship` para bloquear el deploy si no esta aprobado.

---

## Uso diario

Sesion tipica de trabajo con Forge en OpenCode:

```
1. INICIAR SESION
   /session-start
   → detecta branch actual, muestra contexto, recuerda reglas de sesion

2. PLANIFICAR (si es feature nueva)
   /plan fase1 "Nombre de la feature"
   → crea spec en docs/specs/, aplica Planner-Critic, marca como ready

3. IMPLEMENTAR
   /work
   → detecta la spec en estado ready, propone plan secuencial, implementa paso a paso

4. REVISAR
   /review
   → revision unica cubriendo seguridad, calidad, tests y compliance (modo enterprise)
   → produce veredicto APPROVED / CHANGES_REQUESTED / BLOCKED
   → guarda resultado en .opencode/review-status.json

5. DEPLOYAR (solo si veredicto es APPROVED)
   /ship
   → verifica review-status.json, git status, hace merge del PR si corresponde,
     triggearea el deploy via CLI, hace polling hasta READY, verifica runtime logs

6. CERRAR SESION
   /session-close
   → commitea cambios pendientes, genera daily note, actualiza RELEASE-NOTES.md,
     hace push y crea el PR en GitHub
```

---

## Limitaciones conocidas

- **Sin equipos de agentes paralelos.** OpenCode no tiene herramienta `Agent` ni `run_in_background`. Toda la implementacion es single-threaded dentro de la sesion activa. Para features grandes, dividir en specs atomicas.

- **Sin hooks PreToolUse/Stop.** Los guardrails de seguridad (branch guard, debug detection, produccion safety) se implementan como instrucciones en AGENTS.md, no como intercepcion automatica de herramientas. El cumplimiento depende del modelo siguiendo las instrucciones, no de ejecucion forzada de scripts.

- **Sin aislamiento via worktrees.** Claude Code puede asignar cada agente a un worktree git separado para evitar conflictos en trabajo paralelo. En OpenCode no aplica porque todo ocurre en un solo proceso.

- **Sin MCP Vercel.** `/ship` usa comandos CLI (`vercel deploy --prod`, `vercel inspect`, `vercel logs`) en vez de las herramientas MCP de Vercel disponibles en Claude Code. El resultado es equivalente pero requiere que el CLI del provider este instalado y autenticado.

- **Sin skills wiki.** Los comandos `/wiki-ingest`, `/wiki-query` y `/wiki-lint` son especificos de Claude Code. En OpenCode no hay equivalente.

- **Contexto largo en features grandes.** Al no haber paralelismo, implementar una feature compleja en una sola sesion puede alcanzar limites de contexto. Mitigacion: `/session-close` al final de cada etapa, reabrir con `/session-start` en la siguiente.
