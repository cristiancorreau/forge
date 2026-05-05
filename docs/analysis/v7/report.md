# forge v2.0.2 — Informe técnico para evaluación de adopción (v7)

**Fecha:** 2026-05-04  
**Versión analizada:** forge v2.0.2  
**Destinatario:** Tech lead evaluando adopción del framework para su equipo  
**Tiempo estimado de lectura:** 7 minutos

---

## Metodología

Análisis dual-agent del código fuente actual de `socialwebcl/forge`. Dos instancias recibieron instrucciones opuestas: identificar problemas vs articular valor diferencial. La síntesis es neutral. Se verificó cada claim directamente en el código — no en documentación ni en análisis previos.

**Alcance verificado:** forge.py (1013 líneas), forge-wizard.py (886), forge-audit.py (855), forge-init.py (472), extension.ts (1071), 15 profiles en `profiles/`, `tests/` (464 tests en 11 archivos), docs/, adapters/.

---

## Estado actual vs análisis v5

El análisis v5 identificó tres problemas P0 (bloqueantes para adopción amplia) y cuatro P1 (mejoras significativas). Todos han sido resueltos en v2.0.2.

| Problema v5 | Estado en v7 |
|-------------|-------------|
| Windows: `ModuleNotFoundError` sin contexto | ✅ Mensaje orientativo, `sys.exit` limpio |
| URL submodule incorrecta en README | ✅ `socialwebcl/forge` en todos los archivos |
| VS Code extension: inaccesible | ✅ Documentada, instalable vía VSIX |
| JSON `summary` ausente (CI falsa seguridad) | ✅ Campo presente, verificado por tests |
| `--forge` y `--only` sin implementar | ✅ Implementados en forge-audit.py |
| 4 profiles sin documentación | ✅ 15/15 en agent-standard.md |
| codex.md convención no verificada | ✅ Eliminado, adapter simplificado |
| References a aitmpl.com | ✅ Cero ocurrencias en código activo |

forge v2.0.2 es la primera versión sin bugs P0 verificados.

---

## Scoring por dimensión (escala 1-10)

| Dimensión | Score | Justificación |
|-----------|:-----:|---------------|
| **Instalación** | 8/10 | URL correcta, instrucciones completas, mensaje de Windows. Resta: VS Code aún requiere VSIX manual. |
| **Developer Experience** | 8/10 | Audit UI rediseñado, filtrado por stack, opportunity picker. Resta: wizard solo interactivo, no hay batch mode. |
| **Cobertura de stacks** | 8/10 | 15 profiles todos documentados. Resta: Divi/Elementor con riesgo de obsolescencia rápida. |
| **Integración CI/CD** | 6/10 | `--json` con `summary` funcional, exit code 1. Resta: el propio forge no tiene CI. |
| **Gobernanza** | 3.5/10 | Maintainer único, sin tags git, sin CHANGELOG, sin GitHub Actions. |
| **Runtime agnosticismo** | 8/10 | 4 adapters con tests. Leve incertidumbre sobre `SendMessage` como API real de Claude Code. |
| **Extensibilidad** | 8/10 | VS Code documentada, forge-add-opportunities.py, filtrado configurable. |
| **Calidad de tests** | 8/10 | 464 tests, contratos JSON verificados, platform compat cubierta. |

**Score global ponderado: 7.0/10**

---

## Recomendaciones accionables

### P1 — Mejoras de mayor impacto para el próximo ciclo

**P1.1 — GitHub Actions básico**  
El repositorio promueve integración CI en proyectos adoptadores pero no tiene CI propio. Un workflow mínimo:
```yaml
name: tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install pyyaml pytest
      - run: pytest tests/ -q
```
Esto da confianza de calidad continua sin inversión significativa.

**P1.2 — Primer tag semántico `v2.0.2`**  
```bash
git tag -a v2.0.2 -m "forge v2.0.2: 15 profiles, Windows compat, VS Code documented"
git push origin v2.0.2
```
Los adoptadores que fijan el submodule a un tag en vez de `main` tienen estabilidad garantizada.

**P1.3 — Publisher en package.json de la extensión**  
Agregar `"publisher": "socialwebcl"` en `vscode-extension/package.json` y publicar en el VS Code Marketplace. La extensión tiene funcionalidad completa; la barrera es solo administrativa. Publicarla en el Marketplace multiplica el alcance sin cambios de código.

**P1.4 — Verificar SendMessage en orchestrator**  
Probar en una sesión real de Claude Code si `SendMessage({ to: "backend-engineer", message: "..." })` es interpretado por el runtime como coordinación de agentes. Si es convención de texto (no API real), documentarlo como tal y agregar una nota en el agente. Si es una API real de Claude Code, agregar referencia a la documentación oficial.

### P2 — Mejoras de gobernanza a mediano plazo

**P2.1 — CHANGELOG**  
Un archivo `CHANGELOG.md` con las novedades de v2.0.2 respecto a v2.0 permite a adoptadores saber qué cambió sin leer el log de commits.

**P2.2 — Mecanismo de actualización para profiles de terceros**  
Los agentes `divi-engineer.md` y `elementor-engineer.md` documentan APIs que cambiarán. Una fecha de "última verificación" en el frontmatter (`last_verified: "2026-05"`) y un check en `forge-audit.py` que avise cuando el campo es antiguo daría visibilidad al problema sin resolverlo completamente.

**P2.3 — Modo no-interactivo completo para wizard**  
```bash
python3 .agentic/scripts/forge-wizard.py \
  --name "Mi Proyecto" --backend laravel --frontend none \
  --mode standard --tool claude-code --output project.yaml
```
Permite scripts de setup de equipo y CI de templates sin interacción.

---

## Benchmark vs alternativas — actualizaciones v7

| Criterio | forge v7 | .cursorrules | CLAUDE.md manual | aider | DIY .claude/agents |
|----------|:--------:|:------------:|:----------------:|:-----:|:------------------:|
| Multi-agente con roles | **5** | 1 | 2 | 1 | 4 |
| Profiles por stack (15) | **5** | 1 | 1 | 1 | 3 |
| Audit / drift detection | **5** | 1 | 1 | 1 | 1 |
| Multi-runtime | **5** | 1 | 2 | 1 | 2 |
| Compliance integrado | **4** | 1 | 2 | 1 | 3 |
| Setup inicial (facilidad) | 4 | **5** | 3 | 4 | 2 |
| VS Code integración | 4 | 3 | 1 | 2 | 1 |
| Control sobre el contexto | 4 | 4 | **5** | 4 | **5** |
| Curva de aprendizaje | 3 | **5** | 4 | 4 | 2 |
| CI/CD nativo | **4** | 1 | 1 | 2 | 1 |

La tabla es casi idéntica a v5. forge sigue liderando en los criterios de valor diferencial. La mejora más notable de v7 en el benchmark es VS Code integración (de 2 a 4), que refleja la extensión ahora documentada e instalable.

---

## Conclusión para el tech lead

**Si tu equipo ya usa Claude Code en macOS/Linux y tiene un stack cubierto por los 15 profiles:**
La adopción de forge tiene sentido en v7. El path de onboarding está libre de bugs bloqueantes, la documentación es completa, y el audit JSON es confiable. El riesgo principal es la gobernanza (fijar el submodule a un commit o tag específico mitiga el 80% de ese riesgo).

**Si estás evaluando por primera vez:**
El costo de evaluación es bajo: `git submodule add`, instalar pyyaml, correr el wizard en un proyecto de prueba. El wizard guía el resto. El audit en un proyecto existente da información útil en menos de 5 minutos.

**Condición técnica recomendada para adopción:**
```bash
# Fijar a commit específico, no seguir main
git submodule add https://github.com/socialwebcl/forge .agentic
git -C .agentic checkout <commit-hash>
```
Hasta que existan releases semánticos con tags, esta es la forma más segura de usar forge como dependencia de producción.
