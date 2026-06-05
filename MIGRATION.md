# Migración — del CLI Python legacy a la CLI TypeScript

> Nota **histórica**. La CLI Python legacy (`forge.py` + `scripts/*.py`) **fue removida
> en la v3.0.0**. La única CLI soportada es TypeScript y se ejecuta con
> `npx @cristiancorreau/forge` (Node.js 20+, sin Python).

---

## Qué pasó

- Desde la **v2.8.0** la CLI de forge es **100% TypeScript**.
- En la **v3.0.0** (release mayor, breaking) se eliminaron `forge.py`, los
  `scripts/*.py`, la suite `tests/*.py` (pytest), `requirements.txt`,
  `scripts/team-install.sh` y el workflow `tests-legacy.yml`. Toda la documentación
  del flujo `python3 .agentic/...` se actualizó a la CLI TypeScript.

> **`Python` como lenguaje de stack se mantiene**: los profiles FastAPI / Flask /
> Django y sus agentes Tier 2 siguen siendo parte del producto. Lo removido es la
> *CLI* Python legacy, no el soporte de Python como stack del proyecto.

Si todavía invocás `python3 .agentic/forge.py` o cualquier `scripts/*.py`, migrá a la
CLI TypeScript: no requiere submódulo, ni Python, ni `pip install`.

```bash
# Inicializar / adoptar forge en el proyecto
npx @cristiancorreau/forge init      # wizard interactivo
npx @cristiancorreau/forge adopt     # repo existente (brownfield)
```

---

## Mapeo de comandos (referencia)

| Flujo Python legacy (removido) | CLI TypeScript |
|--------------------------------|----------------|
| `python3 .agentic/forge.py` (menú → Inicializar agentes) | `npx @cristiancorreau/forge init` |
| `python3 .agentic/scripts/forge-init.py --tool claude-code` | `npx @cristiancorreau/forge generate` |
| `python3 .agentic/scripts/forge-audit.py` | `npx @cristiancorreau/forge audit` |
| `python3 .agentic/scripts/aitmpl-search.py <query>` | `npx @cristiancorreau/forge aitmpl-search <query>` |

> La CLI TypeScript agrega comandos que el flujo Python no tenía: `validate`, `doctor`,
> `migrate`, `adopt`, `wiki`, `skills`, `scaffold` y `teardown`. Ver la
> [guía completa](docs/guide.md).

---

## Referencias

- [README.md](README.md) — quick start de la CLI TypeScript
- [docs/guide.md](docs/guide.md) — guía de uso completa
- [docs/team-install.md](docs/team-install.md) — onboarding por equipo
- [CHANGELOG.md](CHANGELOG.md) — entrada `[3.0.0]` con la nota de removal
