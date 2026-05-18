# forge — Análisis técnico positivo v8

**Fecha:** 2026-05-05  
**Versión analizada:** forge v0.2.2  
**Metodología:** Lectura directa de código. Análisis independiente del crítico.  
**Métricas:** 1027+1003+1059+588+263 líneas Python · 1122 líneas TypeScript · 464 tests · 15 profiles · 6 slash commands

---

## Resumen ejecutivo

forge v0.2.2 establece dos cosas al mismo tiempo: la gobernanza mínima de un proyecto open source confiable y el mejor onboarding que el framework ha tenido. El día 1 de un equipo que adopta forge en v0.2.2 termina con un CLAUDE.md generado, un `.claude/settings.json` con permisos por stack, tres slash commands funcionales, y agentes con scope inyectado (cuando el proyecto tiene `agent_paths` configurado). Todo eso sin configuración manual.

Este análisis articula por qué ese conjunto de cambios, aunque no tan visible como un profile nuevo, tiene mayor impacto para la adopción que cualquier feature de la suite de análisis anterior.

---

## 1. El cierre de gobernanza: lo que desbloqueó

El repositorio tenía en v7 todos los atributos de calidad técnica: 464 tests, 15 profiles, adapters para 4 runtimes, extensión VS Code funcional. Lo que faltaba era visibilidad externa de esa calidad.

GitHub Actions con matrix Python 3.9/3.11/3.12 hace que el estado de los tests sea observable en cualquier momento sin clonar el repositorio. El badge en el README es la evidencia pública:

```
[![tests](https://github.com/socialwebcl/forge/actions/workflows/tests.yml/badge.svg)]
```

El tag `v0.2.2` convierte el submodule de "depende de commits en main" a "tiene releases semánticos". La diferencia para un team lead:

```bash
# v7 — pin a commit hash, frágil y sin contexto
git -C .agentic checkout abc1234

# v8 — pin a release con CI verificado
git -C .agentic checkout v0.2.2
```

El CHANGELOG estructura la información de cambios en un formato estándar. Un adoptador que actualiza el submodule puede leer `CHANGELOG.md` en vez de `git log` para entender qué cambió.

Estos tres cambios no modificaron funcionalidad. Pero redujeron el riesgo percibido de adopción de forma cuantificable.

---

## 2. CLAUDE.md automático: el problema de onboarding que nadie veía

Antes de v0.2.2, un equipo que instalaba forge obtenía agentes en `.claude/agents/` y una instrucción implícita de configurar un CLAUDE.md manualmente. El problema: CLAUDE.md es el archivo que Claude Code lee para entender el contexto del proyecto. Si está desactualizado o incompleto, el modelo trabaja sin el contexto que el framework prometía proveer.

En v0.2.2, `forge-init` genera un CLAUDE.md desde `project.yaml` con:
- Tabla de agentes activos con su rol y scope
- Stack del proyecto
- Comandos relevantes (slash commands, scripts)
- Instrucciones específicas del runtime (Claude Code)

El mecanismo técnico es limpio: `generate-claude-md.py` se importa dinámicamente vía `importlib.util` para mantener el módulo aislado. El flag `--force` permite re-generación sin prompt interactivo desde CLI, extensión VS Code, o CI. La tabla de agentes se genera desde `_AGENT_TRIGGER`, que mapea cada agente a su descripción, path, y trigger recomendado.

El comando "Regenerar CLAUDE.md" en el CLI y la extensión VS Code cierra el ciclo de vida: cuando el equipo agrega un profile nuevo o modifica `project.yaml`, puede regenerar el CLAUDE.md con un comando sin reinstalar todos los agentes.

---

## 3. settings.json por stack: permisos versionables desde el día 1

`.claude/settings.json` es el archivo de permisos que Claude Code usa para decidir qué Bash commands puede ejecutar sin confirmación explícita. En proyectos sin forge, este archivo se configura manualmente (o no se configura, lo que significa confirmación para cada comando).

forge v0.2.2 genera un `settings.json` con `permissions.allow` adaptado al stack del proyecto:

| Stack | Permisos generados |
|-------|-------------------|
| TypeScript/Node.js | `Bash(pnpm *)`, `Bash(npm *)`, `Bash(npx *)` |
| Python | `Bash(python3 *)`, `Bash(pip3 *)`, `Bash(pytest *)` |
| Ruby | `Bash(bundle *)`, `Bash(rails *)`, `Bash(rake *)` |
| PHP | `Bash(php *)`, `Bash(composer *)`, `Bash(artisan *)` |
| Go | `Bash(go *)` |

El archivo va a `.claude/` versionable. El equipo entero comparte los mismos permisos desde el primer `git pull`.

El beneficio es doble: reduce la fricción de permisos en el day-to-day del dev, y documenta en el repositorio qué herramientas usa el proyecto (lo que no es trivial en proyectos políglotas).

---

## 4. Slash commands integrados: instrucciones que no se olvidan

El comando `/new-feature`, `/deploy-check`, y `/review` son los tres flujos más repetidos en cualquier proyecto. En versiones anteriores, estos flujos existían como skills en `project.yaml` pero la forma de invocarlos desde Claude Code era recordar el nombre exacto o buscar en la documentación.

Con los slash commands instalados en `.claude/commands/`, el flujo está disponible desde el primer `/` en Claude Code con completado automático. El contenido de cada comando es instruccional:

- `/new-feature`: guía al modelo a crear la spec primero, luego implementar siguiendo SDD
- `/deploy-check`: checklist de pre-deploy con items específicos al stack
- `/review`: guía de revisión de código con foco en seguridad y coherencia con la arquitectura del proyecto

Los tres se instalan automáticamente en `forge-init`. Un equipo que no sabe que existen los descubre al tipear `/` en Claude Code. El descubrimiento es el onboarding.

---

## 5. TUI de dos paneles: audit como herramienta de aprendizaje

El rediseño del picker de oportunidades resuelve un problema de UX que el análisis previo identificó pero no cuantificó: un usuario que ve `[1] security-audit [Skill]` no sabe qué va a obtener si lo selecciona.

El nuevo TUI muestra el panel de detalle en tiempo real mientras el usuario navega:

```
┌─ Oportunidades ──────┐  ┌─ Detalle ─────────────────────────────────┐
│ ❯ ☐  [SKL] security-│  │  security-audit                            │
│   ☐  [SKL] wiki-ing │  │  Checklist de seguridad para endpoints,    │
│   ☐  [PRF] fastapi  │  │  auth y datos sensibles. Detecta           │
│   ☐  [PRF] nestjs   │  │  vulnerabilidades antes de cada PR.        │
│                     │  │  Agnóstico al stack.                        │
│                     │  │                                             │
│                     │  │  Agentes: security-auditor                  │
│                     │  │  Trigger: /review                           │
└─────────────────────┘  └────────────────────────────────────────────┘
  ↑↓ navegar   Espacio seleccionar   a todo/nada   Enter confirmar   q salir
```

El usuario que no sabe qué es `security-audit` lo descubre al navegar. El que sí lo sabe confirma rápidamente. La interfaz es informativa para el primero sin ser lenta para el segundo.

El fallback está bien pensado: Windows, terminales < 60 columnas, y entornos CI/no-TTY reciben el picker simple original. La detección usa `sys.stdout.isatty()`, `shutil.get_terminal_size()`, y un guard de `termios` con `try/import`.

---

## 6. scope injection: feature con valor real para proyectos estructurados

El campo `scope:` en el frontmatter de un agente de Claude Code le indica al modelo que ese agente opera sobre un directorio específico. forge v0.2.2 inyecta ese campo automáticamente desde `agent_paths` en `project.yaml`.

Para un proyecto con arquitectura clara:
```yaml
agent_paths:
  api: "packages/api"
  frontend: "packages/web"
  admin: "packages/admin"
```

El `api-engineer` instala con `scope: "packages/api"`, el `frontend-engineer` con `scope: "packages/web"`. Cuando Claude Code invoca un agente, carga solo el contexto del directorio declarado. Para proyectos monorepo con múltiples packages, esto reduce el contexto irrelevante de forma significativa.

La implementación es conservadora: si `agent_paths` no está configurado, no se inyecta scope. Si el agente ya tiene `scope:` en su frontmatter, no se sobreescribe. La función `_inject_scope()` respeta el estado existente del agente.

---

## 7. Estado del onboarding en v0.2.2

La experiencia de un desarrollador que instala forge por primera vez en v0.2.2:

| Paso | Experiencia en v7 | Experiencia en v8 |
|------|-------------------|-------------------|
| Instalar forge | `git submodule add` + pip | Igual |
| Correr wizard | 10 preguntas interactivas | Igual |
| Correr `forge-init` | Instala agentes | Instala agentes + genera CLAUDE.md + settings.json + slash commands |
| Abrir Claude Code | Sin contexto de agentes | CLAUDE.md con tabla de agentes y sus scopes |
| Tipear `/` | Sin autocompletado de forge | `/new-feature`, `/deploy-check`, `/review` disponibles |
| Correr audit | Lista de oportunidades | TUI navegable con detalle de cada oportunidad |

La diferencia no es en la instalación técnica (que era correcta desde v7) sino en lo que el desarrollador tiene disponible cuando abre Claude Code por primera vez. En v8, tiene contexto, permisos, y comandos desde el minuto uno.

---

## 8. Propuesta de valor actualizada

| Criterio de adopción | v7 | v8 |
|----------------------|----|----|
| Gobernanza para submodule externo | Riesgo (sin tags) | ✅ Tag v0.2.2 con CI |
| Contexto en Claude Code desde day 1 | Manual (CLAUDE.md) | ✅ Auto-generado |
| Permisos de runtime | Manual (settings.json) | ✅ Por stack |
| Flujos frecuentes disponibles | Skills en project.yaml | ✅ Slash commands con autocompletado |
| Audit informativo para nuevos usuarios | Lista de opciones | ✅ TUI con detalle navegable |

forge v0.2.2 es la versión del framework que un equipo puede recomendar a otro equipo con menos fricción de adopción que en cualquier versión anterior.
