# forge — Análisis crítico independiente v5

**Fecha:** 2026-05-04  
**Analista:** Revisión independiente del código fuente actual  
**Metodología:** Lectura directa de código, no de análisis previos  
**Audiencia objetivo evaluada:** Desarrolladores que ya usan Claude/ChatGPT y se inician en Claude Code, OpenCode o Codex CLI

---

## Resumen ejecutivo

forge es un framework de configuración de agentes IA que se instala como git submodule y genera archivos de contexto para distintos runtimes de codificación agentic. Para el desarrollador que recién se inicia en Claude Code, el valor real del framework es cuestionable: la instalación requiere conocimiento previo de git submodules, Python 3.x con pyyaml, y comprensión del modelo de agentes de Claude Code antes de haber escrito una sola línea de código del proyecto. La curva de entrada contradice el perfil de usuario declarado.

Los componentes más nuevos —la extensión VS Code y el adapter Codex— son proyectos incompletos que el repositorio presenta como funcionalidades disponibles sin aclarar sus limitaciones. La extensión no está publicada en el marketplace, no tiene `publisher` declarado en `package.json`, y no hay documentación de instalación en ningún archivo del repositorio. El adapter Codex genera un archivo `codex.md` cuya convención no aparece documentada en la especificación oficial de OpenAI Codex CLI: el archivo existe, se genera correctamente, pero su utilidad real es incierta.

La documentación presenta inconsistencias concretas: cuatro de los trece profiles existentes (django, go-gin, sveltekit, vuenuxt) no aparecen en la tabla de referencia de `docs/agent-standard.md`. El README embebe un CLI screenshot con el texto "Buscar templates aitmpl.com" cuando el código actual hace búsqueda offline en un catálogo curado local. El CLI principal y el wizard usan `termios`/`tty` importados al nivel de módulo, lo que provoca `ImportError` inmediato en Windows sin ningún mensaje de error orientativo.

La gobernanza es de maintainer único sin releases semánticos formales, sin CHANGELOG y sin GitHub Actions. El repositorio autopropaganda su propio framework en el primer resultado del catálogo de búsqueda que el mismo CLI ofrece. Estos factores en conjunto hacen que forge represente una apuesta de adopción con riesgo moderado-alto para equipos que no tengan ya relación directa con el autor.

---

## Análisis por área

### 1. Complejidad de instalación para el usuario nuevo

El README describe el flujo de instalación como tres pasos, pero el paso uno esconde complejidad significativa:

```bash
git submodule add https://github.com/socialweb-cl/forge .agentic
```

**Problema 1 — URL incorrecta:** El remote real del repositorio es `https://github.com/socialwebcl/forge.git` (sin guión entre "socialweb" y "cl"). El README usa `socialweb-cl` (con guión). Un usuario que ejecute el comando del README sin verificar podría estar añadiendo un submodule apuntando a una URL que en ese momento podría no existir o pertenecer a otra cuenta.

**Problema 2 — Submodule no inicializado al clonar:** El README no incluye instrucciones para el escenario más frecuente después del setup inicial: clonar un proyecto que ya tiene forge como submodule. No hay mención de `git submodule update --init --recursive`, que es el comando necesario para que el submodule se materialice tras un `git clone` estándar. Un desarrollador nuevo que clone el repositorio del equipo verá `.agentic/` como directorio vacío y obtendrá un error críptico de Python al intentar ejecutar `forge.py`.

**Problema 3 — Incompatibilidad Windows sin advertencia:** `forge.py` importa `termios` y `tty` al nivel de módulo en las líneas 19-20. Estos módulos no existen en Windows. El resultado es `ModuleNotFoundError: No module named 'termios'` al ejecutar el CLI, sin ningún mensaje que oriente al usuario. El script `forge-wizard.py` tiene la misma importación en las líneas 17-18. Ningún archivo del repositorio documenta el requisito de sistema operativo Unix/macOS. Además, `forge.py` usa `pbcopy` (macOS) en línea 334 para copiar al portapapeles y `open` (macOS) en línea 562 para abrir URLs, sin alternativas para Linux.

**Pasos reales de instalación desde cero (no los 3 del README):**
1. Entender qué es un git submodule y por qué forge lo requiere
2. Ejecutar `git submodule add` (con la URL correcta)
3. Asegurarse de tener Python 3.x instalado
4. Instalar pyyaml via pip
5. Ejecutar el CLI interactivo
6. Completar el wizard (10+ preguntas interactivas)
7. Entender el `project.yaml` generado y ajustarlo
8. Ejecutar `forge-init.py` para instalar los agentes
9. Instruir a cada colaborador nuevo para inicializar el submodule

Para el perfil declarado —desarrollador iniciándose en Claude Code— esto es una barrera de entrada considerable.

---

### 2. La extensión VS Code: componente invisible e ininstalable

La extensión VS Code (`vscode-extension/`) implementa funcionalidades útiles: status bar con resultado del audit, tree views de proyecto y agentes, comandos para audit, init y wizard. El código TypeScript es correcto y está compilado (el `out/` existe con `extension.js`).

Sin embargo, la extensión es **inaccesible para cualquier usuario**:

- **No tiene campo `publisher` en `package.json`.** Esto hace imposible publicarla en el VS Code Marketplace bajo identidad reconocible. El campo es obligatorio para publicar.
- **No está publicada en el Marketplace.** Una búsqueda a `https://marketplace.visualstudio.com/items?itemName=forge-agent-framework.forge-agent-framework` retorna HTTP 404.
- **No hay archivo `.vsix` para instalación local.** El `.gitignore` de la extensión excluye `*.vsix`. No hay instrucciones para que un usuario la compile e instale localmente.
- **No aparece en ningún archivo de documentación.** Ni el README ni `docs/guide.md` mencionan la extensión. No hay sección de "VS Code integration", ni comandos de instalación, ni screenshots.

Un desarrollador que explore el repositorio encontrará `vscode-extension/` como un directorio de código sin forma de usarlo. La extensión existe funcionalmente en código, pero es un componente sin usuario posible en su estado actual.

---

### 3. El adapter Codex: convención no verificada

El adapter `adapters/codex/generate-codex-config.py` genera dos archivos: `AGENTS.md` y `codex.md`. La docstring del script afirma:

> "Codex CLI usa AGENTS.md como contexto de sistema y codex.md como instrucciones de autonomía y límites operativos para ejecución de agentes en terminal."

La convención `AGENTS.md` es correcta para OpenAI Codex CLI. Sin embargo, **`codex.md` no es un archivo de configuración documentado en la especificación oficial de OpenAI Codex CLI**. El archivo es generado con contenido razonable (reglas de seguridad, workflow SDD, agentes activos) pero si el runtime no lo consume por defecto, el archivo existe en el repositorio del proyecto sin efecto real.

Adicionalmente:

- El adapter Codex no tiene ningún test. Los adapters de OpenCode y Kiro tienen tests en `tests/test_adapters.py` (16 y 11 tests respectivamente). El adapter Codex tiene cero.
- El AGENTS.md que genera el adapter Codex es casi idéntico al que genera el adapter OpenCode. La única diferencia es la referencia "OpenCode/Codex" en el comentario inicial. No hay diferenciación específica de Codex que justifique un adapter separado.

---

### 4. Inconsistencias documentación vs código

**Inconsistencia 1 — Profiles no documentados en agent-standard.md:**

El archivo `docs/agent-standard.md` lista 9 profiles en la tabla de Tier 2. El directorio `profiles/` contiene 13. Los cuatro profiles no documentados son: `django`, `go-gin`, `sveltekit` y `vuenuxt`. Estos profiles existen, tienen agentes válidos, pasan todos los tests estructurales, pero no aparecen en el documento de referencia que un desarrollador o contribuidor consultaría para entender el ecosistema.

| Profiles en agent-standard.md | Profiles en profiles/ |
|-------------------------------|----------------------|
| hono-drizzle, nextjs-admin, astro, expo, playwright-crawler, fastapi, express, rails, nestjs | + django, go-gin, sveltekit, vuenuxt |

**Inconsistencia 2 — CLI screenshot del README:**

El README incluye un screenshot en texto del CLI que muestra `Buscar templates       aitmpl.com`. La implementación actual del CLI (línea 730 de `forge.py`) lleva a una búsqueda offline en un catálogo curado local. El dominio `aitmpl.com` fue removido del código en el commit `fix(cli): remove all aitmpl.com references` pero permanece en el screenshot del README y en la tabla de scripts: `| scripts/aitmpl-search.py | Busca templates en aitmpl.com |`.

**Inconsistencia 3 — URL del submodule:**

El README muestra `https://github.com/socialweb-cl/forge` (con guión). El remote real del repositorio es `https://github.com/socialwebcl/forge.git` (sin guión). `docs/guide.md` usa el URL correcto `socialwebcl/forge`, lo que indica que la corrección fue aplicada en la guía pero no en el README.

**Inconsistencia 4 — Skill aitmpl-search referencia dominio externo:**

`core/skills/aitmpl-search/SKILL.md` describe el skill como "busca templates de AI en aitmpl.com" pero el script ejecuta búsqueda local. Si el dominio nunca existió como servicio funcional, la descripción del skill es incorrecta.

---

### 5. Tests: cobertura estructural, no de comportamiento real

El suite de tests tiene 358 tests que pasan en 2.73 segundos. Esto es positivo para la fiabilidad del tooling interno (generación de YAML, parsing de frontmatter, instalación de agentes). Sin embargo, hay huecos relevantes:

**Lo que los tests NO verifican:**

- Que los agentes instalados en `.claude/agents/` produzcan el comportamiento agentic esperado al ejecutarse en Claude Code. Los tests verifican que el archivo `.md` existe y tiene el frontmatter correcto, no que Claude Code lo procese correctamente.
- El adapter Codex CLI: cero tests. El adapter puede generar contenido incorrecto sin que ningún test lo detecte.
- La extensión VS Code: cero tests. No hay test suite para la extensión.
- Que `SendMessage` y `subagent_type` declarados en el orchestrator sean APIs reales y funcionales de Claude Code. El orchestrator referencia `SendMessage({ to: "backend-engineer", message: "..." })` como primitiva de coordinación, pero esta API no está documentada en la documentación pública de Claude Code. Si no existe o su signatura cambió, el agente fallaría silenciosamente en producción.
- Compatibilidad de plataforma: no hay tests en Windows ni verificación de que `termios`/`tty` fallen con mensajes de error útiles.

**Lo que los tests sí verifican bien:**

- Estructura de frontmatter de agentes (YAML válido, campos obligatorios)
- Generación de YAML por el wizard (incluyendo casos edge con caracteres especiales)
- Comportamiento de flags `--force`, `--only` en forge-init
- Prioridad Tier 2 > Tier 1 en instalación de agentes
- Adapters OpenCode y Kiro: generación de archivos y contenido básico

El suite es sólido para lo que prueba, pero la falta de cobertura en los componentes más nuevos (Codex, VS Code extension) es una señal de que fueron agregados rápidamente sin el mismo rigor.

---

### 6. Gobernanza: maintainer único sin mecanismos formales

- **Un único maintainer:** El repositorio pertenece a `@socialwebcl`. No hay otros contribuidores listados, no hay equipo declarado. El `CONTRIBUTING.md` tiene dos páginas de instrucciones correctas pero menciona al maintainer en singular.
- **Sin releases semánticos:** `VERSION = "2.0"` está hardcodeado en `forge.py` línea 27. No hay tags git (`git tag` retorna vacío). No hay CHANGELOG. No hay forma de que un adoptador sepa cuándo hubo un breaking change.
- **Sin CI/CD propio:** No existe directorio `.github/workflows/`. Los tests pasan localmente pero no hay garantía de que se ejecuten ante cada PR o commit. Un contribuidor que rompa un test podría no saberlo hasta que el maintainer lo detecte manualmente.
- **Autocatálogo:** El primer resultado del catálogo de búsqueda que ofrece el propio CLI es `socialwebcl/forge`, el framework mismo. Esto no es técnicamente incorrecto (está listado como "framework") pero introduce una percepción de conflicto de interés en la herramienta de descubrimiento.
- **Sin versioning en los agentes:** El campo `standard_version: "1.0"` en los agentes del core es el único mecanismo de control de versiones de los agentes. forge-audit verifica si coincide con la versión actual del standard, pero no hay proceso formal para propagar actualizaciones del standard a proyectos existentes.

---

### 7. UX para el usuario nuevo: brechas en el onboarding

El wizard interactivo es el punto de entrada prometido para el usuario nuevo, pero presenta fricciones:

**Brecha 1 — Requiere `project.yaml` previo:** Si el usuario ejecuta directamente `forge-init.py` sin haber corrido el wizard, obtiene `FileNotFoundError: No se encontró project.yaml`. El mensaje es descriptivo (`Crearlo desde .agentic/templates/project.yaml.tpl`) pero requiere que el usuario entienda la relación entre scripts sin haberla visto antes.

**Brecha 2 — Wizard asume runtime conocido:** La pregunta "Runtime de agentes IA" presenta `Claude Code`, `OpenCode`, `Kiro`, `Todos` sin explicar cuál es el diferencia práctica ni cuál instalar si el usuario ya tiene Claude Code. Un novato probablemente elegirá "Todos" sin entender que genera cuatro formatos de configuración distintos.

**Brecha 3 — Stacks sin profile:** El wizard completa el flujo para stacks como `Angular`, `Remix`, `Vue + Vite`, o `Laravel` sin advertir en el momento que no hay profile Tier 2 disponible. La nota aparece solo en la pantalla de resumen final, después de que el usuario ya seleccionó su stack. El resultado es un proyecto configurado con agentes genéricos para un stack específico.

**Brecha 4 — Terminología del framework antes del tutorial:** El wizard usa "Tier 2", "profile", "compliance reviewer" y "spec-driven development" en los prompts sin que haya un onboarding previo. El flujo asume que el usuario conoce el modelo de agentes de forge antes de usarlo.

---

## Tabla de riesgos de adopción

| Riesgo | Probabilidad | Impacto | Evidencia en código |
|--------|-------------|---------|-------------------|
| Instalación fallida en Windows | Alta | Alto | `import termios` en línea 19 de forge.py sin guards |
| Submodule vacío tras clone del equipo | Alta | Alto | README sin instrucciones de `submodule update --init` |
| Extensión VS Code inusable | Certeza | Medio | Sin publisher, sin .vsix, sin documentación |
| codex.md ignorado por Codex CLI | Media | Medio | Convención no documentada en spec oficial de Codex CLI |
| Profiles de usuario nuevo vs agentes genéricos | Alta | Medio | 4/13 profiles no documentados en agent-standard.md |
| SendMessage API inexistente en Claude Code | Desconocida | Alto | No está en documentación pública de Claude Code |
| Breaking changes silenciosos del upstream | Media | Alto | Sin CI/CD, sin releases semánticos, sin CHANGELOG |
| URL de submodule incorrecta en README | Certeza | Bajo | `socialweb-cl` vs `socialwebcl` (el URL es diferente) |
| Abandono del proyecto | Media | Alto | Maintainer único, sin comunidad, sin roadmap público |

---

## Conclusión

forge resuelve un problema real: el onboarding repetitivo de agentes IA en nuevos proyectos. Para el contexto en que fue desarrollado —equipos que ya conocen Claude Code y han adoptado workflows agenticos— el valor del tooling es claro. El wizard funciona, los scripts generan configuraciones correctas, los tests del core son sólidos, y la abstracción de `project.yaml` como fuente de verdad es una idea arquitecturalmente limpia.

El problema es que el repositorio se presenta como recomendado para desarrolladores que se **inician** en Claude Code. Para ese perfil, forge agrega una capa de complejidad que antecede a la herramienta que se quiere aprender. El usuario novato debe entender git submodules, el modelo de agentes de Claude Code, YAML, Python virtual environments, y el propio DSL de forge antes de obtener cualquier beneficio. La documentación tiene inconsistencias materiales (4 profiles invisibles, URL incorrecta en el step más visible del README, referencia a dominio que ya no existe). Los componentes más recientes (extensión VS Code, adapter Codex) fueron añadidos sin alcanzar un estado usable y sin documentación de uso.

Para un equipo avanzado que quiera adoptar forge como estándar interno, los riesgos son manejables con una revisión previa del código. Para un desarrollador que recién comienza con Claude Code, la recomendación es dominar primero Claude Code directamente —sus agentes, sus comandos slash, su estructura de `.claude/`— antes de añadir un framework de orquestación encima.
