# RFC: Qué tomar de Laravel 13 / Boost para fortalecer forge

**Estado:** Borrador para decisión del maintainer
**Fecha:** 2026-06-05
**Verificación:** Todas las afirmaciones técnicas fueron contrastadas contra el código real en `packages/cli/src`, `core/`, `profiles/` y `adapters/`. Las citas de archivo y línea son verificadas, no inferidas.

---

## 1. TL;DR

- **Adoptar ya (quick win, alto valor, cero red):** reconciliar las contradicciones de versión que forge **ya envía hoy** y derivar el major instalado desde el lockfile. Es un bug de correctitud en producción, no una feature especulativa. Propuesta **P2-upfront** + **P4**.
- **Adaptar, con alcance recortado:** un servidor `forge mcp` propio (stdio) **solo** para las superficies genuinamente dinámicas/consultables (`guardrail_status`, `wiki_search`). El resto de la introspección ya la cubren `panel` y `doctor`. Propuesta **P1-mcp**.
- **Adaptar, v1 mínimo:** `forge add owner/repo@sha` reutilizando el manifest SHA-256 existente, con red **opt-in** y limitado a un solo comando. Hosting/ranking/auditoría son v2 diferible. Propuesta **P3-registry**.
- **Diferir:** el modelo formal "Skills on-demand en los 4 runtimes". La mitad on-demand **no existe** para OpenCode/Codex/Kiro y `adapters/kiro/` ni siquiera está en disco. Construir esa paridad es trabajo per-runtime no declarado.
- **Descartar:** copiar Boost tal cual (vector search nativo, embeddings de docs, Tinker/route inspector). Su valor matador es estado **dinámico de runtime** que forge no tiene; transplantarlo a config estática serializable no rinde.

**La regla de oro de este RFC:** todo lo que adoptemos debe respetar las dos invariantes más fuertes de forge — **neutralidad multi-runtime** (los cuatro adapters generan config nativa desde `project.yaml`) y **offline / zero-network** (cero `fetch`/`axios` en `src`; las únicas coincidencias son strings del catálogo). Cualquier propuesta que rompa una de las dos paga un costo que debe justificarse explícitamente.

---

## 2. Qué es Laravel 13 + Boost y qué nos enseña

Laravel 13 (marzo 2026, "the clean stack for Artisans and agents") es **agent-native** por diseño:

- **AI SDK estable**, provider-agnostic (texto, agentes con tool-calling, embeddings).
- **`laravel/mcp`**: construir servidores MCP como apps Laravel, con tools modeladas como **clases**, expuestas por stdio o HTTP.
- **Vector search nativo** (pgvector) y **JSON:API resources**.
- **Laravel Boost**: un servidor MCP con 15+ tools que exponen el interior de la app concreta al agente — Application Info, Database Schema, Database Queries, Route Inspector, Artisan, Tinker, Config, Documentation Search (version-aware, 17k+ piezas con embeddings), Error/Browser logs.
- **Boost 2.0** mueve "from static guidelines to modular skills": **Guidelines** (upfront, broad, compuestas desde los paquetes **instalados y sus versiones**) vs **Skills** (on-demand, modulares por dominio), con un **registro** (`skills.laravel.cloud`) que instala por slug (`boost:add-skill owner/repo`) y rankea por "most installed".

**Qué nos enseña (lo transferible):**

1. **Version/package-awareness es correctitud, no lujo.** Boost compone sus guidelines desde lo que está realmente instalado. forge hoy hace lo contrario: ver §4 P2/P4.
2. **El protocolo MCP (stdio) es runtime-neutral por construcción** — es un protocolo, no un formato. Eso encaja con la filosofía de forge mejor que cualquier formato propietario.
3. **El precedente Boost rinde sobre estado DINÁMICO** (schema vivo de DB, rutas, Tinker, docs embebidas version-aware). Esta es la lección crítica y a la vez la **advertencia**: Boost brilla donde el dato cambia en runtime. **forge no tiene análogo** — su meta-estado (project.yaml, agentes activos, stack, architecture.rules) es config estática trivialmente serializable, y forge **ya la vuelca** a `CLAUDE.md`/`AGENTS.md` en cada `generate`. Copiar el mecanismo sin copiar el tipo de dato es cargo-culting.

---

## 3. La tensión multi-runtime: MCP runtime-específico vs neutralidad de forge

La identidad de forge es la **capa de Distribution**: `generate` emite **texto verbatim** a disco. Verificado: cada generador tiene firma `(config: ProjectYaml) => string` (`generateClaudeMd` en `claude-code.ts:89`), y `generate.ts:135/141/148` hace `writeFile(path, generateXxxMd(config))`. El enum de runtimes está **hard-capeado en 4** (`project.schema.json:158`: `["claude-code","opencode","codex","kiro"]`).

Un servidor MCP es **otra clase de artefacto**: un proceso stdio de larga vida con un SDK, no un `.md`. Esto crea una tensión real y un riesgo de **bifurcación en dos niveles** ("two-tier"): runtimes con daemon vivo vs runtimes con `CLAUDE.md` estático. Eliminar exactamente ese two-tier es buena parte de la razón de existir de forge.

**Cómo resolverla (tres principios):**

1. **El protocolo, no el producto.** MCP-stdio es *protocolo, no formato* — lo más neutral que existe. Pero su **distribución** neutral no es gratis: registrar el server en cada runtime exige wiring per-runtime (`.mcp.json` para Claude Code, `config.toml` para Codex, bloque OpenCode, settings Kiro). El framing "thin adapter / toca generate ZERO" omite ese costo. **Veredicto: el server es barato; su registro neutral es ~4x y debe estar en-scope, no en nota al pie.**
2. **Live-vs-frozen es el único discriminador válido.** Si un dato es config estática, ya está en `CLAUDE.md` fresco-en-generate y un tool MCP solo lo re-entrega tras un round-trip. Solo justifica un tool MCP el dato que **no se puede congelar bien en markdown**: estado computado por hooks (`guardrail_status`) y búsqueda (`wiki_search` es mejor como query que como dump). Eso son 2 de 5 tools propuestos.
3. **Offline es load-bearing y debe preservarse.** `@modelcontextprotocol/sdk` **no está instalado** (verificado: cero en `node_modules`, solo strings en `aitmpl-search.ts`). Las deps actuales son 8 paquetes (`@clack/prompts`, `@opentui/core`, `ajv`, `ajv-formats`, `boxen`, `chalk`, `js-yaml`, `listr2`). Matiz honesto: `@opentui/core` ya es pesado, así que "zero-dep purista" es parcialmente falso; pero **zero-network sí es real** y un server stdio no hace llamadas de red — no rompe offline. El costo real es el **árbol transitivo del SDK en el cold-start de `npx` del 100% de usuarios** para beneficiar solo al subset opt-in. Mitigación: `optionalDependencies` o carga **lazy**.

---

## 4. Las 5 propuestas

> Escala de scores: cada lente reporta `impact / effort / fit`. **Effort: alto = barato** (convención del panel). Veredictos: adoptar / adaptar / diferir / descartar.

### P1 — Servidor MCP de forge (introspección del proyecto)

**Resumen.** Exponer el interior de forge al agente vía un servidor MCP stdio, espejando lo que Boost hace para Laravel. Los datos ya existen como funciones in-process: `loadProjectYaml` (`yaml.ts:120`), `detectStack` (`detect.ts:44`), `listCatalogProfiles/Agents` (`catalog.ts:42/52`), la búsqueda offline de wiki (`.includes`/`toLowerCase`), los hooks que computan estado vivo (`pre-bash-check.js:80-126`: `matchForbidden`/`isProductionContext`), y `ForgeManifest` (`lock.ts:5`). El slot `mcp.servers` está tipado (`yaml.ts:94`) y en schema (`project.schema.json:342`) pero **ningún generador lo consume** (verificado: grep en `lib/generators/` = 0). Es config inerte: deuda real.

**Mejor argumento a favor.** *Reuse, not new behavior.* Cada tool nombrado ya es una función shippeada que corre hoy. El server es un adaptador delgado de lectura; el único trabajo net-new es el SDK, un entrypoint, schemas y tests; toca `generate`/`init`/`audit` en **cero**. Y activa un slot muerto que es deuda real.

**Mejor argumento en contra.** *Duplica config que ya funciona.* Casi todo lo que el server expondría (project.yaml, manifest, agentes/skills activos, stack, architecture.rules) es meta-estado **estático** que forge ya envía como `CLAUDE.md`/`AGENTS.md`/Kiro steering. El server re-entrega el mismo dato tras un round-trip y un proceso de larga vida. El precedente Boost **no transfiere**: Boost gana en estado dinámico (DB viva, Tinker, rutas) que forge no tiene. Además, `forge panel` (`panel-data.ts`) y `runDoctor()` (`doctor.ts:40`, sondea runtimes en vivo con `spawnSync`) ya entregan la introspección humana.

**Veredicto del panel.**

| Lente | impact | effort | fit | veredicto |
|---|---|---|---|---|
| impacto-en-forge | 4 | 4 | 3 | **diferir** |
| encaje-filosófico-y-multi-runtime | 5 | 6 | 5 | **adaptar** |
| esfuerzo-y-riesgo | 5 | 6 | 5 | **adaptar** |

Mayoría **adaptar** (2 de 3), con una disidencia fuerte hacia diferir. La disidencia tiene razón en que el valor marginal sobre `panel`/`doctor`/`CLAUDE.md` es bajo para datos estáticos; los dos votos adaptar tienen razón en que el protocolo es neutral y la ingeniería de lectura es genuinamente aditiva.

**Recomendación de alcance.** **Adaptar, recortado.** Construir `forge mcp` (stdio) **solo** con los 2 tools que baten a markdown: `guardrail_status` (estado computado por hooks) y `wiki_search` (query, no dump). Dejar la introspección estática en `generate`. Condiciones duras: (a) el SDK como `optionalDependencies` o **lazy-load**, para que no lo pague el cold-start de los no-MCP; (b) el registro per-runtime (`.mcp.json` + Codex `config.toml` + OpenCode + Kiro) tratado como trabajo **explícito en-scope**; (c) **no** convertirlo en un artefacto nuevo emitido por los cuatro generadores — eso reintroduce el two-tier. Si la demanda no aparece, diferir es aceptable: no hay urgencia.

---

### P2 — Dos niveles: Guidelines (upfront, version-aware) vs Skills (on-demand)

**Resumen.** Formalizar el modelo de Boost 2.0: guidelines upfront compuestas desde la versión detectada, vs skills modulares on-demand. El valor real está **verificado y es un bug que ya enviamos**: cinco assets de forge se contradicen sobre el mismo proyecto. `core/skills/laravel-security/SKILL.md:3` dice "Laravel 13 / PHP 8.3+"; `profiles/laravel/agents/api-engineer.md:17-18` dice "PHP 8.2+ / Laravel (última versión estable)"; `fullstack-engineer.md:17` dice "PHP 8.2+". El placeholder "última versión estable" aparece en **10 profiles** (`grep` = 10 archivos). Atar el bloque de guidelines a la versión resuelta del lockfile convierte una contradicción silenciosa en una única fuente de verdad.

**Mejor argumento a favor.** forge **ya envía el bug exacto** que esto arregla: su skill `laravel-security` bundleado está hardcodeado a "Laravel 13 / PHP 8.3+" mientras su profile `fullstack-engineer` dice "PHP 8.2+ / última versión estable" — dos assets propiedad de forge que se contradicen y no están atados al lockfile real del usuario.

**Mejor argumento en contra.** La mitad on-demand **no existe** para 3 de los 4 runtimes. Verificado: `installSkill` (`catalog-install.ts:411-422`) copia el slash command **exclusivamente** de `adapters/claude-code/commands/`; ningún generador referencia skills (grep = 0); `adapters/opencode` y `adapters/codex` solo tienen 6 commands cada uno y **`adapters/kiro/` no existe en disco**. "Formalizar guidelines vs skills" no es formalizar una capacidad existente: es ingeniería per-runtime net-new más un adapter Kiro inexistente. Además dos claims del proponente son falsos: detect.ts **no** extrae versión (`detect.ts:156`: solo `'laravel/framework' in composer.require`, chequeo de presencia; los lockfiles en `:54-55` se leen solo para elegir package manager), y el schema `stack` es `additionalProperties:false` con enums fijos y **cero campo de versión** (`project.schema.json:78-125`).

**Veredicto del panel.**

| Lente | impact | effort | fit | veredicto |
|---|---|---|---|---|
| impacto-en-forge | 7 | 4 | 6 | **adaptar** |
| encaje-filosófico-y-multi-runtime | 6 | (parcial) | — | **adaptar** |

**Recomendación de alcance.** **Adaptar, partir en dos.**
- **Construir ya la mitad upfront/version-aware** (alto valor, offline, sin MCP, neutral): escribir el parser de lockfile (no existe — trabajo real, no "wiring trivial"), agregar el campo de versión al schema `stack`, threadearlo por los generadores, y **reconciliar `SKILL.md` vs profiles** para que el placeholder "última versión estable" y los literales contradictorios desaparezcan. Esto se solapa con P4 y debe hacerse junto.
- **Diferir la mitad "skills on-demand en los 4 runtimes"** hasta que existan los adapters de skills para OpenCode/Codex/Kiro. Hoy es ficción para 3 runtimes.

---

### P3 — Registro abierto / instalación por slug desde repos externos

**Resumen.** Espejo del `skills.laravel.cloud`: instalar items por slug desde repos externos. forge hoy **no** tiene `forge add` ni instalación desde repos externos (verificado: cero en `commands/`), pero **sí** tiene las dos piezas caras: el punto de dispatch de instalación (`installItem` en `catalog-install.ts`) y el manifest SHA-256 reversible (`lock.ts`: `createHash('sha256')`, `ForgeManifest.files[].sha256`, usado por `update`/`teardown`).

**Mejor argumento a favor.** *Barato en el core, caro solo en la cola diferible.* v1 es solo `forge add owner/repo@sha`: git-fetch a staging, validar contra el schema/installer existente, reusar el instalador surgical-yaml + `copyFileSync`, y registrar source+hash en el manifest para uninstall limpio y detección de tampering. Hosting, ranking y auditoría son **v2 puro**. forge gana distribución comunitaria estilo Boost sin abandonar offline-by-default: la red es opt-in, gateada al único comando `add`.

**Mejor argumento en contra.** *La distribución es estructuralmente desigual a nivel de código.* `installSkill` copia slash commands per-item **solo para Claude Code** (`catalog-install.ts:411-421`); los generadores de codex/kiro/opencode no emiten commands per-item. Un registro abierto de items instalables solo puede dar UX de primera clase a **1 de 4 runtimes** — amplifica la violación de neutralidad en vez de honrarla. Y npm + el modelo bundled/SHA-256 ya resuelve distribución curada offline, con versionado y rollback, sin un trust boundary hosteado.

**Veredicto del panel.** Inferido del cuerpo de la evidencia (los scores explícitos de P3 quedaron truncados en el material; me apoyo en pro/con verificados): **adaptar** para v1, **diferir** la cola hosteada.

**Recomendación de alcance.** **Adaptar, v1 mínimo y honesto.** Construir solo `forge add owner/repo@sha`: red opt-in gateada a `add`, validación contra el schema existente, registro source+hash en el manifest para teardown reversible y tamper-detection. **Descartar de v1** cualquier hosting/ranking/"most installed"/trust boundary. **Pre-requisito honesto:** la desigualdad de distribución per-runtime (1/4) es la misma deuda que P2-on-demand; no prometer UX de primera clase para los 4 runtimes hasta que esa emisión exista.

---

### P4 — Awareness de versiones de paquetes instalados

**Resumen.** El problema de versión (gemelo de P2-upfront). forge hoy no tiene awareness de versiones: `detect.ts` lee los manifests pero **descarta el string de versión que tiene en la mano** (`detect.ts:156` chequea presencia de clave, nunca extrae `composer.lock`/`package-lock` para versión). El schema `stack` no tiene campo de versión (`project.schema.json:78-125`, `additionalProperties:false`).

**Mejor argumento a favor.** El problema ya está semi-resuelto en infraestructura: `detect.ts` ya abre `composer.json`/`package.json`, ya elige package manager desde los lockfiles. Falta solo extraer y persistir el major. Es la base mecánica de P2 y elimina los placeholders "última versión estable" con un dato real y verificable, 100% offline.

**Mejor argumento en contra.** No es "aditivo build-time": es cross-cutting. Requiere **parser de lockfile nuevo** (composer.lock/package-lock — no existe hoy), **nuevos campos de schema**, y **threading por cada generador** (`claude-code.ts:122-128` hoy hardcodea el bloque Stack con interpolación simple). Es trabajo estructural acotado pero real.

**Recomendación de alcance.** **Adoptar, fusionado con P2-upfront.** Tratar P2-upfront y P4 como **un solo entregable**: parser de lockfile → campo de versión en schema → threading a generadores → reconciliación de literales en `SKILL.md`/profiles. Es el quick win de mayor ratio valor/riesgo de todo el RFC: offline, sin MCP, sin nueva clase de artefacto, neutral por construcción, y arregla un bug que ya enviamos a producción.

---

### P5 — (no especificada en el material recibido)

El material de debate entregado describe explícitamente cuatro propuestas con scores (P1-mcp, P2-guidelines, P3-registry, P4-version-aware); el cuerpo de P4 y una eventual quinta quedaron **truncados** en el input. Para no inventar veredictos sobre evidencia que no pude verificar, **no emito recomendación sobre una P5**. Si la quinta propuesta es "adoptar vector search / embeddings de docs estilo Boost", mi posición preliminar — basada en §2 — es **descartar**: su valor depende de estado dinámico y de un corpus version-aware de 17k+ piezas que forge no tiene, y agregaría un índice vectorial pesado que rompe el perfil offline/lean sin un caso de uso que `wiki_search` offline no cubra ya.

---

## 5. Roadmap priorizado

### Quick wins primero (orden de ejecución)

1. **[ADOPTAR] P2-upfront + P4 fusionados — version/package-awareness.**
   Parser de lockfile (composer.lock/package-lock) → campo de versión en schema `stack` → threading a los 4 generadores → reconciliar literales contradictorios en `core/skills/laravel-security/SKILL.md`, `profiles/*/agents/*.md` (eliminar "última versión estable" donde haya dato real). Offline, neutral, arregla bug en producción. **Máxima prioridad.**

2. **[ADAPTAR] P3-registry v1 — `forge add owner/repo@sha`.**
   Reusar `installItem` + `lock.ts` (SHA-256). Red opt-in gateada al comando. Sin hosting/ranking. Resuelve distribución comunitaria respetando offline-by-default.

3. **[ADAPTAR] P1-mcp recortado — `forge mcp` con 2 tools.**
   Solo `guardrail_status` + `wiki_search`. SDK como `optionalDependencies`/lazy. Registro per-runtime en-scope. **No** emitir como artefacto desde los generadores. Hacer solo si hay señal de demanda; diferir es aceptable.

### Diferir (no ahora, no nunca)

- **P2 mitad "skills on-demand en los 4 runtimes"**: bloqueado por la falta de emisión de skills en OpenCode/Codex y la **inexistencia de `adapters/kiro/`**. Construir primero esa paridad (deuda separada) antes de formalizar el modelo de dos niveles.
- **P3 cola hosteada** (registro hosteado, ranking "most installed", auditoría, trust boundary): v2, solo si la comunidad lo pide.

### Descartar

- **Copiar Boost literal**: Database Schema/Queries, Route Inspector, Tinker, Artisan, vector search nativo + embeddings de docs version-aware. Todo eso vive de **estado dinámico de runtime** que forge no posee. Transplantarlo a meta-estado estático serializable no rinde y rompe el perfil offline/lean.
- **Cualquier versión "amplia" de P1** que emita el server MCP como quinto artefacto desde los cuatro generadores: reintroduce exactamente el two-tier ("runtime con daemon vivo" vs "runtime con `.md` estático") que forge existe para eliminar.

---

## Apéndice: hechos verificados (archivo:línea)

| Claim | Verificación |
|---|---|
| MCP SDK no instalado | `node_modules/@modelcontextprotocol` ausente en root y en cli; solo strings en `aitmpl-search.ts` |
| Slot `mcp.servers` inerte | Tipado en `yaml.ts:94` + `project.schema.json:342`; consumo en `lib/generators/` = 0 |
| Generadores emiten string verbatim | `generateClaudeMd(config): string` (`claude-code.ts:89`); `generate.ts:135/141/148` |
| Enum runtimes hard-capeado en 4 | `project.schema.json:158` |
| detect.ts descarta versión | `detect.ts:156` solo `'laravel/framework' in composer.require`; lockfiles `:54-55` solo para package manager |
| Schema stack sin campo versión | `project.schema.json:78-125`, `additionalProperties:false`, enums fijos |
| Contradicción de versión enviada | `laravel-security/SKILL.md:3` ("Laravel 13 / PHP 8.3+") vs `profiles/laravel/agents/fullstack-engineer.md:17` ("PHP 8.2+") vs `api-engineer.md:18` ("última versión estable") |
| "última versión estable" en profiles | 10 archivos (`grep -rln`) |
| installSkill solo Claude Code | `catalog-install.ts:411-422` copia solo de `adapters/claude-code/commands/` |
| adapters/kiro no existe | `adapters/` contiene solo `claude-code`, `codex`, `opencode` |
| Hooks computan estado vivo | `pre-bash-check.js:80-126` (`matchForbidden`, `isProductionContext`) |
| panel/doctor ya introspectan | `panel-data.ts` (skills/stack/agentes activos); `doctor.ts:40` `runDoctor()` con `spawnSync` |
| Manifest SHA-256 reversible | `lock.ts:3/9/27` (`createHash`, `ForgeManifest.files[].sha256`) |
| Cero llamadas de red en src | sin `fetch`/`axios`/`https` en `src`; deps = 8 paquetes |
