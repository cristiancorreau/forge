# SPEC-032 Migrar la extensión de VS Code al CLI TypeScript

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-04 | Actualizada: 2026-06-04

## Contexto

La extensión de VS Code (`vscode-extension/`) fue escrita para el flujo legacy de
forge basado en **Python + git submodule**. Concretamente:

- Detecta forge buscando el marker `scripts/forge-wizard.py`.
- Espera que forge esté instalado como submodule en `.agentic/` o `forge/`.
- Invoca `python3 scripts/*.py` para cada comando (init, audit, generate, validate,
  migrate, search…).
- Muestra mensajería de instalación tipo "Instálalo como git submodule en `.agentic/`".

Ese flujo está **deprecado**. forge hoy se distribuye como un CLI TypeScript
publicado en npm: `@cristiancorreau/forge` (binario `forge`, v2.11.0). La extensión
actual **no funciona** contra el CLI npm/npx: no encuentra el marker Python, no
existe el submodule y no hay scripts `.py` que ejecutar. El resultado es una
extensión rota para cualquier proyecto moderno.

Si no migramos, la extensión queda inservible y transmite un modelo de instalación
incorrecto (submodule) que ya no recomendamos.

## Decisión

Reescribir la capa de invocación y detección de `vscode-extension/` para que maneje
el CLI TypeScript, manteniendo la UX (status bar, árboles Actions/Project/Agents).

### Invocación

- Nuevo setting `forge.cliCommand` (default `"npx @cristiancorreau/forge"`). El
  usuario puede apuntarlo a un binario global (`forge`), a `pnpm dlx
  @cristiancorreau/forge`, `bunx @cristiancorreau/forge`, etc. El string se parte en
  tokens por espacios y se le concatenan los args del subcomando.
- **Comandos interactivos** (init wizard): se ejecutan en una terminal integrada de
  VS Code (`terminal.sendText`), porque el wizard usa prompts TTY.
- **Comandos no interactivos** (audit, doctor, validate, generate, skills, wiki
  status, migrate, scaffold, aitmpl-search): se ejecutan con `spawn` capturando
  stdout/stderr. Se usa `--json` donde el CLI lo ofrece (audit, validate, skills,
  aitmpl-search) para parsear estructuradamente; wiki status y doctor son texto.

### Detección

- "forge activo" = existe un `project.yaml` en la raíz del workspace
  (`forge.active`). Se elimina el marker `scripts/forge-wizard.py` y el descubrimiento
  del submodule `.agentic/`.
- La extensión funciona haya o no un `forge` global instalado, porque el default usa
  `npx` (que descarga el paquete on-demand). Se elimina la idea de
  `forge.installed`/"instalar submodule".

### Comandos y árbol

Superficie actual del CLI expuesta como comandos contribuidos + árbol Actions:

- Init (wizard) — terminal interactiva
- Audit (`--json`)
- Doctor
- Generate (con selección de runtime: claude-code/opencode/codex/kiro/all)
- Validate (`--json`)
- Migrate (`--backup`)
- Scaffold
- Skills: list (`--json`) y search (filtra el catálogo de skills en memoria)
- Wiki: status e init
- Search catalog (`aitmpl-search --json`)

Se eliminan los comandos Python-only (`forge.install` submodule,
`forge.generateClaudeMd` vía adapter `.py`, `forge.auditAgent` por script, el picker
de oportunidades que mutaba `project.yaml` vía `forge-add-opportunities.py`).

Los árboles Project y Agents se mantienen, alimentados desde `project.yaml` y
`.claude/agents/` (lectura de filesystem), no desde Python.

### package.json

- Bump de versión `0.5.0` → `0.6.0`.
- Descripción sin mención a Python.
- Reemplazo de las command contributions por la superficie nueva.
- Configuración: nuevo `forge.cliCommand`; se elimina `forge.forgePath` (ya no hay
  carpeta forge que resolver). Se conservan `forge.tool`/`forge.autoAuditOnSave`
  adaptados (`forge.runtime`, `forge.autoAuditOnSave`).

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Mantener Python + submodule | Sin cambios | Flujo deprecado, extensión rota con el CLI npm | No funciona con la distribución actual |
| Bundlear el CLI dentro del `.vsix` | Sin dependencia de red | Duplica el paquete, desincroniza versiones, peso | `npx` resuelve la versión publicada sin bundling |
| Default a `forge` global (sin npx) | Más rápido si está instalado | Falla si el usuario no instaló nada global | `npx` funciona out-of-the-box; el usuario puede override con el setting |

## Criterios de aceptación

- [ ] No queda ninguna referencia a `python3`, `forge-wizard.py`, `.agentic` ni
      "submodule" en `vscode-extension/`.
- [ ] La detección de "forge activo" usa exclusivamente la existencia de
      `project.yaml`.
- [ ] Existe el setting `forge.cliCommand` con default `npx @cristiancorreau/forge`.
- [ ] Init abre una terminal integrada con `<cliCommand> init`.
- [ ] Audit/validate/skills/aitmpl-search consumen `--json`; doctor/wiki status leen
      texto.
- [ ] Generate permite elegir runtime (claude-code/opencode/codex/kiro/all).
- [ ] `package.json` versión `0.6.0`, sin "Python" en la descripción, con los
      comandos y settings nuevos.
- [ ] `cd vscode-extension && npm install && npm run compile` compila con **cero**
      errores de TypeScript.

## Impacto de compliance

No aplica (cambio de tooling local, sin manejo de datos personales).

## Dependencias

- Requiere el CLI publicado `@cristiancorreau/forge` (v2.11.0) con los subcomandos
  init/audit/doctor/generate/validate/migrate/scaffold/skills/wiki/aitmpl-search.

## Notas de implementación

- El `.vsix` existente (`forge-agent-framework-0.5.0.vsix`) corresponde a la versión
  vieja; se deja como está (no se re-empaqueta en esta tarea) para no introducir un
  artefacto a medias. Se puede regenerar en un paso de release posterior.
- `forge.cliCommand` se tokeniza por espacios simples; no se soporta quoting con
  espacios dentro de una ruta. Es suficiente para `npx`/`pnpm dlx`/`bunx`/`forge`.
