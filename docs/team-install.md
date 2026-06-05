# Team Install — Sumarte a un proyecto que usa forge

Ponete en marcha en menos de 5 minutos. forge corre con **Node.js 20+** (sin
submódulos, sin Python, sin `pip install`).

---

## Requisitos previos

- **Node.js 20+** — `node --version`
- **git** — `git --version`

---

## Pasos

### 1. Cloná el repositorio

```bash
git clone <url-del-repositorio>
cd <repositorio>
```

### 2. Adoptá / inicializá forge

Si el proyecto **ya tiene** `project.yaml` (forge ya está adoptado), regenerá la
configuración nativa del runtime:

```bash
npx @cristiancorreau/forge generate
```

Si el proyecto **todavía no usa** forge, corré el onboarding (detecta el stack,
instala agentes, hooks y genera la configuración):

```bash
npx @cristiancorreau/forge adopt    # repos existentes (brownfield)
# o, para el wizard interactivo completo:
npx @cristiancorreau/forge init
```

Esto escribe `.claude/agents/`, `CLAUDE.md`, `.claude/settings.json`,
`.claude/architecture.rules`, los slash commands y el manifest `.forge/`.

### 3. Verificá la instalación

```bash
npx @cristiancorreau/forge doctor   # health-check del entorno y runtime activo
npx @cristiancorreau/forge audit    # estado del proyecto vs el manifest
```

### 4. Empezá tu primera sesión

Abrí tu runtime de IA (Claude Code, OpenCode, Codex o Kiro) y ejecutá:

```
/session-start
```

El orchestrator te saluda, resume el sprint activo y asigna las tareas iniciales
según tu rol.

---

## Comando global (opcional)

Para usar `forge <cmd>` sin `npx`, instalá el binario global:

```bash
npm install -g @cristiancorreau/forge     # npm
pnpm add -g @cristiancorreau/forge        # pnpm (requiere `pnpm setup` una vez)
bun add -g @cristiancorreau/forge         # bun  (requiere ~/.bun/bin en el PATH)
```

Si el comando `forge` no se reconoce tras el install global, el directorio de
binarios no está en tu `PATH`; ver [README.md](../README.md) para el detalle por
gestor. `npx @cristiancorreau/forge <cmd>` siempre funciona sin instalar.
