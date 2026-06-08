# forge — Agent Framework (VS Code extension)

Maneja proyectos forge desde VS Code: la extensión envuelve la CLI
`@cristiancorreau/forge` (multi-runtime: 19 runtimes) y expone sus comandos
(`init`, `audit`, `doctor`, `generate`, …) desde la paleta y la vista lateral.

Publisher: `cristiancorreau` · ID: `forge-agent-framework`

## Desarrollo local

```bash
cd vscode-extension
npm install
npm run compile        # tsc -p ./  → out/
```

Para probarla, abrí `vscode-extension/` en VS Code y presioná F5 (Extension
Development Host). Para empaquetar un `.vsix` local:

```bash
npx @vscode/vsce package    # genera forge-agent-framework-<version>.vsix
```

## Publicar al Marketplace

> Estado actual: la versión publicada en el Marketplace es la **0.5.0** (flujo
> Python deprecado). La **0.6.0** (CLI TS) está empaquetada pero **aún no
> publicada** — la primera publicación necesita el PAT del publisher
> `cristiancorreau` y debe ejecutarla el maintainer. Ver issue #73.

### 1. Crear el Personal Access Token (PAT)

`vsce` se autentica con un Azure DevOps PAT asociado a la organización del
publisher:

1. Entrá a <https://dev.azure.com> con la cuenta del publisher `cristiancorreau`.
2. User settings → **Personal access tokens** → **New Token**.
3. **Organization**: All accessible organizations.
4. **Scopes**: Custom defined → **Marketplace** → **Manage**.
5. Copiá el token (se muestra una sola vez).

Más detalle: <https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token>.

### 2. Publicar manualmente (primera vez)

```bash
cd vscode-extension
npm install
npm run compile
npx @vscode/vsce login cristiancorreau     # pega el PAT cuando lo pida
npx @vscode/vsce publish                    # publica la versión de package.json
```

`vsce publish <major|minor|patch>` también sube la versión en `package.json`
antes de publicar.

### 3. Publicación automatizada (CI)

El workflow [`.github/workflows/publish-vscode.yml`](../.github/workflows/publish-vscode.yml)
publica al Marketplace usando el secret de repo **`VSCE_PAT`**:

- **Agregar el secret**: repo → Settings → Secrets and variables → Actions →
  *New repository secret* → nombre `VSCE_PAT`, valor = el PAT del paso 1.
- **Disparar manualmente**: pestaña **Actions** → *publish-vscode* → *Run
  workflow*.
- **Disparar por tag**: `git tag vscode-v0.6.0 && git push origin vscode-v0.6.0`.

El job hace `npm install` → `npm run compile` → `npx @vscode/vsce publish` en
`vscode-extension/`, con `VSCE_PAT` en el entorno.

> El workflow **no** puede correr la primera publicación sin que el maintainer
> cargue `VSCE_PAT` con un PAT válido. Mientras el secret no exista (o el token
> esté vencido), el job falla en el paso *Publish with vsce*.
