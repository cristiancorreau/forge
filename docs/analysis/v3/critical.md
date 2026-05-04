# Análisis Crítico — forge v2.0

> Informe técnico independiente. Conclusión: **no se recomienda adoptar forge en proyectos reales**.
>
> Análisis realizado sobre el código fuente en `/Users/skauch/Developer/Github/forge`.
> Fecha: 2026-05-03.

---

## Resumen ejecutivo

forge es un framework de desarrollo con agentes IA que se instala como git submodule en proyectos de software. Genera definiciones de agentes para Claude Code, OpenCode y Kiro a partir de un archivo `project.yaml`, y provee un CLI interactivo en Python.

La premisa es válida: estandarizar cómo los equipos configuran y mantienen agentes IA. El problema es la ejecución. Tras analizar el código fuente completo —700 líneas de CLI, seis scripts, nueve profiles, doce skills, suite de tests y documentación— se identifican problemas estructurales que hacen de forge una apuesta de alto riesgo para cualquier proyecto real: acoplamiento irreversible a un vendor específico, fragilidad en la mecánica de instalación, un modelo de actualización propenso a conflictos silenciosos, y una propuesta de valor que asume premisas de uso que rara vez se cumplen en equipos reales.

---

## 1. Vendor lock-in de primera clase

### Claude Code es el único runtime de primer nivel

La documentación y el wizard presentan tres runtimes (Claude Code, OpenCode, Kiro), pero la realidad del código revela una asimetría severa.

El adapter de Claude Code (`adapters/claude-code/generate-claude-md.py`) genera CLAUDE.md completo con fases de sprint, estado, comandos y secciones de compliance. El adapter de OpenCode (`adapters/opencode/generate-agents-md.py`) genera únicamente un AGENTS.md con el roster. El adapter de Kiro genera cuatro archivos de steering con información genérica.

Ningún skill del framework está diseñado para funcionar fuera de Claude Code. El skill `browser-test` (SKILL.md) depende de `agent-browser`, un CLI externo que solo existe para Claude Code. El skill `wiki-ingest` instala slash commands en `.claude/commands/`, que es una carpeta propia de Claude Code. El skill `obsidian-sync` referencia la integración Local REST API de Obsidian, que solo Claude Code puede utilizar vía MCP.

En la práctica, adoptar forge es adoptar Claude Code. Migrar a otro runtime implica reescribir la integración desde cero.

### Acoplamiento a la API de Anthropic sin escape

El archivo `token-stats.py` hardcodea precios y nombres de modelos de Anthropic:

```python
PRICING = {
    "claude-sonnet-4-6": {"input": 3.00,  "output": 15.00, ...},
    "claude-opus-4-7":   {"input": 15.00, "output": 75.00, ...},
    "claude-haiku-4-5":  {"input": 0.80,  "output": 4.00,  ...},
}
```

El orchestrator en `core/agents/orchestrator.md` referencia directamente los tools `Agent`, `WebFetch` y `SendMessage`, que son extensiones propias de Claude Code no disponibles en otros runtimes. El campo `model` en el frontmatter de los agentes solo acepta `opus | sonnet | haiku`, valores específicos de Anthropic.

Si Anthropic cambia su estructura de precios, depreca un modelo, o modifica el protocolo de subagentes, el framework rompe sin aviso.

---

## 2. Mecánica de instalación frágil y opaca

### El sistema de tiers genera conflictos silenciosos

forge implementa tres niveles de agentes (Tier 1 core, Tier 2 profile, Tier 3 dominio). La resolución de prioridad está en `forge-init.py` líneas 183-210: primero se instalan los profiles (Tier 2), luego el core (Tier 1), sin sobreescribir lo existente.

El problema: si un proyecto activa el profile `hono-drizzle` que provee `api-engineer`, y también lista `api-engineer` en `agents.active`, el agente del profile "gana" silenciosamente. El usuario no recibe advertencia. El `forge-audit.py` no detecta esta ambigüedad como error, solo como "al día con forge".

```python
# forge-init.py líneas 200-210
core_only = [a for a in all_from_core if a not in profile_provided]
```

Cuando un equipo modifica un agente Tier 1 o Tier 2 (añadiendo contexto específico del proyecto), esa modificación queda marcada como "especialización intencional" por `forge-audit.py` si el archivo tiene más líneas que la versión de forge. Pero si la versión de forge es más larga (porque forge se actualizó), el sistema marca el agente del proyecto como "posiblemente desactualizado" y sugiere sobreescribirlo. El criterio es puramente basado en conteo de líneas y similitud de texto, no en semántica.

### La actualización del submodule es un proceso manual y de alto riesgo

La guía (`docs/guide.md`) documenta el proceso de actualización en cuatro pasos manuales con múltiples decisiones que el usuario debe tomar correctamente. Un `git -C .agentic pull origin main` silenciosamente actualiza todos los agentes core. Si después el usuario corre `forge-init.py --force`, sobreescribe todas las personalizaciones. No existe mecanismo de merge, diff semántico ni rollback automatizado.

La guía dice explícitamente: "NUNCA hacer `forge-init.py --force` sin revisar primero". Esto es una instrucción de cuidado que admite que la operación puede destruir trabajo.

### Instalación como git submodule duplica la superficie de conflictos

El README indica que forge se integra como `git submodule add https://github.com/socialwebcl/forge .agentic`. Los submodules de git son notoriamente problemáticos en equipos:

- Cada miembro debe ejecutar `git submodule update --init` al clonar.
- Los PRs que actualizan el submodule muestran solo un cambio de hash, sin contexto del diff real.
- El teardown requiere tres comandos manuales de git para desregistrar el submodule correctamente (documentados en `forge-teardown.py` líneas 141-146).

forge no ofrece alternativa de instalación sin submodule. No existe un package manager integration (pip, npm) que permita versionar forge como dependencia ordinaria.

---

## 3. Tests verdes pero cobertura incompleta

Los 290 tests pasan en 2.53 segundos. Pero la cobertura refleja las prioridades del autor, no las del usuario.

### Lo que no se testea

Los tests validan estructura (frontmatter correcto, secciones presentes, modelos válidos) y comportamiento mecánico (copiar archivos, generar YAML). No existe ningún test que valide:

- Que los agentes instalados funcionan efectivamente en Claude Code (no hay test de integración real).
- Que el wizard genera YAML sintácticamente correcto para todas las combinaciones posibles de stack (el wizard tiene 8 tipos de proyecto × 9 frontends × 9 backends × 9 bases de datos × 11 deploy targets = miles de combinaciones, ninguna testeada de extremo a extremo).
- Que `forge-audit.py` no produce falsos positivos cuando el proyecto tiene agentes Tier 3 con nombres que coinciden con agentes core.
- Que el pre-commit hook no rompe el flujo de commit en sistemas donde `docs/progress.html` no existe.

### Carga de módulos con sys.argv como antipatrón de test

El `conftest.py` usa `load_module()` que manipula `sys.argv` antes de importar los scripts:

```python
def load_module(script_path, module_name, argv=None):
    saved = sys.argv[:]
    sys.argv = argv if argv is not None else [str(script_path)]
    ...
    spec.loader.exec_module(mod)
    ...
    sys.argv = saved
```

Esto es una señal de diseño problemático: los scripts evalúan flags como `FORCE = "--force" in sys.argv` en tiempo de importación, no en tiempo de ejecución. Hace que testear combinaciones de flags requiera re-importar el módulo con argv distinto, lo que el conftest soluciona de forma frágil.

---

## 4. Complejidad de onboarding desproporcionada

### El wizard genera project.yaml pero no lo valida

El wizard interactivo (`forge-wizard.py`) guía al usuario a través de 10 pantallas de selección y genera un `project.yaml`. El YAML generado no se valida sintácticamente ni semánticamente antes de escribirse. `build_yaml()` (líneas 390-513) construye el YAML mediante f-strings con interpolación directa:

```python
return textwrap.dedent(f"""\
    # forge — project.yaml (modo startup)
    project:
      name: "{name}"
      slug: "{slug}"
      ...
```

Si el nombre del proyecto contiene comillas dobles, el YAML resultante es inválido. No hay sanitización.

### El CLI requiere terminal TTY interactiva

`forge.py` línea 958-960:

```python
if not IS_TTY:
    print("forge: terminal interactivo requerido.", file=sys.stderr)
    sys.exit(1)
```

No hay modo no-interactivo para automatización. Integrar forge en CI requiere llamar a los scripts individuales directamente, saltando el CLI completamente. La documentación no explica cuáles son las secuencias equivalentes script-a-script para cada flujo del wizard.

### El proceso de onboarding tiene siete pasos manuales para un proyecto nuevo

La `docs/guide.md` documenta Parte 1 con seis pasos que incluyen comandos de git submodule, edición manual de YAML, instalación de pip, copia y chmod de hooks, y audit manual. Para un equipo que nunca usó forge, esto es una tarde de configuración antes de poder escribir una línea de código.

---

## 5. Cobertura de profiles insuficiente para el mercado real

forge cubre nueve profiles: hono-drizzle, nextjs-admin, astro, fastapi, rails, nestjs, express, expo, playwright-crawler.

Stacks relevantes sin profile (sin agente especializado):

- **Django** (el framework Python más usado en producción)
- **Laravel / PHP**
- **Vue/Nuxt** (no hay profile, solo es opción en el wizard)
- **SvelteKit**
- **Remix**
- **Go (Gin/Echo/Fiber)**
- **Spring Boot**
- **Prisma ORM** (solo Drizzle está cubierto en hono-drizzle)
- **Monorepos con Turborepo** (estructura no contemplada en ningún profile)

El scaffold (`forge-scaffold-profile.py`) genera un agente con texto genérico que el usuario debe completar manualmente. La descripción autogenerada es idéntica para cualquier stack:

```python
desc_line = (
    description
    if description
    else f"Implementa el backend del proyecto usando {slug_title}. "
         "NO trabaja fuera del directorio definido en project.yaml."
)
```

No hay conocimiento del stack en el scaffold automático. Un `api-engineer` de Django generado por scaffold no sabe nada de Django.

---

## 6. Riesgos de mantenimiento a largo plazo

### Un solo maintainer sin señales de comunidad

El repositorio es `socialwebcl/forge`. El catálogo de `aitmpl-search.py` lista "socialwebcl/forge" como primer resultado. La guía está escrita en primera persona implícita del autor. No hay CONTRIBUTING.md, no hay issues públicos mencionados, no hay versioning semántico formal más allá de `VERSION = "2.0"` hardcodeado en `forge.py`.

Si el maintainer deja de actualizar forge, los proyectos que lo usan como submodule quedan congelados en esa versión o deben forkearlo, asumiendo el mantenimiento completo.

### Los precios de los modelos son datos perecederos

`token-stats.py` tiene precios hardcodeados. Anthropic ha cambiado precios históricamente. Cuando cambien, los reportes de costo del framework serán incorrectos silenciosamente.

### El estándar de agentes es un documento, no un contrato

`docs/agent-standard.md` define el estándar de frontmatter, secciones requeridas y convenciones de naming. Pero no existe una versión semántica de este estándar. Si el estándar evoluciona (por ejemplo, se agrega un campo obligatorio nuevo), no hay mecanismo de migración automática para proyectos existentes. `forge-audit.py` detectaría el gap, pero el fix sería manual en cada agente de cada proyecto.

---

## 7. Problemas de usabilidad específicos

### El TUI implementado en Python es frágil en entornos no-estándar

`forge.py` implementa un menú navegable con códigos ANSI directamente sobre `termios` y `tty`. Esto falla en:

- Terminales Windows (CMD, PowerShell sin modo ANSI)
- Conexiones SSH con `TERM=dumb`
- Entornos de CI donde stdout no es TTY (el script lo detecta y aborta)
- Terminales con anchura < 56 columnas (el header se corrompe)

### La eliminación del submodule no es completa

`forge-teardown.py` no elimina el submodule de git. La línea 141 detecta si `.agentic` aparece en `.gitmodules` y entonces imprime instrucciones manuales. No ejecuta los comandos. El usuario debe ejecutar tres comandos git adicionales para completar el teardown, que el script documenta pero no automatiza.

### El audit mide similitud de texto, no correctitud semántica

El umbral `SIMILARITY_WARN = 0.80` en `forge-audit.py` usa `SequenceMatcher.ratio()` para comparar el texto de los agentes. Un agente que fue reescrito con mejor contenido pero diferente redacción puede disparar una advertencia de "posiblemente desactualizado". Un agente con el texto correcto pero desordenado puede pasar como "al día".

---

## 8. La propuesta de valor asume premisas que rara vez se cumplen

forge está diseñado para equipos que:

1. Usan Claude Code como herramienta principal de desarrollo.
2. Trabajan con Spec-Driven Development (specs en `docs/specs/` antes de cada feature).
3. Tienen un equipo suficientemente grande para justificar el overhead del framework (el wizard distingue 1-2, 3-8, 9+ personas).
4. Mantienen `project.yaml` actualizado con cada cambio de stack, compliance y roster.

En la práctica:

- Claude Code es una herramienta de uso individual o de pares, no de equipos completos con agentes especializados corriendo en paralelo (el plan Pro tiene límite de 3 agentes simultáneos, documentado en `core/agents/orchestrator.md` línea 78).
- SDD es una disciplina de proceso que requiere adopción del equipo completo, no solo instalar un framework.
- El overhead de mantener `project.yaml` sincronizado se convierte en trabajo adicional que compite con el desarrollo.

---

## Conclusión

forge resuelve un problema real: hay fricción en configurar y mantener agentes IA en proyectos de software. Pero lo resuelve con un nivel de complejidad que supera el problema que intenta eliminar.

Los problemas estructurales identificados no son bugs menores. Son decisiones de diseño que generan riesgo acumulado:

- **Vendor lock-in irreversible** con Anthropic/Claude Code sin escape visible.
- **Mecánica de actualización destructiva** sin merge semántico ni rollback.
- **Instalación por submodule** que distribuye la complejidad de git entre todos los miembros del equipo.
- **Cobertura de profiles** que excluye la mayoría de stacks en uso real.
- **CLI no automatizable** que bloquea integración en pipelines.
- **Maintainability individual** sin señales de comunidad o gobernanza.

Para un equipo que ya usa Claude Code activamente y quiere estandarizar agentes, forge ofrece un punto de partida razonable. Para cualquier otro caso —equipos con stack variado, equipos que quieren portabilidad entre herramientas IA, proyectos con procesos de CI estrictos, o equipos que priorizan la independencia de vendor— el costo de adopción supera con creces el beneficio.

La recomendación es no usar forge. La alternativa más pragmática es definir directamente los archivos `.claude/agents/` del proyecto con el estándar de frontmatter que los agentes requieren, sin intermediario. El overhead es menor, el control es total, y el riesgo de lock-in es cero.
