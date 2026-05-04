# forge v2.0+ — Informe técnico para evaluación de adopción

**Fecha:** 2026-05-03  
**Versión analizada:** forge v2.0  
**Destinatario:** Tech lead evaluando adopción del framework para su equipo  
**Tiempo estimado de lectura:** 8 minutos

---

## Metodología

Este informe se basa en un análisis dual-agent independiente del código fuente actual del repositorio `socialwebcl/forge`. Dos instancias del mismo modelo recibieron instrucciones opuestas: la primera tenía mandato de identificar problemas, fricciones y riesgos de adopción; la segunda tenía mandato de articular el valor diferencial y el benchmark competitivo. Ninguna instancia vio el output de la otra antes de completar su análisis.

El análisis se basa en lectura directa de código (no de análisis previos), verificación de comandos documentados vs implementación real, y comparación del contenido de tests vs alcance de los componentes. No incluye ejecución en entorno real ni verificación de comportamiento agentic en runtime.

**Alcance verificado:** `forge.py` (997 líneas), `forge-wizard.py` (808 líneas), `forge-audit.py` (557 líneas), `forge-init.py` (453 líneas), `vscode-extension/` (624 líneas TypeScript), `adapters/` (4 adapters), `profiles/` (13 directorios), `tests/` (210 funciones, 358 casos tras parametrización), `docs/agent-standard.md`, `README.md`.

---

## Scoring por dimensión (escala 1-10)

| Dimensión | Score | Justificación |
|-----------|:-----:|---------------|
| **Instalación** | 4/10 | URL incorrecta en README, 9 pasos reales vs 3 declarados, sin instrucciones de `submodule update --init` para colaboradores nuevos. El wizard funciona bien una vez instalado. |
| **Developer Experience (DX)** | 6/10 | TUI con hints persistentes, navegación por flechas, pills categorizadas. Penalizado por incompatibilidad Windows sin advertencia y wizard sin modo batch completo. |
| **Cobertura de stacks** | 7/10 | 13 profiles con conocimiento específico verificado en código. Penalizado por cobertura no uniforme entre profiles (algunos tienen un agente, otros tres) y 4 profiles no documentados en agent-standard.md. |
| **CI/CD** | 5/10 | `forge-audit.py --json` con exit code 1 es integrable en CI. Penalizado porque el propio repositorio no tiene CI/CD (sin `.github/workflows/`), lo que debilita la confianza en la calidad continua. |
| **Gobernanza** | 3/10 | Maintainer único, sin releases semánticos, sin CHANGELOG, sin tags git, VERSION hardcodeada. Riesgo de continuidad real para adoptadores externos. |
| **Runtime agnosticismo** | 8/10 | 4 adapters (Claude Code, OpenCode, Kiro, Codex). Solo penalizado porque el adapter Codex no tiene tests y su convención `codex.md` no está verificada en la spec oficial. |
| **Extensibilidad** | 7/10 | Estructura clara para agregar profiles y skills. Tests automáticos validan profiles nuevos. Penalizado por catálogo MCP codificado en el script (sin mecanismo de actualización externo) y extensión VS Code no publicada. |

**Score global ponderado:** 5.7/10

La ponderación refleja que instalación y gobernanza tienen mayor peso para la decisión de adopción de un tech lead. Los scores de cobertura de stacks y runtime agnosticismo son reales y diferenciados frente a alternativas.

---

## Benchmark competitivo resumido

| Criterio | forge | .cursorrules | CLAUDE.md manual | aider | DIY .claude/agents |
|----------|:-----:|:------------:|:----------------:|:-----:|:------------------:|
| Multi-agente con roles | 5/5 | 1/5 | 2/5 | 1/5 | 4/5 |
| Profiles por stack | 5/5 | 1/5 | 1/5 | 1/5 | 3/5 |
| Audit / drift detection | 5/5 | 1/5 | 1/5 | 1/5 | 1/5 |
| Multi-runtime | 5/5 | 1/5 | 2/5 | 1/5 | 2/5 |
| Setup inicial (facilidad) | 4/5 | 5/5 | 3/5 | 4/5 | 2/5 |
| Compliance integrado | 4/5 | 1/5 | 2/5 | 1/5 | 3/5 |
| Control sobre el contexto | 4/5 | 4/5 | 5/5 | 4/5 | 5/5 |
| Catálogo MCP | 4/5 | 1/5 | 1/5 | 1/5 | 1/5 |
| Curva de aprendizaje | 3/5 | 5/5 | 4/5 | 4/5 | 2/5 |
| CI/CD nativo | 4/5 | 1/5 | 1/5 | 2/5 | 1/5 |

forge es la única alternativa con audit de deriva, multi-runtime nativo y profiles de stack curados. El costo es una curva de aprendizaje mayor y una dependencia de submodule externo.

---

## Recomendaciones accionables

### P0 — Bloqueantes para adopción amplia (resolver antes de cualquier promoción pública)

**P0.1 — Corregir incompatibilidad Windows**  
Agregar guard en `forge.py` y `forge-wizard.py` antes de las importaciones `termios`/`tty`:
```python
import sys
if sys.platform == 'win32':
    sys.exit("forge requiere macOS o Linux. En Windows, usar WSL2.")
```
Y reemplazar `pbcopy`/`open` con alternativas multiplataforma o condicionales de plataforma. Documentar el requisito de SO en el README.

**P0.2 — Corregir URL del submodule en README**  
Cambiar `socialweb-cl/forge` por `socialwebcl/forge` (sin guión). Agregar paso de `git submodule update --init --recursive` para el flujo de clonación de un repositorio existente.

**P0.3 — Definir estado de la extensión VS Code**  
Opción A: publicar en Marketplace (requiere agregar campo `publisher`, crear cuenta en VS Code Marketplace, ejecutar `vsce publish`). Opción B: agregar instrucciones de instalación local (`npm install && npm run compile && code --install-extension forge-agent-framework-*.vsix`) en el README. Opción C: mover `vscode-extension/` a una rama separada y marcarlo como WIP. No dejarlo en estado actual (código presente, completamente inaccesible).

### P1 — Mejoras de calidad significativas (resolver en el siguiente ciclo)

**P1.1 — Documentar los 4 profiles faltantes en agent-standard.md**  
Agregar `django`, `go-gin`, `sveltekit` y `vuenuxt` a la tabla de Tier 2. Baja fricción, alto impacto en la confianza del adoptador.

**P1.2 — Agregar CI/CD básico al repositorio**  
Un workflow de GitHub Actions que ejecute `pytest` en cada push es suficiente para dar confianza de calidad continua. El repositorio no puede promover CI/CD como feature de sus proyectos adoptadores sin tenerlo internamente.

**P1.3 — Agregar tests al adapter Codex**  
Los adapters OpenCode y Kiro tienen 16 y 11 tests respectivamente. El adapter Codex tiene cero. Agregar tests equivalentes.

**P1.4 — Limpiar referencias a aitmpl.com**  
Actualizar el screenshot en el README, la tabla de scripts, y `core/skills/aitmpl-search/SKILL.md` para reflejar que la búsqueda es offline. El dominio fue removido del código pero permanece en tres lugares de documentación.

### P2 — Mejoras de gobernanza (recomendadas para adopción sostenible)

**P2.1 — Implementar releases semánticos**  
Crear primer tag `v2.0.0`, agregar CHANGELOG, y comprometerse a versionar breaking changes. Los adoptadores que usan forge como submodule necesitan poder fijar una versión.

**P2.2 — Verificar convención `codex.md` con Codex CLI**  
Probar en un entorno Codex CLI real si el archivo es consumido por defecto. Si no lo es, actualizar la docstring del adapter para reflejar su rol real (instrucciones de referencia, no configuración nativa).

**P2.3 — Modo no-interactivo para el wizard**  
Agregar soporte para flags que permitan un `project.yaml` completo sin interacción:  
`forge-wizard.py --name "Mi Proyecto" --stack nextjs --backend fastapi --db postgres --deploy vercel --mode startup`  
Útil para scripts de onboarding de equipo y CI de templates.

---

## Conclusión para el tech lead

forge tiene valor diferencial demostrado en tres áreas donde ninguna alternativa libre compite: profiles de stack con conocimiento específico codificado, audit de deriva integrable en CI, y soporte nativo para cuatro runtimes (Claude Code, OpenCode, Kiro, Codex). Para un equipo de 2-8 personas trabajando en macOS/Linux con un stack cubierto, la adopción tiene sentido con la condición de que el equipo resuelva la deuda P0 antes del onboarding de nuevos colaboradores.

La gobernanza es el riesgo de mayor plazo: depender de un submodule sin releases semánticos ni CI/CD propio implica que cualquier cambio upstream puede afectar la configuración de agentes del proyecto sin aviso. Un equipo que adopte forge debería fijar el submodule a un commit específico (no a `main`) hasta que existan tags semánticos.
