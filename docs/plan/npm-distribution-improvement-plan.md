# Plan de distribución pública de Forge via npm/npx

Fecha: 2026-06-02  
Autor: Cristian Correa  
Repo público: https://github.com/cristiancorreau/forge  
Paquete npm: `@cristiancorreau/forge`

---

## Objetivo

Evolucionar Forge desde un framework instalado como subrepositorio Git hacia una herramienta distribuible públicamente, instalable y ejecutable con:

```bash
npx @cristiancorreau/forge init
npx @cristiancorreau/forge audit
npx @cristiancorreau/forge generate --runtime codex
```

## Estado actual — auditado 2026-06-02

Forge v2.0.1 se instala hoy como submodule o subdirectorio `.agentic/`:

```bash
git submodule add https://github.com/socialwebcl/forge .agentic
python3 .agentic/scripts/forge-init.py --tool claude-code
```

### Blockers reales identificados

| Blocker | Severidad | Cantidad |
|---------|-----------|----------|
| Referencias hardcodeadas a `.agentic/` | Crítica | 106 referencias en 29 archivos |
| Referencias a `socialwebcl` / `SocialWeb` | Alta | 39+ archivos |
| Sin `packages/cli/` para wrapper Node.js | Crítica | Directorio no existe |
| Sin pipeline de publicación npm/release | Alta | Solo existe `tests.yml` |
| VS Code publisher `socialwebcl` | Media | Cambiar a `cristiancorreau` |

### Stack disponible en el entorno

- Python 3.9.6 (mínimo soportado; tests corren en 3.9, 3.11, 3.12)
- Node v23.11.0 / npm 10.9.2
- Única dependencia runtime no-estándar: `pyyaml>=6.0`

### Disponibilidad de nombres

- `@cristiancorreau/forge` en npm: **disponible**
- `forge` sin scope: **ocupado** (goatslacker, Proprietary — no usar)

---

## Arquitectura de dos repositorios

```text
socialwebcl/forge (privado)          cristiancorreau/forge (público)
├── Development repo                  ├── Distribution repo
├── docs/plan/                        ├── core/, adapters/, profiles/
├── docs/analysis/                    ├── scripts/, templates/, hooks/
├── tests/                            ├── packages/cli/
├── .claude/                          ├── .github/workflows/
└── vscode-extension/ (fuente)        ├── LICENSE, README.md, CHANGELOG.md
                                      └── vscode-extension/ (compilada)
```

El repo público contiene solo lo necesario para usar Forge, no el historial de desarrollo ni documentación interna.

---

## Principios de migración

1. Python permanece como runtime interno — Node es solo la capa de distribución y UX.
2. Wrapper Node llama `python3` incluido en el paquete npm bajo `assets/`.
3. No romper instalaciones existentes con `.agentic/` (modo legacy sigue funcionando).
4. Publicar bajo identidad personal: Cristian Correa / @cristiancorreau.
5. Releases semánticos desde tags, con CI y provenance.

---

## Experiencia objetivo

### Proyecto nuevo

```bash
npx @cristiancorreau/forge init
```

El comando:
1. Detecta si existe `project.yaml`.
2. Ejecuta wizard si no existe.
3. Detecta stack y runtime objetivo cuando sea posible.
4. Genera agentes, skills, comandos y archivos de runtime.
5. Corre auditoría inicial.
6. Muestra siguientes pasos claros.

### Proyecto existente

```bash
npx @cristiancorreau/forge audit
npx @cristiancorreau/forge init --runtime claude-code
npx @cristiancorreau/forge generate --runtime all
```

### Actualización

```bash
npx @cristiancorreau/forge update
npx @cristiancorreau/forge update --dry-run
npx @cristiancorreau/forge update --force
```

---

## Fase 0: Preparación de identidad y repo público

**Objetivo:** Establecer la identidad pública bajo `cristiancorreau` antes de escribir cualquier código nuevo.

### Cambios de branding en el repo privado (socialwebcl/forge)

Archivos que deben actualizarse antes de sincronizar al repo público:

**Código — críticos:**
- `forge.py` líneas 2-3: `Copyright 2026 SocialWeb` → `Copyright 2026 Cristian Correa`; URL repo
- `manifest.json` línea 6: URL repository
- `vscode-extension/package.json`: `publisher: "socialwebcl"` → `"cristiancorreau"`; URL repo
- `scripts/aitmpl-search.py`: 17 referencias a `https://github.com/socialwebcl/forge/tree/main/profiles/...`
- Adapters que generan templates con URLs hardcodeadas: `generate-claude-md.py`, `generate-agents-md.py`, `generate-steering.py`, `generate-codex-config.py`

**Documentación:**
- `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`
- `docs/guide.md`, `docs/team-install.md`, `docs/runtimes/*.md`

**Estrategia:** Usar variable de template en adapters en vez de URL hardcodeada:
```python
FORGE_REPO = os.environ.get("FORGE_REPO", "https://github.com/cristiancorreau/forge")
```

### Configurar repo público

```bash
# Ya creado: https://github.com/cristiancorreau/forge
git remote add public https://github.com/cristiancorreau/forge
```

### Criterios de aceptación

- `grep -r "socialwebcl" core/ adapters/ scripts/ forge.py` no devuelve resultados.
- `grep -r "socialwebcl" vscode-extension/package.json` no devuelve resultados.
- El repo público existe y tiene README visible.

---

## Fase 1: CLI npm como wrapper

**Objetivo:** Publicar `@cristiancorreau/forge` en npm con wrapper Node.js que invoque Python.

### Estructura

```text
packages/cli/
  package.json
  tsconfig.json
  src/
    cli.ts          # Entry point, parse argv
    commands/
      init.ts
      audit.ts
      generate.ts
      validate.ts
      update.ts
      doctor.ts
    lib/
      python.ts     # spawn python3, resolver ruta del intérprete
      paths.ts      # resolver forge_root según modo
      project.ts    # leer project.yaml
  assets/           # copia de archivos de distribución (ver Fase 3)
```

### package.json del paquete

```json
{
  "name": "@cristiancorreau/forge",
  "version": "2.1.0",
  "description": "Agentic development framework — multi-runtime support for Claude Code, OpenCode, Codex and Kiro",
  "author": "Cristian Correa <cristian@socialweb.cl>",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/cristiancorreau/forge"
  },
  "type": "module",
  "bin": { "forge": "dist/cli.js" },
  "files": ["dist", "assets", "README.md", "LICENSE", "CHANGELOG.md"]
}
```

### Resolución de `forge_root` (modo dual)

El wrapper Node y los scripts Python deben resolver la raíz de Forge en este orden:

1. `FORGE_HOME` si está definido
2. `.agentic/` si existe y contiene `forge.py` (modo legacy)
3. `forge/` si existe y contiene `forge.py`
4. Directorio `assets/` interno del paquete npm (modo paquete)

### forge doctor

Diagnóstico de entorno para el usuario final:

```bash
forge doctor
```

Verifica: Python 3.9+, pyyaml instalado, permisos de escritura, runtime detectado.
Si falta Python: `pip3 install pyyaml` o instrucciones específicas por OS.

### Criterios de aceptación

- `npx @cristiancorreau/forge --help` muestra ayuda.
- `npx @cristiancorreau/forge init` funciona sin `.agentic/`.
- `npx @cristiancorreau/forge audit` encuentra `project.yaml` desde subdirectorios.
- `forge doctor` detecta ausencia de Python y muestra error accionable.
- La CLI usa `assets/` internos, no rutas hardcodeadas a `.agentic/`.

---

## Fase 2: Refactorizar rutas hardcodeadas

**Objetivo:** Eliminar las 106 referencias a `.agentic/` y hacer los scripts agnósticos a su ubicación de instalación.

### Archivos críticos a refactorizar

| Archivo | Problema |
|---------|---------|
| `scripts/forge-init.py` línea 116 | `FORGE_DIR` busca `.agentic` |
| `scripts/forge-generate-all.py` línea 80 | candidates incluye `.agentic` |
| `scripts/forge-scaffold-profile.py` línea 26 | busca `.agentic` |
| `scripts/forge-teardown.py` líneas 48, 101 | lógica de submodule hardcodeada |
| `adapters/kiro/generate-steering.py` línea 44 | búsqueda de ruta |
| `core/hooks/pre-edit-check.py` línea 158 | `in_agentic = ".agentic/" in norm` |
| `forge.py` líneas 2-3 de docs | documenta `.agentic/forge.py` |
| `scripts/forge-audit.py` línea 29 | `pip3 install -r .agentic/requirements.txt` |

### Patrón de refactorización

Los scripts ya usan `Path(__file__).parent` — correcto. El cambio es:

```python
# Antes
FORGE_DIR = Path(__file__).parent.parent  # asume scripts/ está en .agentic/scripts/

# Después
FORGE_DIR = _resolve_forge_root()

def _resolve_forge_root() -> Path:
    """Resuelve la raíz de forge en orden: FORGE_HOME, .agentic/, assets npm."""
    if env := os.environ.get("FORGE_HOME"):
        return Path(env)
    # Modo legacy: buscar desde cwd hacia arriba
    cwd = Path.cwd()
    for parent in [cwd, *cwd.parents]:
        for candidate in [".agentic", "forge"]:
            p = parent / candidate
            if (p / "forge.py").exists():
                return p
    # Modo paquete: usar Path(__file__).parent como raíz
    return Path(__file__).parent.parent
```

### Criterios de aceptación

- Los scripts funcionan desde `.agentic/` (modo legacy).
- Los mismos scripts funcionan cuando el wrapper npm los invoca desde `assets/`.
- Tests cubren ambos modos con `FORGE_HOME` como override.
- `grep -r '\.agentic/' scripts/ adapters/ core/hooks/ --include="*.py"` solo devuelve referencias documentadas, no lógicas.

---

## Fase 3: Separar paquete distribuible

**Objetivo:** Publicar solo los archivos necesarios; el repo público no tiene historial de desarrollo ni tests.

### Archivos incluidos en el paquete npm

```text
core/agents/          core/hooks/       core/skills/
core/schemas/         core/templates/   core/workflows/
adapters/             profiles/         templates/
scripts/              hooks/pre-commit
forge.py              manifest.json
requirements.txt      LICENSE
README.md             CHANGELOG.md
vscode-extension/     (fuente + .vsix compilado)
```

### Archivos excluidos

```text
docs/analysis/        docs/plan/        docs/feedback/
tests/                .claude/          .git/
.codex/               .github/          .DS_Store
vscode-extension/node_modules/
vscode-extension/out/   (regenerable)
```

### .npmignore

```
tests/
docs/analysis/
docs/plan/
docs/feedback/
.claude/
.codex/
.github/
*.vsix  # si se distribuye por separado
vscode-extension/node_modules/
vscode-extension/out/
```

### Criterios de aceptación

- `npm pack --dry-run` muestra solo archivos necesarios.
- Tamaño del paquete < 5MB.
- El paquete instalado permite inicializar un proyecto sin acceso al repo fuente.

---

## Fase 4: Comando `forge update`

**Objetivo:** Reemplazar `git submodule update` por un flujo de producto.

### Metadatos de instalación

Forge escribe `.forge/manifest.json` al inicializar:

```json
{
  "forge_version": "2.1.0",
  "installed_at": "2026-06-02T00:00:00Z",
  "runtime_targets": ["claude-code"],
  "generated_files": [
    ".claude/agents/orchestrator.md",
    ".claude/CLAUDE.md"
  ]
}
```

### Comportamiento de `forge update`

```bash
forge update --dry-run    # Muestra: versión actual, versión disponible, qué cambiaría
forge update              # Backup + aplica, respeta agentes Tier 3 locales
forge update --only orchestrator.md  # Actualiza solo un agente
```

### Criterios de aceptación

- `forge update --dry-run` no modifica archivos.
- `forge update` detecta drift local y pide confirmación.
- `forge update` deja registro en `.forge/manifest.json`.

---

## Fase 5: Publicación segura con CI/CD

**Objetivo:** Pipeline de release en el repo público `cristiancorreau/forge`.

### GitHub Actions — `.github/workflows/release.yml`

```yaml
on:
  push:
    tags: ['v[0-9]+.[0-9]+.[0-9]+*']

jobs:
  test-python:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ['3.9', '3.11', '3.12']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '${{ matrix.python-version }}' }
      - run: pip install pyyaml pytest
      - run: pytest tests/ -q --tb=short

  publish-npm:
    needs: test-python
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write   # Para provenance
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', registry-url: 'https://registry.npmjs.org' }
      - run: cd packages/cli && npm ci && npm run build
      - run: cd packages/cli && npm pack  # smoke test
      - name: Install tarball in temp project
        run: |
          mkdir /tmp/smoke && cd /tmp/smoke
          npm install /path/to/tarball.tgz
          npx @cristiancorreau/forge --help
          npx @cristiancorreau/forge doctor
      - run: cd packages/cli && npm publish --provenance --access public
        env: { NODE_AUTH_TOKEN: '${{ secrets.NPM_TOKEN }}' }
```

### Seguridad de publicación

- Publicación solo desde tags `vX.Y.Z`.
- npm trusted publishing con GitHub Actions + provenance.
- CI falla si tests Python o CLI fallan.
- `npm pack` se prueba antes de publicar.

### Criterios de aceptación

- Publicación solo desde tags.
- El release npm incluye provenance verificable.
- `npm view @cristiancorreau/forge` muestra la versión correcta.
- Changelog actualizado antes de publicar.

---

## Fase 6: Documentación y onboarding

**Objetivo:** README público centrado en `npx`, submodule como alternativa avanzada.

### Quick start en README

```bash
# Proyecto nuevo
npx @cristiancorreau/forge init

# Proyecto existente
npx @cristiancorreau/forge audit
npx @cristiancorreau/forge generate --runtime claude-code
```

### Documentos a actualizar

- `README.md`: quick start npm/npx primero
- `docs/guide.md`: flujo completo para usuario nuevo
- `docs/team-install.md`: instalación para equipos via npm
- `docs/runtimes/README.md`, `docs/runtimes/*.md`
- Guía de migración: submodule → npm

### Criterios de aceptación

- Quick start público en menos de 5 minutos.
- Guía de migración desde submodule a npm documentada.
- Troubleshooting para Python no instalado, permisos, rutas.

---

## Fase 7: Adapter GitHub Copilot

**Objetivo:** Ampliar cobertura multi-runtime hacia GitHub Copilot (adopción masiva en equipos).

### Archivos generados por el adapter

```text
.github/copilot-instructions.md
.github/instructions/backend.instructions.md
.github/instructions/frontend.instructions.md
.github/instructions/testing.instructions.md
```

### Criterios de aceptación

- `forge generate --runtime copilot` genera instrucciones repo-wide.
- Si existen paths en `project.yaml`, genera instrucciones path-specific.
- El adapter respeta `rules`, `stack`, `compliance` y `scripts`.
- `forge audit` detecta si Copilot está incompleto.

---

## Fase 8: Repo map y contexto dinámico

**Objetivo:** Mapa compacto del repositorio para mejorar la calidad de contexto de los agentes.

### Comando

```bash
forge repomap
# Salida: .forge/repo-map.md
```

Contenido: estructura del repo, comandos build/test, módulos principales, API routes, modelos/entidades, migraciones, convenciones detectadas, archivos críticos.

### Criterios de aceptación

- `forge repomap` genera mapa compacto sin secretos ni credenciales.
- `session-start` puede referenciarlo.
- `forge audit` avisa si está obsoleto (> 7 días sin actualizar).

---

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| 106 referencias `.agentic/` hardcodeadas | Alto | Refactorizar con `_resolve_forge_root()` antes de publicar |
| Usuarios sin Python 3.9+ | Alto | `forge doctor` con instrucciones por OS; binario compilado en largo plazo |
| Paquete npm demasiado grande | Medio | `.npmignore` + `npm pack --dry-run` en CI; meta < 5MB |
| Identidad inconsistente (socialwebcl vs cristiancorreau) | Alto | Fase 0 primero, bloquea las demás fases |
| Pérdida de trazabilidad vs submodule | Medio | `.forge/manifest.json` + `forge update --dry-run` |
| Publicación insegura | Alto | Tags + trusted publishing + provenance |

---

## Roadmap

### Corto plazo (Fase 0 → 1 → 2)

1. Fase 0: Cambiar todas las referencias `socialwebcl` → `cristiancorreau` en el repo privado.
2. Sincronizar archivos de distribución al repo público `cristiancorreau/forge`.
3. Fase 1: Crear `packages/cli/` con wrapper Node.js; implementar `forge --help`, `forge doctor`, `forge init`, `forge audit`, `forge validate`.
4. Fase 2: Refactorizar `_resolve_forge_root()` en los 29 archivos críticos.
5. Probar `npm pack` local; verificar < 5MB.

### Mediano plazo (Fase 3 → 4 → 5)

1. Fase 3: Configurar `.npmignore` y pipeline `npm pack` en CI.
2. Fase 4: Implementar `.forge/manifest.json` y `forge update --dry-run`.
3. Fase 5: Pipeline GitHub Actions de release semántico.
4. Publicar primer prerelease: `2.1.0-beta.0`.
5. Fase 6: Actualizar README y documentación pública.

### Largo plazo (Fase 7 → 8)

1. Fase 7: Adapter GitHub Copilot.
2. Fase 8: `forge repomap`.
3. Publicar extensión VS Code en Marketplace bajo publisher `cristiancorreau`.
4. Evaluar migración parcial de Python → TypeScript solo donde aporte mantenibilidad real.
5. Evaluar distribución via Homebrew o instalador shell.

---

## Definición de éxito

Forge se considera listo para reemplazar el submodule como método principal cuando:

- Un usuario nuevo puede ejecutar `npx @cristiancorreau/forge init` y completar setup sin clonar Forge.
- Un proyecto existente puede correr `npx @cristiancorreau/forge audit` sin `.agentic/`.
- Existe `forge update --dry-run` funcional.
- El paquete npm se publica desde CI con tests y provenance.
- La documentación pública usa npm/npx como camino principal.
- El modelo submodule sigue documentado como opción avanzada.
