# RFC-002: Resiliencia de versiones a largo plazo en forge

**Estado:** Borrador para decisión del maintainer
**Fecha:** 2026-06-05
**Audiencia:** maintainer
**Idioma:** español neutro
**Verificación:** Todas las afirmaciones técnicas fueron contrastadas contra el árbol vivo (`packages/cli/src`, `core/`, `profiles/`, `adapters/`, `core/schemas/`). Las citas de archivo y línea son verificadas ejecutando los comandos, no inferidas. Donde el texto dice "corrí la regex" o "conté", el resultado proviene de ejecución real.

> **Relación con RFC-001.** RFC-001 recomendó adoptar *version-awareness* (P2-upfront + P4) como quick-win: parsear el lockfile en `generate` para derivar el major instalado, agregar un campo de versión al schema y enhebrarlo por los cuatro generadores. Este RFC-002 **revisa esa recomendación a la luz de un horizonte de 5 años** y concluye que P4 resuelve el 20% fácil del problema mientras paga un costo que crece para siempre. La propuesta de RFC-002 reemplaza la maquinaria de P4 por una estrategia en capas más barata y más robusta. No contradice las otras cuatro propuestas de RFC-001 (MCP recortado, registro abierto): las complementa.

---

## 1. TL;DR (recomendación priorizada)

1. **Adoptar ya — purga + convención (la capa que sobrevive 5 años).** Eliminar toda aserción de versión mayor de los assets que forge autorea (55 ocurrencias de "Laravel 13" en 12+ archivos, más Livewire 4, Filament 5, Spring Boot 3, SvelteKit 2, Flutter 3, PHP 8.3), y reemplazarlas por una **directiva operativa uniforme**: "lee el manifiesto real (`composer.json`/`package.json`/`pyproject.toml`/`go.mod`) y contrasta los patrones contra el código instalado". Esto elimina la **categoría** de bug, no una instancia. Costo de mantenimiento por cada major bump futuro: **cero**, porque lo que se pudre nunca queda escrito en forge.

2. **Adoptar ya — arreglar el guard (el enforcement que hace real a la convención).** La regla anti-staleness existe (`assets.test.mjs:171-184`) pero su regex es un no-op demostrado: **falla** sobre "Laravel 13" pelado y su scope **excluye** skills y commands. Sin un guard que muerda, la purga del punto 1 se revierte en el próximo PR. Un guard finito y acotado sostiene a forge para todos los frameworks futuros.

3. **Adoptar — capa de detección a tiempo-de-uso (lo que cierra el 80% difícil).** La directiva del punto 1 no es decorativa: le entrega al agente la capacidad —que ya tiene en los 4 runtimes (Read/Bash)— de leer el manifiesto vivo *y* razonar los idioms contra el código que ve. Esto es lo único que toca el 80% difícil ("qué es verdad para esta versión") y lo hace en el momento más fresco posible.

4. **Adoptar — capa de ruteo a fuentes vivas (lo que mitiga el cutoff del LLM).** Para el caso en que el major instalado supera el cutoff de entrenamiento del modelo, forge no debe *autorear* el delta: debe **rutear** a la fuente autoritativa y viva (docs versionadas del framework, `UPGRADE.md` del repo, el MCP del propio framework si existe — p.ej. Boost para Laravel). forge provee el *puntero*, no el *contenido*.

5. **Diferir — la maquinaria de version-awareness en `generate` (P4 de RFC-001).** Parsear el lockfile, agregar campo de versión al schema y enhebrarlo por los 4 generadores resuelve el 20% fácil (leer el número) a costo de un subsistema cross-cutting que se congela en `forge generate` y que reintroduce el split two-tier (hoy las skills se emiten solo para Claude Code; `adapters/kiro` ni existe en disco). No lo descartamos como idea, pero **no debe ir antes** de la convención: sin la purga, la maquinaria solo re-codifica el dato podrido en un campo de schema.

6. **Descartar — autorear deltas por versión dentro de los agentes (el modelo Boost).** Mantener carpetas versionadas (`laravel/13.x/`, `livewire/4.x/`) es `O(frameworks × versiones × runtimes)` y crece cada vez que **cualquiera** de esos 19 frameworks publica un major. forge no tiene el staffing de un vendor único; este camino es deuda no acotada por construcción.

---

## 2. El problema real a largo plazo

### 2.1 El número es el 20% fácil; "qué es verdad para esa versión" es el 80% difícil

Las versiones **siempre** cambian. Laravel 13 → 14, Next 15 → 16, Django 5 → 6, Spring Boot 3 → 4: es churn perpetuo, no un evento. Cualquier diseño que sobreviva 5 años tiene que asumir el churn como constante de fondo, no como caso a parchear.

El error de framing —que comparten tanto la tesis liviana como la maquinaria de RFC-001— es tratar "saber la versión" como **un** problema. Son dos, y de tamaños muy distintos:

- **El 20% fácil: detectar el número.** Leer `"laravel/framework": "^13.0"` de `composer.json`. Es mecánicamente trivial. Un parser de lockfile lo resuelve; un agente con `Read` también.
- **El 80% difícil: saber qué es verdad para ese número.** Que Laravel 13 tiene estructura slim, que no existe `app/Http/Kernel.php`, que el middleware vive en `bootstrap/app.php`, que Sanctum es el default, que los casts se declaran con `casts(): array`, que el CSRF middleware se renombró a `PreventRequestForgery`. Eso es **conocimiento de versión**, y es exactamente lo que se pudre.

Detectar el "13" no te dice nada de esos idioms. Esa es la trampa: ambos lados del debate gastan su energía en el 20% fácil.

### 2.2 Por qué "solo prompt" es insuficiente

La tesis liviana ("es un prompt, no un subsistema": que cada agente diga "última versión estable" y listo) tiene un problema empírico **vivo en el árbol hoy**, y conviene nombrarlo sin piedad porque es el corazón de este RFC:

- La frase "última versión estable" aparece en ~10 perfiles, pero es un **adjetivo en prosa**, no una **instrucción operativa**. Verifiqué con grep: el único agente que efectivamente ordena leer el manifiesto y contrastar es `profiles/wordpress/agents/wp-engineer.md:17,147` (`Verificar con wp core version`). Ninguno de los otros 18 perfiles carga la directiva "lee `composer.json` y contrasta". La corrección de la tesis liviana descansa sobre una instrucción que **no existe** como mecanismo.
- "Solo prompt" sin enforcement **se degrada solo**. Hoy mismo conviven 55 ocurrencias de "Laravel 13" pelado en 12+ archivos forge-owned junto con los ~10 perfiles que dicen "última versión estable". La prosa adjetival no impide que otro asset hardcodee el major.

Conclusión: la tesis liviana es la **dirección** correcta pero, "tal cual", es el peor de dos mundos —ya prohíbe la prosa precisa sin comprar el mecanismo que la reemplazaría.

### 2.3 Por qué "maquinaria en generate" es insuficiente

La maquinaria de P4 (parsear lockfile en `generate`) tiene tres límites estructurales que ningún esfuerzo de ingeniería resuelve:

- **Solo toca el 20% fácil.** Parsea `composer.lock` y aprende "Laravel 13". Después *todavía* tiene que autorear el 80% (los idioms slim/Sanctum/casts) en algún lado —y ese contenido autoreado es justo lo que se pudre. La maquinaria mueve el problema, no lo resuelve.
- **Se congela en `forge generate`.** El snapshot es correcto solo en el instante de la generación. El usuario corre `composer update` de 13 a 14 y el `CLAUDE.md` congelado sigue diciendo 13, sin nada que detecte el drift. forge ya **admite** que el conocimiento embebido decae: `audit.ts:45,146-153` tiene `LAST_VERIFIED_MAX_MONTHS = 6` y emite un warning para que un humano re-verifique a mano. Es decir: forge ya trata su propio conocimiento embebido como un activo que se pudre y necesita niñera humana.
- **Reintroduce el split two-tier.** RFC-001 ya documentó que las skills y el version-wiring se emiten hoy **solo para Claude Code**, y que `adapters/kiro/` ni siquiera está en disco. Un subsistema de version-awareness en `generate` le daría comportamiento de primera clase a 1 de 4 runtimes —exactamente el split que forge existe para eliminar.

Y un costo que nadie debería subestimar: el schema hoy es name-only por diseño (`core/schemas/project.schema.json:78-146`, `additionalProperties:false`, sin campo de versión). Agregar un campo de versión es un cambio de contrato que rompe la invariante "el schema no transporta números" que hoy hace el desync estructuralmente imposible.

---

## 3. Veredicto sobre la tesis del usuario ("es un prompt, no un subsistema")

### 3.1 Steelman (lo más fuerte a favor)

La tesis es más fuerte de lo que su formulación liviana sugiere. Su mejor argumento no es "es barato", es esto:

> **La detección a tiempo-de-uso colapsa el 80% que la maquinaria en `generate` no puede tocar.** La maquinaria lee el número y aún tiene que autorear los idioms; el agente, en cambio, recibe ambas mitades en el momento de uso: lee el manifiesto él mismo *y* razona los idioms contra el código vivo que ve (el `bootstrap/app.php` real, la versión de Filament realmente instalada) con un `Read`/`Bash` que ya tiene en los 4 runtimes. `generate` jamás puede leer el árbol vivo: se congeló meses atrás.

Y tiene respaldo empírico en el propio árbol: la auto-contradicción que forge **envía hoy** prueba que cualquier lugar donde forge escribe un literal de versión se vuelve un pasivo que deriva. `profiles/laravel/agents/api-engineer.md:18` dice "Laravel (última versión estable)" mientras `profiles/laravel/agents/laravel-specialist.md:11,21` hardcodea "Laravel 13" (9 veces) y el dato falsable "salió el 17 de marzo de 2026", y `core/skills/laravel-security/SKILL.md:3` dice "Laravel 13 / PHP 8.3+". Tres assets forge-owned en desacuerdo sobre el mismo proyecto. La tesis elimina la **categoría**: si ningún agente afirma un major en prosa, no hay nada que contradecir. Los ~10 agentes que ya dicen "última versión estable" son la tesis funcionando; los hardcodes del specialist son el bug.

Además, la tesis es la única opción **`O(1)` y multi-runtime-neutral por construcción**: una línea de prompt idéntica en los 19 perfiles y los 4 runtimes, que ya cubre Laravel 14, Next 16 y Django 6 —versiones que todavía no existen— gratis. El precedente Boost (carpetas versionadas `10.x/11.x/12.x/13.x`, Livewire `2.x/3.x/4.x`, Tailwind, Inertia, Pest) es un vendor con equipo de mantenedores; forge es lo opuesto a ese modelo de staffing.

### 3.2 Red-team (dónde se queda corta)

Tres grietas, todas verificadas:

- **"Es un prompt" implica que ya está implementada. No lo está.** Corrí grep de directivas operativas ("lee el composer y contrasta la versión instalada") en `profiles/`, `core/` y `adapters/`: devuelve **vacío** salvo `wp-engineer.md`. "Última versión estable" es un adjetivo, no una orden de re-leer el manifiesto. El `~80% shipped` está sobrevendido: el sustrato (schema + generador name-only) sí está, pero la instrucción operativa está al ~0%.
- **El guard que la haría honesta está roto.** Corrí la regex exacta de `assets.test.mjs:177` contra los strings reales: **MISS** en "Laravel 13", "Laravel 13 / PHP 8.3+", "PHP 8.3 mínimo", "Livewire 4 y Filament 5", "SvelteKit 2", "Flutter 3", "Spring Boot 3". Solo **CATCH** sobre "Laravel 13," —con coma, que no aparece en el specialist (0 ocurrencias). Y el scope del test recorre solo `core/agents` y `profiles/*/agents`: deja fuera por diseño las 5 skills `laravel-*` (laravel-pest 10×, laravel-verify 9×, laravel-security, laravel-mcp, laravel-eloquent) y los 3 commands en `adapters/claude-code/commands/`. El guard es un no-op demostrado.
- **"No subsistema" es un falso binario.** "Prompt vs subsistema" no agota el espacio. Lo que falta no es un subsistema en `generate` —es **enforcement** (un guard de CI) y **ruteo** (un puntero a la fuente viva para el caso cutoff). Eso no es maquinaria de runtime; es convención más CI más una línea de "consultá aquí". La tesis acierta en rechazar la maquinaria pesada pero subestima el andamiaje mínimo que la vuelve durable.

### 3.3 Veredicto

**La tesis es el núcleo correcto, pero no "tal cual".** Es correcta en *qué* eliminar (la prosa que asevera un major) y en *dónde* poner la inteligencia (el agente, a tiempo-de-uso, contra el código vivo). Se queda corta en que no está implementada, su enforcement es teatro, y omite la capa de ruteo para el cutoff. RFC-002 toma el núcleo de la tesis y le agrega las dos capas finitas que la hacen sobrevivir 5 años: **enforcement** y **ruteo a fuentes vivas**.

---

## 4. Opciones evaluadas (scores del panel)

> Escala 0-10. Lentes: **robustez-largo-plazo** (¿sobrevive 5 años de churn sin mantenimiento creciente?), **costo-a-escala** (10 = barato/escala; ¿el costo marginal por major bump tiende a cero?), **multi-runtime + offline** (¿cae idéntico en los 4 runtimes sin red?). Veredictos: recomendar / complementar / diferir / descartar.

### O1 — Solo auto-detección a tiempo-de-uso (la tesis liviana, tal cual)

| Lente | Score |
|---|---|
| robustez-largo-plazo | 8 |
| costo-a-escala | 9 |
| multi-runtime + offline | 9 |

**A favor (verificado):** elimina la categoría de bug, no una instancia. El sustrato ya la favorece —schema name-only con `additionalProperties:false`, generador de interpolación pura (`claude-code.ts:101,125`)— y ~10 de 19 perfiles ya cargan la frase. Costo marginal por major bump: cero.

**En contra (verificado):** no está implementada como directiva operativa (grep = vacío salvo `wp-engineer`), y su guard captura 0 de los 9 strings reales. "Tal cual" es el peor de dos mundos: ya pagó el costo (prohíbe la prosa precisa) sin comprar nada (ningún agente detecta, el guard es no-op).

**Veredicto: complementar.** Es la dirección correcta pero requiere los tres complementos de la propuesta (purga + directiva real + guard arreglado) para pasar de aspiración a mecanismo.

### O2 — Maquinaria de version-awareness en `generate` (P4 de RFC-001)

| Lente | Score |
|---|---|
| robustez-largo-plazo | 4 |
| costo-a-escala | 3 |
| multi-runtime + offline | 4 |

**A favor:** resuelve correctamente el 20% fácil (el número instalado) y lo hace determinista. Para proyectos que nunca corren `composer update` post-generate, el snapshot es exacto.

**En contra:** se congela en `generate` (drift silencioso ante `composer update`); aún tiene que autorear el 80% que se pudre; agrega parser de lockfile + campo de schema (rompe la invariante name-only) + enhebrado por 4 generadores; y emite hoy de forma asimétrica (skills solo en Claude Code, `adapters/kiro` ausente) → split two-tier.

**Veredicto: diferir.** No antes de la convención. Si llega a hacer falta, solo como capa de conveniencia *sobre* assets ya purgados, nunca como sustituto de la detección a tiempo-de-uso.

### O3 — Carpetas versionadas por (framework × versión), modelo Boost

| Lente | Score |
|---|---|
| robustez-largo-plazo | 2 |
| costo-a-escala | 1 |
| multi-runtime + offline | 3 |

**A favor:** precisión máxima por versión; es exactamente lo que Boost hace para Laravel.

**En contra:** `O(frameworks × versiones × runtimes)`. 19 perfiles × N majores × 4 runtimes, re-verificado a mano en cada release de cualquiera de ellos. Boost lo sostiene con un equipo de mantenedores de un vendor único; forge no tiene ese staffing. Deuda no acotada por construcción.

**Veredicto: descartar.** Este es el anti-patrón que la propuesta nombra explícitamente como "qué NO hacer".

### O4 — Estrategia en capas: convención + enforcement + detección + ruteo (PROPUESTA)

| Lente | Score |
|---|---|
| robustez-largo-plazo | 9 |
| costo-a-escala | 9 |
| multi-runtime + offline | 9 |

**A favor:** toma el núcleo `O(1)` de O1 y le agrega las dos capas finitas que faltan —un guard de CI (trabajo acotado que luego vale para todos los frameworks futuros) y un puntero a la fuente viva (una línea, no contenido autoreado). Minimiza el conocimiento de versión que forge autorea (tiende a cero) y maximiza detección + ruteo. Cae idéntica en los 4 runtimes, cero red.

**En contra:** requiere un esfuerzo de migración único real (purgar ~95 strings de versión de 12+ archivos y escribir la directiva que hoy no existe). Es trabajo finito, de una vez.

**Veredicto: recomendar.**

---

## 5. La propuesta recomendada (O4): resiliencia en capas

**Principio rector:** *minimizar el conocimiento de versión que forge debe autorear y mantener; maximizar la detección a tiempo-de-uso y el ruteo a fuentes vivas/autoritativas.* Todo lo que forge escriba como literal de versión es un pasivo futuro. La estrategia ataca eso en cuatro capas, de la más barata/durable a la más situacional.

### Capa 1 — Convención: cero aserciones de versión, detección obligatoria

- **Purgar** toda aserción de versión mayor de los assets que forge autorea: las 55 ocurrencias de "Laravel 13", más "Livewire 4", "Filament 5", "Spring Boot 3", "SvelteKit 2", "Flutter 3", "PHP 8.3" (en los archivos donde el número es una afirmación, no una nota de migración). Alcance: agentes de perfil **y** las 5 skills `laravel-*` **y** los 3 commands —no solo `agents/`.
- **Reemplazar** "última versión estable" (adjetivo) por una **directiva operativa uniforme**, idéntica en los 19 perfiles:

  > "No asumas una versión mayor. Antes de escribir código, lee el manifiesto del proyecto (`composer.json`/`composer.lock`, `package.json`, `pyproject.toml`, `go.mod`, `build.gradle`) y contrasta los patrones que vas a usar contra el código realmente instalado (estructura de carpetas, archivos de bootstrap, paquetes presentes)."

- **Excepción explícita:** los `migration-specialist` / guías de upgrade **sí** referencian versiones específicas, porque ahí el delta entre versiones *es* el contenido. El guard ya los excluye por nombre (`assets.test.mjs:175`); mantener esa exclusión.

### Capa 2 — Enforcement: arreglar el guard para que muerda

- Corregir la regex de `assets.test.mjs:177` para que capture el major **pelado**, no solo el seguido de coma. Propuesta:

  ```js
  /\b(Laravel|NestJS|Rails|Next\.js|Nuxt|Astro|SvelteKit|Livewire|Filament|Spring Boot|Flutter|Django) \d+\b/
  ```

- **Extender el scope** del test a `core/skills/**/SKILL.md` y `adapters/*/commands/**/*.md`, con la misma allowlist de guías de migración. Hoy el test solo recorre `core/agents` y `profiles/*/agents`, dejando fuera precisamente los archivos con más hardcodes.
- Este guard es **finito**: una vez correcto, vale para todo framework futuro sin tocarlo. Es el opuesto de O3.

### Capa 3 — Detección a tiempo-de-uso (cierra el 80% difícil)

- La directiva de la Capa 1 no es decorativa: es la que le ordena al agente usar el `Read`/`Bash` que ya tiene en los 4 runtimes para (a) leer el manifiesto vivo y (b) verificar los idioms contra el código instalado. Esta capa no agrega código a forge: es la consecuencia operativa de la convención. Su robustez viene de que ocurre en el momento más fresco posible —después de cualquier `composer update`, sin paso de regenerate, sin stamp obsoleto.

### Capa 4 — Ruteo a fuentes vivas (mitiga el cutoff del LLM)

- Para el caso en que el major instalado supera el cutoff de entrenamiento del modelo, forge **no autorea el delta**. Rutea al agente a la fuente autoritativa y viva:
  - docs versionadas del framework derivando la URL del major detectado (p.ej. `laravel.com/docs/{major}.x`),
  - el `UPGRADE.md`/`CHANGELOG.md` del repo instalado (leíble con `Read`, cero red),
  - el MCP del propio framework si existe y está configurado (Boost para Laravel) — **opt-in**, nunca requerido.
- forge provee el **puntero**, no el **contenido**. El puntero es estable a través de versiones (la plantilla de URL no cambia cuando sale el major siguiente); el contenido vive donde se mantiene solo.

### Qué NO hacer (explícito)

- **No autorear deltas por versión dentro de los agentes.** Nada de carpetas `laravel/13.x/`, `livewire/4.x/`. Eso es `O(frameworks × versiones × runtimes)` y se pudre. Es la trampa de O3.
- **No agregar un campo de versión al schema.** Romper el contrato name-only (`additionalProperties:false`) reintroduce el dato que hoy es estructuralmente imposible desincronizar.
- **No construir un subsistema de version-awareness en `generate` antes de la convención.** Sin la purga, la maquinaria solo re-codifica el dato podrido en un campo. Diferido, no prohibido.
- **No agregar red al path de `generate`.** El ruteo de la Capa 4 entrega *punteros* que el agente resuelve a tiempo-de-uso; `generate` sigue zero-network.

### Por qué esta combinación sobrevive 5 años

El churn de versiones se vuelve problema de otro: del LLM, a tiempo-de-uso, contra ground truth (el manifiesto y el código instalado). Lo único que forge mantiene es **finito y agnóstico de versión**: una convención, un guard de CI, una plantilla de URL. Laravel 14, Next 16 y Django 6 ya están cubiertos sin escribir una línea más.

---

## 6. Primer paso mínimo (qué mergear esta semana)

Un solo PR, barato, verificable, que entrega valor inmediato y no requiere las otras capas para ser correcto:

**PR: "fix(assets): guard real anti-staleness de versiones".**

1. **Arreglar la regex** de `packages/cli/test/assets.test.mjs:177` para capturar el major pelado (ver Capa 2). Esto **fallará** de inmediato sobre los assets actuales —es la prueba de que ahora muerde.
2. **Extender el scope** del test a `core/skills/**/SKILL.md` y `adapters/*/commands/**/*.md`, manteniendo la exclusión de `migration-specialist` y guías de upgrade.
3. **Purgar el peor ofensor** para que el test pase: `profiles/laravel/agents/laravel-specialist.md` (15 ocurrencias de "Laravel 13" + el factoide falsable "salió el 17 de marzo de 2026"), reemplazando los literales por la directiva de detección de la Capa 1.

Por qué este primer paso y no otro: convierte el guard de teatro en mecanismo (rojo → fuerza la purga), ataca el archivo con más hardcodes y la contradicción más visible, y deja el resto de la purga (las skills, los otros perfiles) como trabajo incremental que el guard ya rojo va a empujar PR a PR. Es la inversión mínima que vuelve irreversible la dirección correcta.

---

## Apéndice — Evidencia verificada en el árbol vivo

- **Contradicción viva:** `profiles/laravel/agents/api-engineer.md:18` ("Laravel (última versión estable)") vs `profiles/laravel/agents/laravel-specialist.md:11,21` ("Laravel 13" ×9 + "salió el 17 de marzo de 2026") vs `core/skills/laravel-security/SKILL.md:3` ("Laravel 13 / PHP 8.3+").
- **Guard no-op:** corrí la regex de `assets.test.mjs:177` contra 9 strings reales → MISS en 8 (incluido "Laravel 13" pelado), CATCH solo en "Laravel 13," (con coma, 0 ocurrencias en el specialist).
- **Scope del guard:** el test recorre solo `core/agents` y `profiles/*/agents` → excluye 5 skills `laravel-*` (40+ menciones combinadas) y 3 commands.
- **Conteo:** 55 ocurrencias de "Laravel 13" en 12+ archivos forge-owned (`laravel-specialist.md` 15, `laravel-pest/SKILL.md` 10, `laravel-verify/SKILL.md` 9, `laravel-test-engineer.md` 6, `laravel-security/SKILL.md` 6, `laravel-mcp/SKILL.md` 6, `laravel-eloquent/SKILL.md` 5, etc.).
- **Directiva detect-and-verify:** grep en `profiles/`, `core/`, `adapters/` → solo `profiles/wordpress/agents/wp-engineer.md:17,147` la tiene como instrucción operativa; el resto usa "última versión estable" como adjetivo.
- **Schema name-only:** `core/schemas/project.schema.json:78-146` — enums de nombre puro, `additionalProperties:false`, sin campo de versión.
- **Generador name-only:** `packages/cli/src/lib/generators/claude-code.ts:101,125` — interpolación pura (`- **Backend**: ${backendStr}`), sin conocimiento de versión.
- **forge ya trata el conocimiento embebido como decaying:** `packages/cli/src/commands/audit.ts:45,146-153` — `LAST_VERIFIED_MAX_MONTHS = 6` con warning de re-verificación manual.
- **Zero-network:** las únicas coincidencias de "axios"/"fetch" en `src` son string literals de catálogo (`wiki-autogen.ts:433`), no llamadas de red.
