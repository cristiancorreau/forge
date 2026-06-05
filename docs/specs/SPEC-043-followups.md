# SPEC-043 Follow-ups: profiles enum, debug detection, forge update, vsce/windows docs

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-04 | Actualizada: 2026-06-04

## Contexto

Cinco follow-ups acumulados tras la migración a CLI TS (v3.x) que conviene cerrar
en un PR coherente:

- **#71** — El enum de `agents.profiles` en `core/schemas/project.schema.json` se
  mantiene a mano y quedó desincronizado: omite `laravel` y `wordpress`, que
  existen como profiles desde hace tiempo. Un `project.yaml` con esos profiles
  **falla `forge validate`**.
- **#72** — El hook `core/hooks/pre-edit-check.js` no detecta sentencias de debug
  para los lenguajes agregados en v2.18/v2.19 (Java/Kotlin, Rust, Dart). Los
  agentes Tier 2 nuevos referencian esa detección pero el hook no la implementa.
- **#75** — No existe `forge update`: una instalación de forge en un proyecto no
  puede actualizar la config gestionada (agentes, hooks, slash commands) a la
  versión actual del catálogo respetando ediciones del usuario (drift por SHA-256).
- **#73** — La extensión VS Code 0.6.0 (CLI TS) nunca se publicó al Marketplace.
  Falta automatización (`vsce publish`) y documentación del proceso.
- **#74** — El render OpenTUI (`forge init` wizard, dashboard, `forge panel`)
  nunca se validó visualmente en una ventana real de Windows. Falta un checklist
  de validación manual.

## Decisión

### #71 — profiles dinámicos en validate (schema)
- Agregar `laravel` y `wordpress` al enum de `agents.profiles` (fix inmediato del
  drift conocido), de modo que AJV siga validando sin falsos negativos.
- Además, `forge validate` resuelve los profiles **dinámicamente** desde el
  `profiles/` del forge root: acepta CUALQUIER profile que exista como directorio
  bajo `profiles/` (anti-drift) y reporta un error solo cuando un profile
  declarado NO corresponde a un directorio real. La validación AJV ignora el enum
  de profiles (se valida dinámicamente) para que jamás vuelva a desincronizarse.

### #72 — debug detection para Java/Kotlin, Rust, Dart (hook)
- Agregar a `DEBUG_PATTERNS` en `core/hooks/pre-edit-check.js`:
  - Java/Kotlin: `System.out.print(ln)?`, `.printStackTrace(`
  - Rust: `println!(`, `eprintln!(`, `dbg!(`
  - Dart/Flutter: `debugPrint(`
- Regex simples (como las existentes) para minimizar falsos positivos.

### #75 — comando `forge update` (cli)
- Nuevo `packages/cli/src/commands/update.ts`, registrado en `cli.ts` + HELP.
- Lee `.forge/manifest.json` (archivos gestionados + su sha256 de instalación).
  Para cada archivo gestionado compara: (a) hash en disco vs manifest (¿lo editó
  el usuario?) y (b) la fuente actual del catálogo bundleado (resuelta vía
  `resolveForgeRoot`). Actualiza los archivos NO modificados cuando el catálogo
  difiere; SALTA + advierte los modificados por el usuario (salvo `--force`);
  actualiza el manifest. `--dry-run` no escribe, solo imprime el plan.

### #73 — automatización vsce (docs/CI)
- `.github/workflows/publish-vscode.yml`: `workflow_dispatch` (+ tag `vscode-v*`)
  → setup-node → `cd vscode-extension && npm ci && npx @vscode/vsce publish` con
  `secrets.VSCE_PAT`. Documentar el proceso en `vscode-extension/README.md`.
  Solo automatización: la primera publicación necesita el PAT del maintainer.

### #74 — checklist de validación Windows (docs)
- `docs/windows-validation.md`: pasos para validar los paneles OpenTUI en Windows
  real (Bun + Windows Terminal, conhost legacy, fallback `FORGE_ASCII`), qué
  mirar y cómo reportar. Requiere un humano en Windows.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| #71: solo agregar al enum | mínimo | vuelve a desincronizarse | se hace AMBOS: enum + resolución dinámica |
| #75: regenerar todo desde init | reusa código | pisa ediciones del usuario | drift por sha256 + skip de modificados |
| #73: publicar desde el PR | cierra el issue | no hay PAT del publisher | solo automatización (References) |

## Criterios de aceptación

- [ ] `project.yaml` con `profiles: [laravel]` y `[wordpress]` pasa `forge validate`.
- [ ] Test anti-drift: todo directorio bajo `profiles/` es aceptado por validate.
- [ ] Editar Java/Rust/Dart con un statement de debug dispara la advertencia del hook.
- [ ] `forge update --dry-run` lista cambios sin escribir.
- [ ] `forge update` actualiza los no-modificados y preserva los editados; idempotente.
- [ ] Workflow `publish-vscode.yml` válido + proceso documentado.
- [ ] `docs/windows-validation.md` con checklist paso a paso.

## Impacto de compliance

No aplica.

## Dependencias

- Reutiliza `lib/lock.ts` (`buildManifest`, `checkOutdated`, `sha256file`) y la
  resolución de assets de `lib/paths.ts` (`resolveForgeRoot`).
- #73 (publish) y #74 (validación visual) quedan abiertos hasta que el maintainer
  ejecute con su PAT / un humano valide en Windows.

## Notas de implementación

- `forge update` mapea cada archivo gestionado del manifest a su fuente en el
  catálogo según su ruta relativa (`.claude/hooks/*` → `core/hooks/*`,
  `.claude/commands/*` → `adapters/claude-code/commands/*`, `.claude/agents/*` →
  `core/agents/*` o `profiles/*/agents/*`). Archivos generados (CLAUDE.md,
  settings.json, architecture.rules) no tienen fuente 1:1 y se omiten del update.
