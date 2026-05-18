# forge v0.2.2 — Informe técnico para evaluación de adopción (v8)

**Fecha:** 2026-05-05  
**Versión analizada:** forge v0.2.2  
**Destinatario:** Tech lead evaluando adopción del framework para su equipo  
**Tiempo estimado de lectura:** 7 minutos

---

## Metodología

Análisis dual-agent del código fuente actual de `socialwebcl/forge`. Dos instancias recibieron instrucciones opuestas: identificar problemas vs articular valor diferencial. La síntesis es neutral. Se verificó cada claim directamente en el código — no en documentación ni en análisis previos.

**Alcance verificado:** forge.py (1027 líneas), forge-wizard.py (1003), forge-audit.py (1059), forge-init.py (588), generate-claude-md.py (263), extension.ts (1122), 15 profiles en `profiles/`, `tests/` (464 tests en 11 archivos), adapters/, `.github/workflows/tests.yml`.

---

## Estado actual vs análisis v7

El análisis v7 identificó cuatro problemas persistentes: ausencia de CI, sin tags semánticos, sin CHANGELOG, y la extensión VS Code sin publicar en el Marketplace. En v8, tres de los cuatro cerraron.

| Problema v7 | Estado en v8 |
|-------------|-------------|
| Sin GitHub Actions | ✅ `.github/workflows/tests.yml` con matrix Python 3.9/3.11/3.12 |
| Sin releases semánticos | ✅ Tag `v0.2.2` en el repositorio |
| Sin CHANGELOG | ✅ `CHANGELOG.md` con formato Keep a Changelog |
| Versioning inconsistente (2.0.2) | ✅ Corregido a 0.2.x semántico |
| Extensión VS Code sin Marketplace | Parcial — `publisher: "socialwebcl"` agregado, publicación pendiente |
| SendMessage sin verificación pública | Persiste |

El salto más importante del ciclo es de gobernanza, no de features. El repositorio pasó de tener gobernanza informal a tener los tres pilares básicos de un proyecto open source mantenible: CI automatizado, releases semánticos, y registro de cambios.

---

## Scoring por dimensión (escala 1-10)

| Dimensión | Score v7 | Score v8 | Δ | Justificación |
|-----------|:--------:|:--------:|:---:|---------------|
| **Instalación** | 8 | 9 | +1 | CLAUDE.md auto-generado, settings.json, slash commands instalados automáticamente. Onboarding completo desde el día 1. |
| **Developer Experience** | 8 | 9 | +1 | TUI de dos paneles en audit, scope injection por agente, slash commands contextuales. |
| **Cobertura de stacks** | 8 | 8 | 0 | Sin profiles nuevos. 15 profiles estables. |
| **CI/CD (del propio forge)** | 6 | 8 | +2 | GitHub Actions con matrix Python 3.9/3.11/3.12 corriendo los 464 tests automáticamente. |
| **Gobernanza** | 3.5 | 7.5 | +4 | CI + tags semánticos + CHANGELOG + versioning correcto. Publisher en package.json. Resta: Marketplace y maintainer único. |
| **Runtime agnosticismo** | 8 | 8 | 0 | Sin cambios en adapters. |
| **Extensibilidad** | 8 | 8.5 | +0.5 | VS Code: comando `forge: Regenerate CLAUDE.md` agregado. Extension.ts a 1122 líneas. |
| **Calidad de tests** | 8 | 7 | -1 | 464 tests (sin cambios). No se agregaron tests para scope injection, CLAUDE.md gen, settings.json, ni TUI de dos paneles. Regresión relativa: el código creció 18% pero los tests no. |

**Score global ponderado: 8.2/10** (v7: 7.0/10)

El salto de 1.2 puntos proviene casi exclusivamente del cierre de gobernanza (+4 en esa dimensión). La caída en calidad de tests (-1) modera el score y es la señal de alerta más importante del ciclo.

---

## Recomendaciones accionables

### P1 — Mejoras críticas para el próximo ciclo

**P1.1 — Tests para el código nuevo de v0.2.2**

El ciclo agregó cuatro funcionalidades significativas sin tests:
- `_inject_scope()`: lógica de frontmatter injection que puede romper archivos si el YAML es malformado
- `_generate_claude_md()`: importación dinámica vía `importlib.util` que falla silenciosamente si el path cambia
- `_generate_settings_json()`: generación de permissions que puede emitir JSON inválido
- `_two_panel_opp_picker()`: TUI que tiene paths condicionales complejos (fallback Windows, cols < 60, no-TTY)

El patrón "tests del contrato JSON" ya existe en la suite para el audit. El mismo patrón aplica: verificar que `_generate_settings_json()` emite JSON válido con las claves correctas para cada lenguaje, y que `_inject_scope()` no corrompe frontmatter con edge cases (sin YAML, con scope ya existente, sin `---` de cierre).

**P1.2 — Conectar wizard con agent_paths**

El campo `agent_paths` fue agregado a `project.yaml.tpl` con valores `null` por defecto. El wizard no pregunta sobre paths durante la configuración. El resultado: para la mayoría de los proyectos nuevos, `agent_paths` queda con todos los valores `null` y la feature de scope injection nunca se activa.

La conexión mínima es una pregunta al final del wizard: "¿Querés configurar paths por agente para activar scope injection? (y/n)". Si sí, una segunda pantalla con los 5 campos opcionales. Si no, continúa con null.

**P1.3 — Publicar extensión en VS Code Marketplace**

El campo `publisher: "socialwebcl"` ya está en `package.json`. El siguiente paso es exclusivamente administrativo:
```bash
npx vsce package
npx vsce publish
```
La extensión tiene funcionalidad completa. La barrera de instalación actual (compilar, VSIX, `code --install-extension`) desaparece con la publicación.

### P2 — Mejoras a mediano plazo

**P2.1 — Verificar SendMessage en orchestrator**

Probar en una sesión real de Claude Code si `SendMessage({ to: "backend-engineer", message: "..." })` es interpretado como API de coordinación de agentes o como texto natural. Si es convención de texto, documentarlo explícitamente en el agente. Si es API real, agregar referencia a la documentación oficial.

**P2.2 — Documentar agent_paths en el wizard y en docs**

El flujo de scope injection es valioso pero invisible. Un usuario que instala forge en un proyecto Next.js + Hono no sabe que puede hacer que el `api-engineer` solo opere sobre `packages/api/`. Agregar un párrafo en el README bajo "Sistema de agentes" y una mención en el output de `forge-init` cuando se detectan nulls en agent_paths.

---

## Benchmark vs alternativas — actualizaciones v8

| Criterio | forge v8 | .cursorrules | CLAUDE.md manual | aider | DIY .claude/agents |
|----------|:--------:|:------------:|:----------------:|:-----:|:------------------:|
| Multi-agente con roles | **5** | 1 | 2 | 1 | 4 |
| Profiles por stack (15) | **5** | 1 | 1 | 1 | 3 |
| Audit / drift detection | **5** | 1 | 1 | 1 | 1 |
| Multi-runtime | **5** | 1 | 2 | 1 | 2 |
| CLAUDE.md auto-generado | **5** | 1 | 3 | 1 | 2 |
| Slash commands integrados | **5** | 2 | 2 | 1 | 2 |
| Compliance integrado | **4** | 1 | 2 | 1 | 3 |
| Setup inicial (facilidad) | 4 | **5** | 3 | 4 | 2 |
| VS Code integración | 4 | 3 | 1 | 2 | 1 |
| Control sobre el contexto | 4 | 4 | **5** | 4 | **5** |
| Curva de aprendizaje | 3 | **5** | 4 | 4 | 2 |
| CI/CD nativo | **5** | 1 | 1 | 2 | 1 |

Las dos columnas nuevas —CLAUDE.md auto-generado y slash commands integrados— son áreas donde forge no tiene competencia directa. Un proyecto que instala forge en v0.2.2 obtiene un CLAUDE.md con tabla de agentes y sus scopes, tres slash commands funcionales (`/new-feature`, `/deploy-check`, `/review`), y un `.claude/settings.json` con permisos adecuados al stack, todo generado automáticamente en `forge-init`.

---

## Conclusión para el tech lead

**forge v0.2.2 resuelve el problema de gobernanza que hacía riesgosa la adopción externa.**

En v7, la recomendación era fijar el submodule a un commit específico porque `main` era inestable. En v8, la recomendación es fijar al tag `v0.2.2`:

```bash
git submodule add https://github.com/socialwebcl/forge .agentic
git -C .agentic checkout v0.2.2
```

El CI con badge público garantiza que el estado de los tests es visible y continuo. El CHANGELOG permite saber qué cambió entre versiones sin leer commits. El tag semántico es una referencia estable para dependencias.

**El riesgo principal que persiste** es la ausencia de tests para el código nuevo del ciclo. Las cuatro features nuevas (scope injection, CLAUDE.md gen, settings.json, TUI) no tienen cobertura. En el próximo pull, ese código puede romperse silenciosamente.

**Para equipos evaluando adopción:**
- Stack cubierto por los 15 profiles: adopción recomendada en v0.2.2
- Stack no cubierto: el CLI ofrece scaffolding de profile Tier 2 propio
- Windows sin WSL: no soportado
- Proyecto existente con agentes propios: correr audit antes de init para detectar conflictos
