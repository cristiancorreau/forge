# Migración — del CLI Python legacy a la CLI TypeScript

> Guía de migración y política de deprecación de la implementación Python de forge
> (`forge.py` + `scripts/*.py`).

---

## Deprecation Notice

Desde la **v2.8.0**, la CLI de forge es **100% TypeScript** y se ejecuta con `npx @cristiancorreau/forge`
(Node/Bun, sin dependencias de Python).

El `forge.py` y los scripts `scripts/*.py` son la implementación **legacy** y quedan **deprecados**:

- **v2.x** — Periodo de soporte. La CLI TypeScript es la implementación oficial. El código Python
  sigue presente solo por compatibilidad con instalaciones legacy (submódulo `.agentic/`), sin
  garantía de nuevas funcionalidades.
- **v3.0.0** — **Sunset**. Se eliminan `forge.py`, `scripts/*.py`, `tests/*.py`, `requirements.txt`
  y toda referencia a Python en docs, workflows y setup. A partir de aquí, `npx @cristiancorreau/forge`
  es la única forma soportada de usar forge.

> ⚠️ Si hoy invocás `python3 .agentic/forge.py` o cualquier `scripts/*.py`, migrá ahora a la CLI
> TypeScript: no requiere submódulo, ni Python, ni `pip install`.

---

## Timeline de sunset

| Versión | Estado del CLI Python | Acción recomendada |
|---------|-----------------------|--------------------|
| v2.8.0  | Deprecado (CLI TS es la oficial) | Empezar a usar `npx @cristiancorreau/forge` |
| v2.x    | Deprecado, aún presente en el repo | Completar la migración; dejar de invocar `forge.py` |
| **v3.0.0** | **Removido** | Usar exclusivamente la CLI TypeScript |

La fecha exacta de v3.0.0 se anunciará en el [CHANGELOG.md](CHANGELOG.md). El sunset solo ocurre en un
release **mayor** (semver), nunca dentro de la serie v2.x.

---

## Alternativa: CLI TypeScript

Todo lo que hacía el flujo Python se cubre con `npx @cristiancorreau/forge`. No hace falta clonar el
submódulo, instalar Python ni correr `pip install -r requirements.txt`.

```bash
# Inicializar el proyecto (wizard + dashboard post-install)
npx @cristiancorreau/forge init
```

### Mapeo de comandos

| Flujo Python legacy | CLI TypeScript |
|---------------------|----------------|
| `python3 .agentic/forge.py` (menú → Inicializar agentes) | `npx @cristiancorreau/forge init` |
| `python3 .agentic/scripts/forge-init.py --tool claude-code` | `npx @cristiancorreau/forge generate` |
| `python3 .agentic/scripts/forge-audit.py` | `npx @cristiancorreau/forge audit` |
| `python3 .agentic/scripts/aitmpl-search.py <query>` | `npx @cristiancorreau/forge aitmpl-search <query>` |

> La CLI TypeScript agrega comandos que el flujo Python no tenía: `validate`, `doctor`, `migrate`,
> `wiki`, `skills`, `scaffold` y `teardown`. Ver la [guía completa](docs/guide.md).

---

## Qué hacer si tenés forge como submódulo Python

1. Migrá tus invocaciones al comando `npx` equivalente (tabla de arriba).
2. Validá que la instalación sigue íntegra:

   ```bash
   npx @cristiancorreau/forge audit
   ```

3. Cuando todo funcione vía `npx`, podés dejar de actualizar el submódulo `.agentic/`. La eliminación
   definitiva del submódulo es opcional hasta v3.0.0.

---

## Referencias

- [README.md](README.md) — quick start de la CLI TypeScript
- [docs/guide.md](docs/guide.md) — guía de uso completa
- [CHANGELOG.md](CHANGELOG.md) — historial de versiones y nota de deprecación
- [docs/team-install.md](docs/team-install.md) — guía legacy (deprecada) de instalación por equipo
