# forge — Análisis técnico positivo (v5)

**Fecha:** Mayo 2026  
**Versión analizada:** forge v2.0  
**Audiencia del análisis:** Desarrolladores que ya usan ChatGPT/Claude y se inician en Claude Code, OpenCode o Codex CLI.

---

## Resumen ejecutivo

forge es un framework que resuelve un problema real y concreto: configurar correctamente un equipo de agentes IA para desarrollo de software requiere conocimiento que no es obvio para alguien que recién adopta Claude Code u OpenCode.

Sin forge, ese desarrollador tiene que descubrir por prueba y error que los agentes necesitan frontmatter estructurado, que el orchestrator no debe escribir código directamente, que el compliance reviewer necesita Opus mientras los implementadores usan Sonnet, y que existe un sistema de tiers para separar los agentes genéricos de los especializados en stack. Forge convierte ese conocimiento acumulado en infraestructura reutilizable.

**Para quién específicamente:**
- Devs que empiezan con Claude Code y quieren un punto de partida sólido sin empezar desde cero.
- Equipos de 2-8 personas que usan Claude Code en el trabajo diario y quieren coordinación estructurada.
- Devs que trabajan en stacks cubiertos por los 13 profiles (Next.js, FastAPI, Rails, Hono, NestJS, etc.) y quieren agentes que ya conocen su stack en vez de agentes genéricos.
- Proyectos con requerimientos de compliance (GDPR, Ley 21.719, LGPD, CCPA) que necesitan un reviewer automático integrado al flujo.

**No es para:** proyectos personales de un solo archivo, dev individual que ya tiene su CLAUDE.md bien configurado, o equipos que prefieren control total sobre cada línea del contexto de sus agentes.

---

## 1. Propuesta de valor para el dev nuevo

### El problema sin forge

Un dev que recién empieza con Claude Code enfrenta estas decisiones que no tienen respuestas obvias:

1. ¿Cómo instruyo al agente para que no salga de su directorio?
2. ¿Qué modelo debo asignar a cada agente? ¿Todos Sonnet? ¿Cuándo Opus?
3. ¿Cómo coordino que el frontend y el backend trabajen en paralelo sin conflictos de merge?
4. Si tengo FastAPI ¿cuáles son las convenciones de Pydantic que el agente debería conocer?
5. ¿Cómo sé después de un mes que mis agentes no se desviaron del estándar que configuré?

Sin forge, ese dev va a buscar en foros, leer docs, probar configuraciones manualmente y llegar a soluciones parciales. Con forge, la respuesta a las cinco preguntas anteriores está resuelta desde el primer día.

### Qué provee concretamente

- **7 agentes Tier 1 listos** con instrucciones de scope, seguridad y workflow ya escritas. El orchestrator sabe cómo spawnear sub-agentes, cuándo usar background vs foreground, y cuándo incluir al compliance reviewer.
- **13 profiles Tier 2** con versiones especializadas de los agentes para stacks específicos. El `api-engineer` del profile `hono-drizzle` conoce Drizzle ORM, schemas por entidad, migraciones reversibles con `down`, comandos `pnpm --filter`, y las convenciones de multi-tenancy. Eso es conocimiento que el agente genérico no tiene.
- **Un wizard que guía el setup inicial** sin que el dev tenga que entender la estructura interna de forge.
- **Un audit que detecta derive** — si después de 2 meses un agente fue modificado manualmente y ya no sigue el estándar, forge-audit lo detecta.

---

## 2. Calidad del CLI y TUI

### forge.py — experiencia de uso real

El CLI principal (`forge.py`, 997 líneas) es un menú TUI que funciona completamente en terminal sin dependencias externas además de Python stdlib (termios, tty). Características concretas:

**Menú principal:** 6 opciones navegables con flechas. Cada opción tiene una descripción contextual que aparece en un panel de borde redondeado al seleccionarla. No hace falta leer documentación para entender qué hace cada opción.

**Pills de categoría coloreadas:** cuando se busca en el catálogo, cada resultado muestra una pill visual: `[FW]` (morado) para frameworks, `[MCP]` (verde oscuro) para servidores MCP, `[PRF]` (verde) para profiles, etc. Mejora la legibilidad en listas largas.

**Hint persistente:** `↑↓ navegar · ⏎ seleccionar · q salir` siempre visible en la parte inferior. Nunca hay que adivinar los controles.

**Validaciones defensivas:** el CLI verifica si el terminal es interactivo (`IS_TTY`), si el ancho mínimo de columnas es 58, y si hay ancho suficiente antes de renderizar. Falla limpiamente con mensaje instructivo si algo no es posible.

**Instalación directa de MCP servers:** desde el catálogo se puede seleccionar un servidor MCP (hay 20 disponibles), el CLI solicita los parámetros necesarios (connection string, API key, etc.) y escribe la config directamente en `.claude/settings.json`. El usuario no necesita conocer el formato JSON manualmente.

### forge-wizard.py — flujo guiado

El wizard es la pieza más importante para devs nuevos. Hace 10 preguntas guiadas:

1. Tamaño del equipo (auto-determina el modo: startup/standard/enterprise)
2. Nombre y descripción del proyecto
3. Tipo de proyecto (8 opciones: webapp, API, fullstack, mobile, SaaS, etc.)
4. Framework frontend (9 opciones con descripción inline)
5. Framework backend (9 opciones con descripción inline)
6. Base de datos (9 opciones)
7. Deploy target (11 opciones: Vercel, Railway, Fly, AWS, etc.)
8. Runtime de agentes (Claude Code / OpenCode / Kiro / todos)
9. Compliance frameworks (multi-select con Space: GDPR, LGPD, Ley 21.719, CCPA, HIPAA, PCI-DSS)
10. Ruta de destino para project.yaml

Al terminar muestra un resumen tabular de la config, sugiere los profiles apropiados según el stack elegido (lógica automática de `suggest_profiles()`), y pregunta si ejecutar forge-init inmediatamente.

El resultado es un `project.yaml` válido, verificado con `yaml.safe_load()` antes de escribirse al disco. Los "próximos pasos" son específicos al modo elegido (el modo enterprise sugiere integrar `--json` en CI).

**Puntos negativos honestos del TUI:**
- Depende de termios/tty, que es POSIX-only. No funciona en Windows sin WSL.
- No tiene modo batch completo para el wizard interactivo; se puede usar `--mode=startup` para saltear la pregunta de equipo, pero el resto sigue siendo interactivo.

---

## 3. Benchmark competitivo

### Comparación narrativa por alternativa

#### `.cursorrules` / `.cursor/rules` (Cursor)
Ofrece instrucciones por archivo o globales para el IDE Cursor. Es simple de configurar pero no tiene el concepto de agentes especializados por rol — la misma regla aplica a todo. No hay wizard, no hay perfiles por stack, no hay auditoría. Adecuado para instrucciones de estilo de código globales, no para coordinar un equipo multi-agente.

Ventaja de forge: tiers de agentes, profiles por stack, compliance automático, audit.  
Ventaja de .cursorrules: integrado nativamente en Cursor, sin setup extra, funciona en proyectos individuales sin estructura adicional.

#### `CLAUDE.md` directo sin forge
La opción DIY más común para usuarios de Claude Code. El dev escribe manualmente el CLAUDE.md con instrucciones propias. Total control, cero overhead de herramientas. Pero el dev tiene que descubrir por su cuenta las mejores prácticas (scope de agentes, uso de Opus vs Sonnet, frontmatter estructurado, separación por tiers). El resultado varía mucho en calidad según la experiencia del dev.

Ventaja de forge: mejores prácticas codificadas, perfiles de stack especializados, audit de deriva, wizard de setup.  
Ventaja de CLAUDE.md manual: control total, sin dependencias, funciona sin Python.

#### `aider` (--system-prompt, configuración manual)
Aider es una herramienta excelente para pair programming en terminal, con soporte multi-modelo. Pero no tiene un sistema de agentes especializados por rol ni perfiles por stack. El system-prompt es global para toda la sesión. No tiene wizard, ni audit, ni integración con Kiro/OpenCode/Codex. Es una herramienta distinta: aider se usa para implementar código en una sola sesión, forge es infraestructura de equipo persistente.

Ventaja de forge: multi-agente, roles especializados, persistencia entre sesiones, multi-runtime.  
Ventaja de aider: más simple, sin config previa, excelente para sesiones individuales, soporte Git nativo.

#### cline / Roo Code (reglas por agente)
Permiten definir reglas de comportamiento dentro del IDE. Tienen un concepto de "modes" por tarea pero no el sistema de tiers de forge ni los perfiles de stack curados. La configuración es manual por proyecto.

Ventaja de forge: wizard automatizado, profiles curados para 13 stacks, auditoría de deriva, soporte multi-runtime.  
Ventaja de cline/Roo: integración visual en el IDE, sin herramientas CLI adicionales.

#### OpenHands / SWE-agent
Herramientas de agente autónomo diseñadas para resolver issues de GitHub de forma completamente automática. Tienen un scope diferente al de forge: operan en sandboxes aislados y toman decisiones de implementación sin intervención humana. Forge asume que el humano está en el loop coordinando la sesión.

Ventaja de forge: diseño para trabajo colaborativo, compliance integrado, profiles de stack.  
Ventaja de OpenHands/SWE-agent: autonomía total, mejor para automation pipelines, no requiere supervisión.

#### DIY: carpeta `.claude/agents/` a mano
La opción más cercana a forge pero completamente manual. Un dev que sabe lo que hace puede crear agentes .md con frontmatter correcto sin ninguna herramienta. Forge aporta valor por los perfiles ya escritos y la auditoría de deriva, pero el overhead de la herramienta puede no justificarse para un equipo que ya domina el sistema.

Ventaja de forge: perfiles de stack curados, wizard de setup, auditoría, multi-runtime.  
Ventaja de DIY: cero dependencias, control total, sin herramientas adicionales que aprender.

### Tabla de puntuación (escala 1-5)

| Criterio | .cursorrules | CLAUDE.md manual | aider | cline/Roo | OpenHands/SWE | DIY .claude/agents |
|----------|:-----------:|:----------------:|:-----:|:---------:|:-------------:|:------------------:|
| **Setup inicial (facilidad)** | 5 | 3 | 4 | 4 | 3 | 2 |
| **Multi-agente con roles** | 1 | 2 | 1 | 3 | 4 | 4 |
| **Profiles por stack** | 1 | 1 | 1 | 1 | 1 | 3 |
| **Compliance integrado** | 1 | 2 | 1 | 1 | 2 | 3 |
| **Auditoría / drift detection** | 1 | 1 | 1 | 1 | 1 | 1 |
| **Multi-runtime (CC/OC/Kiro/Codex)** | 1 | 2 | 1 | 1 | 1 | 2 |
| **Curva de aprendizaje (menor = mejor)** | 5 | 4 | 4 | 4 | 3 | 2 |
| **Control sobre el contexto** | 4 | 5 | 4 | 4 | 2 | 5 |
| **Catálogo MCP integrado** | 1 | 1 | 1 | 2 | 1 | 1 |
| **Integración CI/CD (audit JSON)** | 1 | 1 | 2 | 1 | 3 | 1 |

**Nota:** forge no figura en la tabla porque es la herramienta evaluada, pero su puntuación implícita en los criterios anteriores sería: Setup 4, Multi-agente 5, Profiles 5, Compliance 4, Auditoría 5, Multi-runtime 5, Curva 3, Control 4, Catálogo 4, CI/CD 4.

---

## 4. Valor diferencial de las nuevas features

### Extensión VS Code (624 líneas TypeScript)

Para un dev que empieza con Claude Code y pasa la mayor parte del día en VS Code, la extensión elimina la necesidad de recordar comandos CLI.

**Qué hace:**
- Status bar con estado del proyecto: `forge ✓` (todo ok), `forge ⚠ 2` (2 advertencias), `forge ✗ 1` (1 error). Visible permanentemente mientras se trabaja.
- Tree view de agentes instalados con iconos por tier (verde para Tier 1, amarillo para Tier 2, rojo para Tier 3), con click directo para abrir el archivo del agente.
- Tree view del proyecto que parsea `project.yaml` y muestra nombre, modo, stack y profiles activos sin abrir el archivo.
- 6 comandos accesibles por Command Palette: `forge: Run Audit`, `forge: Audit Specific Agent` (QuickPick con lista de agentes), `forge: Initialize Project`, `forge: Open Setup Wizard` (abre terminal integrado con el wizard), `forge: Search Catalog`, `forge: Show Project Status`.
- Auto-audit opcional al guardar archivos `.md` en `.claude/agents/` (desactivado por defecto, configurable).

**Valor para el dev nuevo:** no tiene que recordar la ruta al script de auditoría ni el formato de los flags. El feedback de estado es inmediato en la barra inferior del editor.

**Limitación real:** la extensión no está publicada en el marketplace (solo el código fuente existe en `vscode-extension/`). El dev tiene que compilarla manualmente con `npm run compile`. Esto es una barrera para adopción.

### Adapter Codex

El adapter genera dos archivos para Codex CLI (OpenAI):
- `AGENTS.md` — roster de agentes en formato compatible con lo que Codex espera como contexto
- `codex.md` — instrucciones de autonomía, workflow SDD, reglas de seguridad y límites operativos en inglés

**Valor específico:** un usuario que ya usa Codex CLI y quiere adoptar forge puede generarse la config en su formato nativo con un solo comando: `forge-init.py --tool codex`. No tiene que reescribir manualmente las instrucciones del equipo en el formato que Codex entiende.

La sección de seguridad de `codex.md` incluye explícitamente: no hardcodear secrets, prepared statements en SQL, no loguear PII, verificar auth en cada endpoint, no force push a main. Estos son defaults útiles que muchos devs no ponen en su config inicial.

### 13 profiles: cobertura de stacks reales

Los profiles no son solo variaciones de nombre — tienen conocimiento específico del stack. Verificado en el código:

- **hono-drizzle** (`api-engineer.md`): conoce que Drizzle no siempre genera migración `down`, que hay que escribirla a mano; conoce el comando `pnpm --filter=api db:generate`; sabe que los tests deben usar BD real (no mock del ORM); sabe de multi-tenancy con `tenant_id` en cada query.
- **rails** (`fullstack-engineer.md`): el agente fullstack cubre backend + frontend + migraciones juntos, que es el modelo de Rails.
- **expo** (`mobile-engineer.md`): scope limitado a la app móvil, no toca el backend.
- **playwright-crawler** (`scanner-engineer.md`): especializado en scraping ético.

La lógica de `suggest_profiles()` en el wizard asigna automáticamente el profile correcto según el stack elegido. Si el dev elige `hono` como backend, el wizard sugiere `hono-drizzle` automáticamente.

### Audit con `--json` + summary: integración CI

El audit exporta JSON estructurado con esta forma:

```json
{
  "project": "Mi Proyecto",
  "summary": {
    "agents_total": 5,
    "agents_declared": 5,
    "ok": 4,
    "info": 0,
    "warnings": 1,
    "errors": 0,
    "orphans": 0
  },
  "agents": { ... },
  "opportunities": [ ... ],
  "orphans": []
}
```

Retorna exit code 1 si hay errores de severidad `error` o `critical`. Esto permite integrarlo en CI con:

```bash
python3 .agentic/scripts/forge-audit.py --json | jq '.summary.errors'
```

El mecanismo de similitud usa `SequenceMatcher` para detectar agentes que divergieron mucho del estándar de forge (< 50% similitud = error, < 80% = warning, con heurísticas para distinguir especialización intencional de abandono). Para un equipo que trabaja con forge a lo largo de meses, este mecanismo evita que los agentes deriven silenciosamente.

---

## 5. Calidad técnica

### Tests: 210 funciones en 11 archivos

La suite tiene 210 funciones de test distribuidas en:
- `test_forge_audit.py` — 25 tests: parsing de frontmatter, checks de secciones, similitud, detección de problemas
- `test_forge_wizard.py` — 47 tests: lógica de team_size_to_mode, detect_language, suggest_profiles, build_yaml
- `test_adapters.py` — 19 tests: adapters de claude-code, kiro, opencode, codex
- `test_forge_init_integration.py` — 18 tests: integración completa de instalación
- `test_generate_claude_md.py` — 18 tests: generación de CLAUDE.md
- `test_aitmpl_search.py` — 25 tests: búsqueda en catálogo
- `test_profiles.py` — 15 tests: validación estructural de todos los profiles
- Y 4 archivos adicionales para teardown, scaffold, install_agent, forge.py

La nota mencionaba 358 tests, pero el conteo actual de funciones `test_*` es 210. La discrepancia puede deberse a parametrización con `@pytest.mark.parametrize` que multiplica una función por N casos.

Los tests de profiles son especialmente útiles: validan que cada agente en cada profile tiene los campos de frontmatter obligatorios (`name`, `description`, `model`, `tools`, `tier`, `profile`), modelo válido, y las secciones requeridas (`## Reglas`, `## No hagas`). Si alguien agrega un profile nuevo y le falta un campo, el test falla automáticamente.

### Dependencias mínimas

Solo dos dependencias en `requirements.txt`:
- `pyyaml>=6.0` — para leer/escribir project.yaml
- `pytest>=7.0` — solo para tests

El CLI principal (`forge.py`) usa solo stdlib de Python: `termios`, `tty`, `json`, `subprocess`, `importlib`. No hay dependencias de pip para el uso en producción.

### Estructura de código

- `forge.py` — 997 líneas, sin clases innecesarias. El menú principal es 6 `MenuItem` + un dict de `ACTIONS`. Fácil de extender.
- `forge-wizard.py` — 808 líneas, lógica de setup clara y bien separada en catálogos (listas), lógica de sugerencias (`suggest_profiles`, `detect_language`), builder de YAML, y wizard principal.
- `forge-audit.py` — 557 líneas, claramente separado en parsers, checks, report.
- `forge-init.py` — 453 líneas, lógica de instalación por tier + generación de AGENTS.md.

El código sigue una convención consistente: cada script tiene un `main()` que es el punto de entrada, las funciones son pequeñas y tienen docstrings. El manejo de errores es apropiado (captura excepciones específicas, no `except Exception: pass`).

### Seguridad por diseño

Los agentes tienen instrucciones de seguridad embebidas que no son boilerplate:
- `backend-engineer.md`: "Usá parámetros preparados siempre — nunca concatenar inputs en queries SQL."
- `backend-engineer.md`: "Verificá autenticación Y autorización en cada endpoint."
- `backend-engineer.md`: "No loguear PII. Solo IDs hash o indicadores."
- El skill `security-audit` incluye grep commands para detectar SQL injection, endpoints sin auth, y body sin validación de schema.

Esto significa que un agente configurado con forge tiene instrucciones de seguridad explícitas desde el inicio, no como addon.

---

## 6. Roadmap implícito

Del código actual se infieren estas direcciones:

**1. Ecosistema wiki en maduración.** Los skills `wiki-ingest`, `wiki-query`, `wiki-lint` están presentes y hay templates en `templates/wiki/`. El adapter claude-code instala slash commands para ellos. Hay lógica en forge-audit para verificar que el wiki existe si los skills están activos. Esto sugiere que el knowledge management persistente es una dirección prioritaria.

**2. Multi-runtime como ciudadano de primera clase.** El adapter Codex es el más reciente (4 adapters ahora: claude-code, opencode, kiro, codex). La tendencia es seguir agregando adapters para herramientas que adopten el formato AGENTS.md o similares. Cada adapter tiene su propio generador dedicado.

**3. Extensión VS Code como interfaz principal.** La existencia de 624 líneas de TypeScript para la extensión, con status bar, tree views y auto-audit, sugiere que el objetivo es que los devs que no quieren usar CLI puedan igualmente usar forge desde VS Code sin abrir una terminal.

**4. Compliance como feature diferenciadora.** La presencia de GDPR, Ley 21.719, LGPD, CCPA, HIPAA, PCI-DSS en el wizard, y un agente `compliance-reviewer` con poder de veto codificado, indica que forge está apuntando a equipos con obligaciones regulatorias reales.

**5. Catálogo curado como valor standalone.** El catálogo de 40+ recursos (20 MCP servers con instalación directa, 5 frameworks, 13 profiles, tools y resources) funciona offline y tiene su propio módulo de búsqueda. Esto tiene valor independiente del resto de forge.

---

## 7. Limitaciones honestas

Ser honesto sobre las limitaciones preserva la credibilidad del análisis positivo.

**1. La extensión VS Code no está publicada en marketplace.** El código existe en `vscode-extension/` pero requiere compilación manual (`npm install && npm run compile`). Para un dev nuevo que no maneja TypeScript/Node, esto es una barrera real. El valor de la extensión es alto en teoría pero bajo en accesibilidad actual.

**2. Dependencia de Python 3.9+ y PyYAML.** Un dev que trabaja principalmente en Node.js o Ruby puede no tener Python en el PATH o no querer instalarlo. La decisión de usar Python para los scripts (en vez de, por ejemplo, un binario compilado o un script Node) limita la portabilidad percibida.

**3. No funciona en Windows sin WSL.** El TUI usa `termios` y `tty`, que son APIs POSIX. En Windows nativo no funciona. WSL lo resuelve pero es un paso adicional.

**4. El wizard es completamente interactivo.** No hay forma de crear un `project.yaml` en un solo comando no-interactivo combinando todos los parámetros. `--mode=startup` salta la primera pregunta, pero el nombre, stack, database y deploy siguen siendo interactivos. Para uso en CI o scripts de setup, hay que escribir el YAML a mano o usar el template.

**5. Las métricas de similitud del audit son heurísticas, no perfectas.** `SequenceMatcher` compara texto carácter a carácter. Un agente que fue reescrito para un dominio específico pero sigue las mismas convenciones puede tener similitud baja y disparar falsos positivos. El código tiene mitigaciones (detecta si el agente tiene `tier: 3`, si es más largo que el de forge, etc.) pero no es un sistema de detección perfecto.

**6. El catálogo de 20 MCP servers está codificado en el script, no en un archivo externo.** Actualizar el catálogo requiere editar `aitmpl-search.py`. No hay mecanismo de actualización automática (aunque funciona offline, que es una ventaja).

**7. Los profiles existen para 13 stacks pero la cobertura no es uniforme.** Algunos profiles tienen un solo agente especializado (p.ej., `nextjs-admin` tiene solo `admin-engineer.md`), mientras que `rails` tiene `fullstack-engineer.md`, `mobile-engineer.md` y `scanner-engineer.md`. Un equipo Rails tiene más coverage que uno de Next.js admin.

**8. La documentación para el dev nuevo está en el README, no en el CLI.** El TUI describe qué hace cada opción, pero no explica conceptos como "qué es un profile Tier 2" o "cuándo usar el compliance reviewer" de forma que un dev nuevo sin contexto pueda entender sin leer documentación externa.

---

## Conclusión

forge tiene propuesta de valor real y demostrable para el perfil de audiencia definido. El valor principal no es el CLI en sí — es el conocimiento codificado en los 7 agentes Tier 1, los 13 profiles, los skills de seguridad/compliance, y el sistema de audit. Un dev nuevo que adopta Claude Code con forge tiene desde el día uno un equipo de agentes con instrucciones de seguridad explícitas, scope bien definido, y profiles adaptados a su stack.

El CLI y wizard son de buena calidad técnica: responsive, bien documentado internamente, con validaciones defensivas apropiadas. La extensión VS Code añade visibilidad del estado sin cambiar el flujo de trabajo.

Las limitaciones reales (extensión no publicada, solo POSIX, catálogo estático) no afectan la propuesta de valor core pero sí la adopción sin fricción. Un equipo que resuelve esas fricciones de setup iniciales obtiene un framework sólido que mejora con el tiempo vía audit.

**Recomendación:** usar forge si el stack está cubierto por los profiles existentes, el equipo tiene más de una persona, y existe intención de mantener la configuración de agentes estable en el tiempo. No usar forge si el proyecto es personal, simple, o si el dev prefiere control total sobre el contexto de sus agentes.
