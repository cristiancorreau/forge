# SPEC-038 `forge adopt` — onboard forge into an existing codebase

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-04 | Actualizada: 2026-06-04

## Contexto

`forge init` está pensado para proyectos nuevos (greenfield): lanza un wizard
interactivo que pregunta el stack y arma `project.yaml` desde cero. Pero la
mayoría de los repos donde se quiere adoptar forge ya existen (brownfield):
tienen `package.json`/`pyproject.toml`, un árbol `src/`, dependencias, scripts y
un README. Forzar al usuario a re-tipear todo en un wizard es fricción
innecesaria y propenso a errores.

Falta un comando que **lea** el proyecto existente, deduzca su configuración por
análisis estático y la materialice automáticamente, dejando el repo listo para
trabajar con agentes — incluyendo una primera versión **factual** del wiki para
que el conocimiento del proyecto no arranque vacío.

Sin esto, el onboarding de un repo existente es: correr `init`, re-responder el
wizard a mano, y empezar el wiki desde cero.

## Decisión

Agregar `forge adopt [path]`:

1. **Análisis (`lib/project-analysis.ts`, puro + testeado).**
   `analyzeProject(root): ProjectAnalysis` lee el directorio objetivo (sin LLM):
   - nombre/descripción (package.json, pyproject.toml, composer.json, Gemfile,
     go.mod),
   - stack vía `detect.ts` (framework backend/frontend + lenguaje por lado, ORM,
     testing, monorepo, docker),
   - dependencias (top deps), scripts,
   - mapa de directorios top-level (dir → nº de archivos + extensiones
     dominantes),
   - archivos clave presentes (README, manifests, Dockerfile, CI, .env.example),
   - entrypoints aproximados (main/bin/index/app),
   - git remote + branch si está disponible,
   - `project.type` derivado (frontend | backend | fullstack).
   Robusto ante archivos faltantes: nunca lanza, degrada.

2. **Auto-wiki (`lib/wiki-autogen.ts`, puro + testeado).**
   `generateWiki(analysis, root)` puebla `<root>/wiki/` sobre la estructura
   existente (index.md, log.md, raw/, concepts/, entities/, sources/,
   synthesis/) con frontmatter y `[[wikilinks]]` correctos:
   - `raw/`: copia README + manifest primario como fuentes inmutables fechadas.
   - `sources/`: una página por archivo fuente clave resumiendo los HECHOS.
   - `entities/`: una página del proyecto + una por framework/herramienta/dep
     mayor detectada.
   - `concepts/`: `arquitectura.md` (del mapa de dirs) y `stack.md` (lenguajes y
     frameworks por lado).
   - `synthesis/`: `overview.md` — overview factual + nota explícita
     "Pendiente: compilación semántica con /wiki-ingest".
   - `index.md`: poblado con todas las páginas (tablas por sección).
   - `log.md`: entrada de autogen (append-only).
   Todo el contenido es FACTUAL. El wiki generado pasa `forge wiki lint`.

3. **Comando (`commands/adopt.ts`).**
   Flujo: resolver target (default cwd) → `analyzeProject` → imprimir resumen
   detectado → generar `project.yaml` (reusa `buildProjectYaml` + lenguaje por
   lado v2.16 + `project.type`; no-interactivo por defecto) → instalar config de
   forge **reusando los installers de init** (agents por modo, hooks, slash
   commands, CLAUDE.md, settings.json, architecture.rules, manifest `.forge`) sin
   pisar archivos existentes salvo `--force` → auto-generar el wiki (salvo
   `--no-wiki`) → imprimir resumen + NEXT STEPS (`/wiki-ingest`, `forge audit`,
   `forge panel`).
   Flags: `--yes` (default no-interactivo), `--no-wiki`, `--runtime <r>`,
   `--mode <m>`, `--force`, `--dry-run`.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Extender `init` con `--adopt` | menos superficie | mezcla flujos green/brownfield, wizard vs no-prompt | claridad: comando dedicado |
| Wiki semántico en el CLI | wiki "completo" de una | el CLI no entiende lógica de negocio; inventaría comportamiento | el CLI sólo siembra hechos; `/wiki-ingest` compila la semántica |
| Re-escribir installers en adopt | independencia | duplica lógica, diverge de init | reusar los installers exportados de init |

## Criterios de aceptación

- [x] `analyzeProject(root)` devuelve stack/type/estructura correctos para un
      fixture TS fullstack y uno Python backend; nunca lanza ante archivos
      faltantes.
- [x] `generateWiki` produce las páginas esperadas y el wiki pasa
      `forge wiki lint` (sin links rotos ni huérfanos).
- [x] `forge adopt --yes <fixture>` escribe un `project.yaml` que pasa
      `forge validate`, instala `.claude/` + `CLAUDE.md` + manifest, y un `wiki/`
      poblado.
- [x] `--dry-run` no escribe nada.
- [x] Re-ejecutar es idempotente: respeta archivos existentes sin `--force`.
- [x] `adopt` está en el router de `cli.ts` y en el HELP con un ejemplo.
- [x] `forge init` mantiene su comportamiento idéntico (installers reusados).
- [x] `npm run build:all && npm test` en verde (incl. tests existentes).

## Impacto de compliance

- No aplica. `adopt` no maneja PII ni datos de usuarios; sólo lee archivos de
  configuración del repo y escribe scaffolding local.

## Dependencias

- Reusa `lib/detect.ts` (lenguaje por lado, v2.16), `lib/wizard-flow.ts`
  (`deriveProjectLanguage`, `inferProjectType`), `commands/init.ts` (installers
  exportados), `commands/wiki.ts` (`scaffoldWikiStructure`), `lib/lock.ts`
  (manifest).

## Notas de implementación

- El wiki autogenerado es **factual** (derivado del análisis estático): no
  inventa comportamiento. La capa semántica (lógica de negocio, decisiones de
  arquitectura) la compila `/wiki-ingest` sobre las fuentes sembradas en
  `raw/` — `adopt` lo apunta explícitamente como próximo paso.
- Heurísticas de análisis: la detección de framework depende de `detect.ts`
  (cobertura por lenguaje limitada a lo soportado por el wizard). Lenguajes no
  cubiertos degradan a un análisis mínimo (nombre + estructura + scripts).
- Los installers se exportan desde `init.ts` sin cambiar su firma ni su
  comportamiento; `init` sigue usando exactamente los mismos.
