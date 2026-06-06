# RFC-003 — forge MCP server (recortado)

> Estado: DRAFT
> Autor: forge maintainers
> Depende de: RFC-001 (multi-runtime, zero-network, catálogo bundleado), RFC-002 (CLI npm TypeScript). Nota: estos RFC se citan como contexto; RFC-001 y RFC-002 viven en `docs/proposals/`; sus invariantes se reafirman aquí de forma autocontenida.
> Audiencia: maintainer
> Fecha: por definir (no fechar hasta la aprobación)

---

## 1. TL;DR

Un servidor MCP "completo" para forge sería un error: rompe dos invariantes que justifican la existencia del proyecto (cold-start liviano de `npx` y neutralidad multi-runtime). La mayoría de lo que un MCP server expondría —stack, arquitectura, reglas, convenciones— ya se vuelca de forma **estática** a `CLAUDE.md` / `AGENTS.md` / hooks / `wiki/` durante `forge generate`. Exponer eso por MCP es cargo-culting: agrega una dependencia de red/proceso para servir información que el agente ya tiene en disco.

Este RFC propone una versión **recortada y opt-in**: un servidor MCP `stdio-only` con exactamente **dos tools genuinamente dinámicos**:

1. **`guardrail_status`** — devuelve el **veredicto vivo** de los guardrails (¿este comando se bloquea?, ¿estoy en `main`?, ¿hay spec aprobada?), computado reusando la lógica pura de los hooks existentes.
2. **`wiki_search`** — búsqueda textual offline sobre el corpus confinado `wiki/`, reusando `wikiQuery` tal cual.

La columna vertebral del diseño es la **regla de oro**: el piso estático sigue completo y MCP es **estrictamente aditivo** (una capa de frescura/cache sobre ese piso), nunca un reemplazo. **Nada del conocimiento de forge es alcanzable únicamente vía MCP.** Esto se enforce con un **checkpoint en CI** (un test de allowlist exacta, no una prueba semántica). Así la neutralidad multi-runtime se preserva: Kiro y los demás runtimes que no consumen MCP **nunca quedan peor que hoy**, y el two-tier divergente queda como una decisión que un revisor debe aprobar explícitamente, no como un deslizamiento silencioso.

---

## 2. Qué es y por qué recortado

### 2.1 El impulso natural (y por qué es trampa)

El patrón "servidor MCP para mi framework" empuja a exponer **todo** el contexto del proyecto como tools/resources: `get_stack`, `get_architecture`, `get_rules`, `get_conventions`, `list_agents`, etc. Es atractivo porque es "la forma moderna" de dar contexto a un agente.

El problema es que en forge **ese contexto es estático y ya está volcado a disco** en `forge generate`:

- Stack, misión, estructura, comandos → `CLAUDE.md` / `AGENTS.md`.
- Reglas de guardrail → hooks (`.claude/hooks/*.js`, `.githooks/pre-commit`, `.kiro/hooks/*.json`).
- Conocimiento del dominio → `wiki/` (seedeado deterministamente por `wiki-autogen.ts`).

Un tool MCP `get_stack` que devuelve lo mismo que ya está en `CLAUDE.md` no agrega información: agrega una **segunda fuente** de la misma verdad. Eso es exactamente el two-tier que forge existe para eliminar. Para un dato estático, el archivo en disco es estrictamente mejor que un tool MCP: cero dependencias, cero proceso, lo leen **todos** los runtimes.

### 2.2 El criterio de corte: ¿es DINÁMICO?

La única razón legítima para un tool MCP en forge es exponer algo que **cambia en tiempo de ejecución y no puede precomputarse en `generate`**:

| Candidato | ¿Dinámico? | Veredicto |
|-----------|-----------|-----------|
| stack, arquitectura, comandos | No — fijo en `project.yaml` | Estático → `CLAUDE.md`, NO MCP |
| reglas de guardrail (patrones) | No — fijos en hooks | Estático → hooks, NO MCP |
| **veredicto de guardrail** para un comando/branch concreto | **Sí** — depende del comando, del branch actual, del estado de specs | **`guardrail_status`** |
| **búsqueda en el wiki** por una query concreta | **Sí** — depende de la query y del contenido vivo de `wiki/` | **`wiki_search`** |

Solo dos candidatos pasan el filtro. Esos son los dos tools del v1. Todo lo demás se queda estático.

### 2.3 Por qué esto importa para los invariantes

forge es **multi-runtime** y **zero-network**. Un MCP server toca ambos ejes:

- **Cold-start / dep tree**: hoy `packages/cli/package.json:49-58` no tiene **ninguna** dependencia MCP. El SDK de MCP (`@modelcontextprotocol/sdk`) sería la **primera dependencia de runtime para una feature opt-in**. Si se carga en el hot-path, **el 100% de los usuarios de `npx forge init` paga** un dep que casi nadie usa.
- **Neutralidad**: solo algunos runtimes consumen MCP (Claude Code lo registra con `claude mcp add`). Kiro/OpenCode/Codex no necesariamente. Si conocimiento real vive en MCP, esos runtimes quedan ciegos a él → split two-tier.

El recorte a dos tools dinámicos + la regla de oro neutralizan ambos riesgos. El resto de este RFC desarrolla el peor caso y las mitigaciones.

---

## 3. El peor caso

Hay que nombrarlo con precisión para diseñar contra él. Son dos fallas que se retroalimentan.

### 3.1 Two-tier divergente (la falla de neutralidad)

Secuencia de degradación:

1. Se agrega un tool MCP útil, p. ej. `get_conventions`, "porque es más cómodo que parsear `CLAUDE.md`".
2. Con el tiempo, una convención nueva se agrega **solo** al tool MCP y no al volcado estático (es más rápido, "el agente igual lo lee por MCP").
3. Claude Code, que consume MCP, ve la convención. **Kiro no la ve.** OpenCode/Codex tampoco.
4. Ahora hay **dos niveles de conocimiento** según el runtime: tier-1 (con MCP) y tier-2 (sin MCP). El comportamiento del agente diverge por runtime.

Esto es precisamente lo que forge existe para eliminar. El piso estático multi-runtime (`CLAUDE.md`/`AGENTS.md` + hooks + `wiki/`) garantiza que **todos** los runtimes arranquen del mismo conocimiento. Un MCP que se vuelve fuente primaria rompe esa garantía. La asimetría de registro por-runtime lo hace inevitable si se permite que algo viva solo en MCP: Claude Code es el único con hooks nativos (`init.ts:265-303`), los demás reciben fallbacks (`.githooks/pre-commit` + `AGENTS.md` para OpenCode/Codex vía `generate.ts:62-71`; `.kiro/hooks/*.json` para Kiro vía `generate.ts:156-167`). MCP suma **otra** capa asimétrica encima.

### 3.2 Tool read-only que se vuelve fuga / path-traversal (la falla de seguridad)

El segundo peor caso aparece si los tools toman un **path libre** del cliente y lo leen:

1. `wiki_search` (o un futuro `read_doc`) acepta un argumento `path` y devuelve `readFileSync(path)`.
2. El agente —o un prompt inyectado en contenido que el agente procesa— pide `path = "../../.env"` o `path = "/etc/passwd"`.
3. El "tool read-only del wiki" se convierte en un **lector arbitrario de filesystem**: path-traversal, fuga de secretos.

Un MCP server es un proceso que el agente puede invocar con argumentos que el agente eligió. "Read-only" no es suficiente si el **scope** del read es el filesystem entero. Hay además dos vectores residuales más sutiles, ligados a cómo se construye el corpus y cómo se representan las rutas internamente; se tratan como invariantes explícitos en §4.3 y §5.2. La superficie crece todavía más si el server expone HTTP (red + auth + sesiones).

### 3.3 Por qué duele doble

Las dos fallas se combinan: un MCP que es fuente primaria (3.1) **y** lee paths arbitrarios (3.2) es lo peor de ambos mundos —conocimiento que solo algunos runtimes ven, servido por un proceso con superficie de fuga. El diseño tiene que cerrar **ambas** por construcción donde se pueda, y donde no se pueda, atarlas a un checkpoint que obligue a una decisión consciente.

---

## 4. Las mitigaciones

### 4.1 La regla de oro (el corazón del RFC)

> **El piso estático sigue completo. MCP es estrictamente ADITIVO: una capa de FRESCURA/CACHE sobre el piso, nunca un reemplazo. Nada del conocimiento de forge es alcanzable ÚNICAMENTE vía MCP.**

Consecuencias directas:

- **Neutralidad.** Como nada vive solo en MCP, Kiro/OpenCode/Codex —que no consumen MCP— **nunca quedan peor que hoy**. Tienen el mismo piso estático que siempre. MCP, para Claude Code, solo aporta *frescura* (un veredicto computado al momento) o *conveniencia* (una búsqueda sin salir del loop del agente) sobre información que ya existe en disco.
- **El two-tier divergente (§3.1) no debe poder colarse en silencio.** No hay "tier-1 con MCP" mientras MCP no contenga nada exclusivo. Si se apaga el MCP, no se pierde conocimiento, solo frescura.
- **Cada tool MCP debe tener un origen estático identificable:**
  - `guardrail_status` → su lógica vive en los hooks, que ya se instalan en todos los runtimes (en forma nativa o fallback). El MCP computa un veredicto sobre **las mismas reglas**.
  - `wiki_search` → su corpus es `wiki/`, que ya está en disco y ya lo consume el skill `/wiki-query` (`wiki.ts:431,441`). El MCP busca sobre **el mismo piso**.

**Checkpoint de enforcement** (`packages/cli/test/mcp-parity.test.mjs`, con `node --test`, igual que los 16 `*.test.mjs` del harness actual). Hay que ser honesto sobre lo que este test puede y no puede garantizar:

- **Lo que SÍ hace:** afirma una **allowlist exacta**. El conjunto de tools MCP registradas debe ser exactamente `{ guardrail_status, wiki_search }`, y cada una debe estar fijada (pinned) a su módulo de origen estático declarado: `guardrail_status` → el módulo de guardrails extraído de los hooks; `wiki_search` → el corpus `wiki/`. Si alguien registra un tool nuevo (o cambia el origen de uno existente), el test **falla en CI** hasta que alguien edite la allowlist.
- **Lo que NO hace:** no puede probar, por inspección, que el conocimiento de un tool futuro arbitrario "tiene origen estático". "Origen estático identificable" es una propiedad semántica que ningún unit test decide. Un maintainer que agregue un tool **y** actualice la allowlist igual pasa CI.

Por eso el test es un **tripwire que exige opt-in deliberado**, no una garantía de no-divergencia semántica: agregar cualquier tool obliga a editar la allowlist, lo que pone el cambio frente a un revisor que tiene que confrontar la regla de oro y aprobarla explícitamente. La neutralidad multi-runtime no se sostiene "por diseño imposible" sino por este checkpoint más la revisión humana que dispara.

### 4.2 `stdio-only` en v1, nunca HTTP

v1 expone el server **exclusivamente por stdio**. Sin transporte HTTP, sin socket, sin red. Esto:

- Preserva el invariante zero-network: el server es un proceso hijo local, sin superficie de red.
- Elimina por completo la necesidad de auth/sesiones en v1.
- Cierra la mitad "HTTP" del peor caso de §3.2.

HTTP/remoto con auth queda **explícitamente diferido** a un RFC futuro, con su propio modelo de amenazas. No se diseña ahora "por las dudas".

### 4.3 Tools read-only y acotados (sin path libre)

Ambos tools son read-only y, crucialmente, **ninguno toma un path libre que luego lee**:

- `guardrail_status` devuelve un **VEREDICTO** (`blocked` / `warn` / `ok` + razón), **no contenido de archivo**. No lee paths que el cliente elige; opera sobre `project.yaml` resuelto desde el cwd y sobre el comando/branch que se le pasa como dato, no como ruta a abrir.
- `wiki_search` devuelve solo **pasajes del corpus confinado `wiki/`**. El corpus está delimitado por `collectMarkdown(wikiRoot())` filtrado por `isWikiPage` (`wiki.ts:73,63`), que ya excluye `raw/`, `_template.md` y los control files. El input es una **query textual**, no un path. El server nunca abre una ruta provista por el cliente.

Esto cierra la mitad "path-traversal del input" de §3.2. Pero quedan dos vectores residuales que NO se resuelven solo por "el input es texto", y que se elevan a **invariantes explícitos**:

- **Invariante de confinamiento del corpus (anti-symlink).** `collectMarkdown` recorre con `readdirSync(dir, { withFileTypes: true })` y decide membresía con `entry.isDirectory()` / `entry.isFile()` (`wiki.ts:76-80`). La membresía del corpus depende, entonces, de la semántica de `Dirent` ante symlinks: un symlink commiteado dentro de `wiki/` que apunte afuera del árbol es la única vía por la que el corpus podría ensancharse. Esto NO puede quedar como accidente de implementación. El RFC exige una de dos: (a) documentar y testear que `Dirent.isFile()`/`isDirectory()` no siguen el symlink y por lo tanto un symlink-a-archivo queda excluido del corpus; o, si esa garantía no es suficiente, (b) agregar un chequeo explícito de `realpathSync(page)` que confirme que la ruta resuelta sigue bajo `wikiRoot()`, descartando cualquier página cuyo realpath escape el árbol. La membresía del corpus no debe poder ampliarse por un symlink.
- **Invariante de no-fuga de rutas absolutas (ver §5.2).** La extracción de `wiki_search` debe devolver rutas **relativas** a `wikiRoot()`, nunca absolutas.

### 4.4 Dependencia que falla FUERTE, fuera del hot-path

El SDK de MCP sería la primera dep de runtime para una feature opt-in (§2.3). Reglas:

- **`import()` lazy** del SDK, **solo** cuando se invoca `forge mcp`, **100% fuera del hot-path** de `init` / `generate` / `npx`. Quien nunca corre `forge mcp` no paga ni un `require` del SDK: cold-start liviano preservado.
- **Modelo de distribución elegido: bundlear el SDK como dependencia normal de `@cristiancorreau/forge`** (el paquete publicado; bin `forge`, ver `packages/cli/package.json:2,22-24`). Bajo este modelo, una instalación correcta **siempre** incluye el SDK: el SDK no puede "faltar" salvo que la instalación esté corrupta. Por eso el guard del `import()` lazy debe dar un error **accionable y ruidoso** acorde a ese hecho, no un mensaje que sugiera instalar el SDK por separado:
  `"@modelcontextprotocol/sdk no se pudo cargar: instalación corrupta. Reinstala el CLI: npm i -g @cristiancorreau/forge"`.
- **`optionalDependencies` se descarta**: su modo de fallo es silencioso (el comando "no funciona" sin explicar por qué) y además abriría el caso "instalación correcta pero SDK ausente", que es justo el que el mensaje anterior evita. Si en el futuro se decidiera el modelo *opcional* en vez de bundleado, el mensaje DEBE cambiar al comando exacto `npm i @modelcontextprotocol/sdk` (no a reinstalar el CLI). Los dos modelos son mutuamente excluyentes; el mensaje tiene que corresponder al modelo vigente.
- Cualquier import del SDK queda **fuera de todo import del hot-path**: se importa solo dentro de `forge mcp`.

### 4.5 Opt-in detrás de flag + registro explícito

- El server **nunca se auto-habilita**. No se registra en ningún runtime durante `init`/`generate`.
- Se habilita con un flag explícito y se registra manualmente en el runtime, p. ej.:
  `claude mcp add -s local -t stdio forge "forge mcp"`
- Distingamos dos formas que el RFC anterior confundía:
  - **Shape de install-metadata para servidores MCP de terceros.** forge ya modela `{ slug, command, args, params, env }` en `aitmpl-search.ts:116-122` (bajo `src/commands/`), como metadata de **instalación de catálogo** para servidores MCP externos (filesystem, git, etc.). Ese shape sí expresa `command`/`args`.
  - **Bloque `mcp.servers` de `project.yaml`.** El schema real es `mcp?: { servers?: Array<{ name: string; auto_approve?: string[] }> }` (`yaml.ts:94`; migración en `migrate.ts:126-128`). Tiene **solo** `name` y `auto_approve`: **no** tiene `command`, ni `args`, ni `params`, ni `env`.
- En consecuencia, **auto-documentar** el comando `claude mcp add forge` en la salida de `forge mcp --help` / `forge doctor` **reusa el shape de install-metadata de `aitmpl-search.ts`**, no el bloque de `project.yaml`. Si en algún momento forge quisiera guardar su **propio** descriptor de server en `project.yaml`, el bloque `mcp.servers` necesitaría una **extensión de schema** (sumar `command`/`args`); hoy ese bloque no puede expresar cómo se lanza un server. No se presenta como ya modelado.

### 4.6 Paridad en `doctor` / `audit`

- `forge doctor` (`doctor.ts`, ya verifica `.claude`/`AGENTS.md`/`.kiro` por runtime en `:210-222`) suma un chequeo de **paridad MCP**: si el server está registrado, advertir explícitamente "MCP es aditivo; el piso estático (`CLAUDE.md`/`AGENTS.md`/hooks/`wiki/`) sigue siendo la fuente de verdad para runtimes sin MCP (Kiro/OpenCode/Codex)".
- `forge audit` (`audit.ts:278-342`, ya verifica presencia de `CLAUDE.md`/`AGENTS.md`/`settings.json`) suma la verificación de que **ningún conocimiento intenta vivir solo en MCP** —la versión en runtime del checkpoint de §4.1.

---

## 5. Diseño de los 2 tools

Ambos tools **reusan lógica existente**. La única deuda es **extraer a un módulo compartido importable** las funciones puras de los hooks, que hoy corren standalone (`node .claude/hooks/X.js`) y **no están exportadas**.

**Nota de registro de idioma:** cualquier string nuevo, de cara al usuario, que introduzca la capa MCP se escribe en **español neutro (tuteo)**, sin voseo. Las funciones de hook y la salida del CLI que el MCP reusa contienen voseo en strings de runtime (p. ej. `pre-bash-check.js`: "Ejecutá esto MANUALMENTE", "cancelá y ejecutá"; `pre-edit-check.js`: "Creá una rama"). Como la capa MCP reusa esa lógica, ese voseo aflorará en la salida MCP salvo que se normalice. Decisión: **normalizar esos strings a tuteo durante la extracción a módulo compartido (§7)**; si por alcance se difiere, debe quedar **explícitamente fuera de alcance** y anotado. (Para el corpus del wiki, `wiki.ts:431,441` ya usa la forma neutra "usa", no voseo; no requiere normalización.)

### 5.1 `guardrail_status`

Propósito: dado un comando candidato (y/o el estado actual del repo), devolver el **veredicto** que aplicarían los guardrails, **sin** ejecutar el comando. Frescura: el veredicto se computa al momento (depende del branch actual, del estado de specs, de `project.yaml`), cosa que no puede precomputarse en `generate`.

**Input** (todos opcionales; el server computa lo que pueda con lo que recibe):

```jsonc
{
  "command": "string?",   // comando a evaluar (para la lógica tipo pre-bash-check)
  "filePath": "string?"   // archivo a editar (para la lógica tipo pre-edit-check)
}
```

**Output** (veredicto estructurado, NUNCA contenido de archivo). Importante: el campo `specGate` y el `branch` están acoplados por la lógica real de los hooks. La guarda de branch (`pre-edit-check.js:227-236`) hace `exit 2` en `main`/`master` **antes** de evaluar el spec gate, y el spec gate (`:239`) **solo** corre cuando `!PROTECTED_BRANCHES.has(branch) && branch` (donde `PROTECTED_BRANCHES = {main, master, develop}`, `:163`). Por eso `branch: "main"` y `specGate: "no_approved_spec"` **no coexisten**: en `main` la guarda de branch cortocircuita y el spec gate ni se evalúa. El output lo refleja con dos ejemplos consistentes con el source:

Ejemplo A — en una rama de feature (el spec gate sí aplica):

```jsonc
{
  "verdict": "warn",
  "reasons": [
    { "rule": "spec_gate", "label": "no_approved_spec" }
  ],
  "branch": "feat/login",           // rama no protegida → spec gate evaluado
  "specGate": "no_approved_spec",   // ok | no_approved_spec | n/a
  "source": "static-hooks"          // marca de procedencia: la regla vive en los hooks
}
```

Ejemplo B — en `main` (la guarda de branch cortocircuita; el spec gate no se evalúa):

```jsonc
{
  "verdict": "blocked",
  "reasons": [
    { "rule": "branch_guard", "label": "edit en main" }
  ],
  "branch": "main",
  "specGate": "n/a",                // n/a en ramas protegidas: la guarda de branch corta antes
  "source": "static-hooks"
}
```

**Lógica reusada (citar `file:line` del grounding):**

- `matchDangerous(command)` — `core/hooks/pre-bash-check.js:73` (sobre el array `DANGEROUS` en `:61`, **9 patrones**, con las etiquetas exactas del source): `--force-reset`, `prisma migrate reset`, `DROP TABLE`, `TRUNCATE`, `DELETE FROM sin WHERE`, `DROP DATABASE`, `dropdb`, `rm -rf /`, `git push --force sin --with-lease`. (Las etiquetas `DELETE FROM sin WHERE` y `git push --force sin --with-lease` son textuales del array; no inventar variantes.)
- `matchForbidden(command, project)` — `core/hooks/pre-bash-check.js:80` (lee `project.rules.forbidden_in_production` como regex).
- `isProductionContext(command, project)` — `core/hooks/pre-bash-check.js:91` (matchea `deploy.production_url` / `deploy.project_id` o env vars `PROD_`/`PRODUCTION_`).
- El cómputo del veredicto sigue la lógica de `main` — `core/hooks/pre-bash-check.js:122-143` (bloqueado si hay match en contexto de producción → `exit 2`; warning si no → `exit 0`). El tool mapea `exit 2 → "blocked"`, `warning → "warn"`, sin match → `"ok"`.
- `getCurrentBranch()` — `core/hooks/pre-edit-check.js:88` (vía `git branch --show-current`).
- Guarda de branch — `core/hooks/pre-edit-check.js:227-236` (bloquea editar código en `main`/`master`, `exit 2`).
- Spec gate — `core/hooks/pre-edit-check.js:239` en adelante: **solo aplica cuando `!PROTECTED_BRANCHES.has(branch)`** (`PROTECTED_BRANCHES` en `:163`); usa `hasApprovedSpec(repoRoot)` / `specIsApproved(content)` — `core/hooks/pre-edit-check.js:178,167` (escanea `docs/specs/*.md` por header `Estado: APPROVED`).

Estas funciones son puras (Node, zero-dep, `parseYamlMinimal` propio en `pre-bash-check.js:20-56`, **no** usan `js-yaml`). **No reimplementar nada**: extraerlas a `core/hooks/lib/guardrails.js` (o equivalente), `require`-eable tanto desde los hooks (que siguen corriendo standalone) como desde el server MCP. Esta extracción es prerequisito y se trata en §7.

### 5.2 `wiki_search`

Propósito: búsqueda textual offline sobre el wiki del proyecto, devolviendo pasajes. Es la **misma capa textual del CLI** (frescura/cache sobre el corpus vivo), no la búsqueda semántica —esa la hace el agente vía el skill `/wiki-query`.

**Input:**

```jsonc
{ "query": "string" }   // texto a buscar; NO es un path
```

**Output** (lista de coincidencias, path **relativo** dentro de `wiki/`, sin exponer rutas absolutas):

```jsonc
{
  "matches": [
    { "page": "concepts/arquitectura.md", "hits": 3, "sample": "primera línea matcheada (80 chars)" }
  ],
  "hint": "Para respuesta con citas, usa el skill /wiki-query",
  "source": "wiki/"
}
```

**Invariante de no-fuga de rutas absolutas (crítico).** En el código actual, `wikiQuery` arma `Match.path` con la ruta **absoluta** del archivo: `matches.push({ path: page, ... })` (`wiki.ts:424`), donde `page` es absoluto; recién al imprimir se convierte a relativo vía `relative(root, m.path)` (`wiki.ts:437`). Si la extracción devolviera `Match[]` tal cual, la tool MCP **filtraría rutas absolutas** (directorio home, layout del proyecto) — exactamente el info-leak que el RFC dice prevenir. Por lo tanto, la extracción de `wiki_search` DEBE mapear `page → relative(wikiRoot(), page)` **antes** de devolver, y la capa MCP nunca debe recibir ni emitir rutas absolutas. Esto se testea: **ningún `match.page` debe empezar con `/` ni contener `..`** (test en `mcp-parity.test.mjs` o un test dedicado). Junto con el invariante anti-symlink de §4.3, esto cierra los dos vectores residuales de §3.2.

**Lógica reusada (citar `file:line`):**

- `wikiQuery(queryArg)` — `packages/cli/src/commands/wiki.ts:376-443`: `collectMarkdown(dir)` recursivo (`wiki.ts:73`) filtrado por `isWikiPage` (`wiki.ts:63`, excluye `raw/`/`_template.md`/control files), substring match case-insensitive (`content.toLowerCase().includes(query)`), conteo de hits por página, orden por hits desc (`matches.sort((a,b)=>b.hits-a.hits)`, `wiki.ts:427`). Nota: en su forma actual `wikiQuery` **imprime a stdout y devuelve `number`**; la extracción debe separar el cómputo (que devuelve datos con `page` relativo) de la impresión.
- Constantes de estructura: `SUBDIRS`/`CONTROL_FILES`/`TEMPLATED_SUBDIRS` en `wiki.ts:37-39`.

Es un grep textual sobre `wiki/*.md`, **corpus confinado** al dir `wiki/`, ya offline/zero-network. El tool **reusa la lógica de `wikiQuery`** (extraída a una función que devuelve datos —con path relativo— en vez de imprimir a stdout). Nota de paridad: el CLI ya delega lo semántico al skill (`wiki.ts:431,441` imprimen la sugerencia del skill `/wiki-query`, en forma neutra). El corpus lo seedea deterministamente `wiki-autogen.ts` (`generateWiki:597`, `buildWikiPages:547` puro sin I/O). Esto confirma que `wiki_search` es **estrictamente aditivo**: el mismo piso `wiki/` que ya consume el skill, solo que consultable desde el loop del agente sin cambiar de herramienta.

---

## 6. Impacto en invariantes y cómo se acota

### 6.1 Cold-start / dep tree liviano

- **Riesgo**: el SDK MCP es la primera dep de runtime (hoy `package.json:49-58` no tiene nada MCP).
- **Cota**: `import()` lazy del SDK, **solo** dentro de `forge mcp` (§4.4). El hot-path `init`/`generate`/`npx` no importa el SDK ni transitivamente. Medible: un test puede verificar que el bundle del hot-path no incluye `@modelcontextprotocol/sdk`. Quien no usa MCP tiene **exactamente el cold-start de hoy**.

### 6.2 Neutralidad multi-runtime

- **Riesgo**: MCP solo lo consumen algunos runtimes (Claude Code vía `claude mcp add`); Kiro/OpenCode/Codex no.
- **Cota**: la regla de oro (§4.1) + el checkpoint de allowlist (§4.1) + el chequeo en `doctor`/`audit` (§4.6). Como nada vive solo en MCP, los runtimes sin MCP **mantienen el piso estático intacto**. La asimetría de registro por-runtime (Claude Code con hooks nativos `init.ts:265-303`; OpenCode/Codex con `.githooks/pre-commit`+`AGENTS.md`; Kiro con `.kiro/hooks/*.json`) ya existe y forge la maneja con fallbacks; MCP **no debe agregar una asimetría de conocimiento**, solo una de *frescura* sobre conocimiento ya compartido —y el checkpoint dispara revisión humana si alguien intenta cruzar esa línea.

### 6.3 Zero-network

- **Riesgo**: un server con HTTP introduce red + auth.
- **Cota**: `stdio-only` en v1 (§4.2). Proceso hijo local, sin socket. HTTP diferido.

### 6.4 Superficie de fuga

- **Riesgo**: tool read-only que lee paths arbitrarios (§3.2), corpus ensanchado por symlink, o fuga de rutas absolutas.
- **Cota**: ningún tool toma path libre (§4.3). `guardrail_status` devuelve veredicto, no archivos; `wiki_search` opera sobre el corpus confinado `wiki/` con input de texto, no de ruta. Más los dos invariantes explícitos: confinamiento anti-symlink del corpus (§4.3) y no-fuga de rutas absolutas con `page` relativo testeado (§5.2).

---

## 7. Primer paso mínimo concreto

**No** empezar por el server. Empezar por la refactorización que el server necesita y que **mejora el código aunque el MCP nunca se construya**:

> **Extraer las funciones puras de guardrail de los hooks a un módulo compartido importable, manteniendo los hooks funcionando standalone.**

Concretamente:

1. Crear `core/hooks/lib/guardrails.js` que **exporte** las funciones puras hoy embebidas: `matchDangerous`, `matchForbidden`, `isProductionContext` (de `pre-bash-check.js:73,80,91`), `getCurrentBranch`, `hasApprovedSpec`, `specIsApproved` (de `pre-edit-check.js:88,178,167`), y `parseYamlMinimal`/`loadProjectYaml` (`pre-bash-check.js:20-56`). Durante esta extracción, **normalizar a tuteo** los strings de cara al usuario que hoy usan voseo ("Ejecutá", "Creá", "cancelá"), o anotar explícitamente que esa normalización queda fuera de alcance (§5, nota de idioma).
2. Cambiar `pre-bash-check.js` y `pre-edit-check.js` para `require('./lib/guardrails.js')` esas funciones, sin alterar su comportamiento standalone (siguen leyendo stdin / devolviendo exit codes). Validar contra los tests existentes (`hook-spec-gate.test.mjs` y compañía).
3. Cubrir el módulo extraído con un test unitario directo (`packages/cli/test/guardrails-lib.test.mjs`, `node --test` como los 16 `*.test.mjs` del harness) que afirme el mapeo veredicto: comando peligroso en prod → `blocked`; fuera de prod → `warn`; limpio → `ok`.

Con eso, `guardrail_status` queda a un `import` de distancia y los hooks quedan más testeables. **El MCP server (entrypoint `forge mcp` + registro de los 2 tools) es el segundo paso, separado**, una vez que la extracción está mergeada y verde. `wiki_search` no requiere extracción mayor: basta separar la parte de cómputo de `wikiQuery` (`wiki.ts:376-443`) de su impresión a stdout, devolviendo `page` **relativo** (§5.2).

---

## 8. Qué NO hacer

- **No exponer lo estático por MCP.** Nada de `get_stack`, `get_architecture`, `get_rules`, `get_conventions`, `list_agents`. Eso ya vive en `CLAUDE.md`/`AGENTS.md`/hooks/`wiki/`. Es cargo-culting y abre el two-tier.
- **No permitir que nada viva solo en MCP.** Todo tool debe tener origen estático identificable (regla de oro, §4.1). El checkpoint de allowlist falla en CI si se agrega un tool sin actualizar la allowlist, forzando revisión humana.
- **No HTTP / no red / no auth en v1.** `stdio-only`. HTTP/remoto se difiere a su propio RFC con modelo de amenazas.
- **No tools que tomen un path libre y lo lean.** Veredictos y corpus confinado, nunca `readFileSync(pathDelCliente)`. Cierra path-traversal del input por construcción.
- **No dejar el confinamiento del corpus librado a accidente.** Invariante anti-symlink explícito (§4.3) y `page` relativo (nunca absoluto) testeado (§5.2).
- **No auto-habilitar ni auto-registrar el MCP.** Opt-in detrás de flag + `claude mcp add` manual. forge nunca lo enchufa solo en `init`/`generate`.
- **No `optionalDependencies` para el SDK.** Modo de fallo silencioso. Bundlear como dep normal con `import()` lazy fuera del hot-path; el error de carga apunta a reinstalar el CLI (`@cristiancorreau/forge`), no a instalar el SDK suelto.
- **No tocar el hot-path con el SDK.** `init`/`generate`/`npx` no deben importar `@modelcontextprotocol/sdk` ni transitivamente. Quien no usa MCP no paga nada.
- **No reimplementar la lógica de guardrails ni la búsqueda del wiki.** Reusar las funciones puras de los hooks y la lógica de `wikiQuery`. Una sola fuente de verdad para las reglas; el MCP es solo otra cara de la misma lógica.
- **No introducir strings con voseo en la salida MCP.** Copy nueva en español neutro (tuteo); normalizar el voseo heredado en la extracción o documentar el descarte (§5, nota de idioma).
- **No empezar por el server.** Primero la extracción a módulo compartido (§7), que vale por sí sola.

---

## Apéndice — referencias de grounding

- Lógica de guardrail (bash): `core/hooks/pre-bash-check.js` — array `DANGEROUS:61` (**9 patrones**), `matchDangerous:73`, `matchForbidden:80`, `isProductionContext:91`, veredicto `main:122-143`, `parseYamlMinimal/loadProjectYaml:20-56`.
- Lógica de guardrail (edit): `core/hooks/pre-edit-check.js` — `getCurrentBranch:88`, `PROTECTED_BRANCHES:163`, guarda de branch `227-236` (`exit 2` en main/master, cortocircuita antes del spec gate), spec gate `239+` (solo si `!PROTECTED_BRANCHES.has(branch)`), `hasApprovedSpec:178`, `specIsApproved:167`.
- Búsqueda del wiki: `packages/cli/src/commands/wiki.ts` — `wikiQuery:376-443` (imprime a stdout, devuelve `number`), `collectMarkdown:73` (`readdirSync({withFileTypes:true})` + `isDirectory()`/`isFile()` en `:76-80`; relevante para el invariante anti-symlink), `isWikiPage:63`, `Match.path` absoluto en `push:424`, conversión a relativo en print `relative(root, m.path):437`, orden `:427`, delegación al skill `:431,441`, constantes `:37-39`.
- Seeding del wiki: `packages/cli/src/lib/wiki-autogen.ts` — `generateWiki:597`, `buildWikiPages:547`.
- Skill semántico: `core/skills/wiki-query/SKILL.md`.
- Dependencias (sin SDK MCP): `packages/cli/package.json:49-58`. Nombre del paquete y bin: `package.json:2` (`@cristiancorreau/forge`), `:22-24` (bin `forge`).
- Metadata de install para MCP de terceros (shape `{slug,command,args,params,env}`): `packages/cli/src/commands/aitmpl-search.ts:116-122` (bajo `src/commands/`, NO `src/lib/`). Bloque `mcp.servers` de `project.yaml` (solo `{name, auto_approve}`): `yaml.ts:94`; migración `migrate.ts:126-128`.
- Registro por-runtime: `init.ts:265-303` (hooks Claude Code), `generate.ts:62-71` (pre-commit OpenCode/Codex), `generate.ts:156-167` (hooks Kiro), `adapters/{codex,opencode}/HOOKS.md`.
- Paridad/doctor/audit: `doctor.ts:210-222`, `audit.ts:278-342`.
- Harness de tests: `package.json scripts.test` lista **16** `*.test.mjs` (`node --test` + `node:assert/strict` + `spawnSync` sobre el CLI compilado). Nota: hay 17 archivos `*.test.mjs` en `packages/cli/test/`, pero `skill-security.test.mjs` no está incluido en el script `test`; el conteo de 16 es el del harness ejecutado en CI.