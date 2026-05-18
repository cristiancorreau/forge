# forge v0.2.2 — Análisis técnico independiente v8

**Evaluación dual-agent · Mayo 2026**

---

## El problema: configurar equipos de agentes IA es no-trivial

Un dev que adopta Claude Code hoy tiene que resolver por su cuenta:

- ¿Qué agente opera sobre qué directorio del monorepo?
- ¿Cómo sé en 3 meses que mis agentes no se desviaron del estándar?
- ¿Qué permisos de Bash le doy a Claude Code para este proyecto?
- ¿Puedo fijar este framework como dependencia externa con estabilidad garantizada?

Sin una solución estructurada: cada equipo descubre esto por prueba y error.

---

## Lo que forge v0.2.2 provee

| Necesidad | Solución |
|-----------|----------|
| Agentes genéricos | 7 agentes Tier 1 + 15 profiles de stack |
| Sin contexto en Claude Code desde day 1 | CLAUDE.md auto-generado con tabla de agentes y scopes |
| Permisos manuales por proyecto | `.claude/settings.json` generado por stack |
| Comandos que nadie recuerda | `/new-feature`, `/deploy-check`, `/review` instalados automáticamente |
| Agentes sin scope de directorio | scope injection por agente desde `agent_paths` |
| Dependencia sin gobernanza | CI GitHub Actions + tag v0.2.2 + CHANGELOG |

---

## El cambio más importante: gobernanza

El repositorio pasó de "proyecto con calidad técnica privada" a "dependencia con estabilidad verificable":

| Indicador | v7 | v8 |
|-----------|:--:|:--:|
| GitHub Actions | Sin | ✅ matrix 3.9/3.11/3.12 |
| Tag semántico | Sin | ✅ v0.2.2 |
| CHANGELOG | Sin | ✅ Keep a Changelog |
| Badge CI en README | Sin | ✅ público |

```bash
# v7 — pin a commit hash frágil
git -C .agentic checkout abc1234

# v8 — pin a release con CI verificado
git -C .agentic checkout v0.2.2
```

---

## El onboarding en v0.2.2: antes vs después

**Después de `forge-init` en v7:**
```
.claude/agents/orchestrator.md
.claude/agents/backend-engineer.md
.claude/agents/test-engineer.md
```

**Después de `forge-init` en v8:**
```
.claude/agents/orchestrator.md       (con scope: "src/" inyectado)
.claude/agents/backend-engineer.md   (con scope: "packages/api" inyectado)
.claude/agents/test-engineer.md
CLAUDE.md                             (tabla de agentes, stack, comandos)
.claude/settings.json                 (permisos por stack)
.claude/commands/new-feature.md
.claude/commands/deploy-check.md
.claude/commands/review.md
```

El desarrollador abre Claude Code y tiene contexto, permisos y comandos desde el minuto uno.

---

## TUI de dos paneles en audit

**v7** — lista numerada estática:
```
  [1] security-audit [Skill]
  [2] wiki-ingest [Skill]
  [3] fastapi [Profile]
  Seleccioná [1-3]: _
```

**v8** — TUI navegable con detalle:
```
┌─ Oportunidades ──────┐  ┌─ Detalle ─────────────────────────────┐
│ ❯ ☐  [SKL] security-│  │  security-audit                        │
│   ☐  [SKL] wiki-ing │  │  Checklist de seguridad para           │
│   ☐  [PRF] fastapi  │  │  endpoints, auth y datos sensibles.    │
└─────────────────────┘  │  Detecta vulnerabilidades antes        │
  ↑↓ Espacio Enter        │  de cada PR. Agnóstico al stack.       │
                          └────────────────────────────────────────┘
```

El audit enseña mientras el usuario navega.

---

## Score v7 → v8

| Dimensión | v7 | v8 | Δ |
|-----------|:--:|:--:|:---:|
| Instalación | 8 | **9** | +1 |
| Developer Experience | 8 | **9** | +1 |
| Cobertura de stacks | 8 | 8 | 0 |
| CI/CD (propio forge) | 6 | **8** | +2 |
| Gobernanza | 3.5 | **7.5** | +4 |
| Runtime agnosticismo | 8 | 8 | 0 |
| Extensibilidad | 8 | 8.5 | +0.5 |
| Calidad de tests | 8 | **7** | -1 |
| **Global** | **7.0** | **8.2** | **+1.2** |

---

## Lo que falta

**Tests para código nuevo**: el ciclo agregó ~750 líneas sin tests nuevos. `_inject_scope()`, `_generate_claude_md()`, `_generate_settings_json()`, y el TUI de dos paneles no tienen cobertura. Los 464 tests siguen corriendo, pero el code ratio empeoró.

**scope injection invisible**: `agent_paths` en `project.yaml.tpl` tiene valores `null`. El wizard no pregunta. La feature existe pero está inactiva para la mayoría de proyectos nuevos.

**VS Code Marketplace**: `publisher: "socialwebcl"` fue agregado. El siguiente paso es `npx vsce publish`. La extensión tiene funcionalidad completa, la barrera es solo administrativa.

**SendMessage**: el orchestrator usa esta primitiva como API de coordinación. Cuatro ciclos sin verificación externa.

---

## Veredicto diferenciado

**Adoptar en v0.2.2 si:**
- Equipo de 2-8 personas, macOS/Linux
- Stack cubierto por alguno de los 15 profiles
- Proyecto que ya usa Claude Code y quiere day-1 context sin configuración manual
- Tech lead que evaluó en v7 y dudó por la gobernanza

**Condición técnica al adoptar:**
```bash
git submodule add https://github.com/socialwebcl/forge .agentic
git -C .agentic checkout v0.2.2
```

Ya no es necesario fijar a un commit hash.

---

Análisis completo: `docs/analysis/v8/` · forge v0.2.2 · Dual-agent methodology
