# Forge Hooks — Adaptación para Codex

Codex CLI no tiene un sistema de hooks de bloqueo nativo equivalente al
PreToolUse/Stop de Claude Code. Este documento describe cómo Forge aplica sus
guardrails en Codex.

> **Mecanismo de hook de este runtime:** git hooks compartidos (`.githooks/`),
> no hooks nativos. `forge generate --runtime codex` genera `.githooks/pre-commit`
> (branch guard + detección de debug). El resto de los guardrails viven como
> instrucciones en `AGENTS.md`.

---

## 1. Equivalencia de hooks

| Hook Forge (Claude Code) | Equivalente en Codex | Mecanismo |
|--------------------------|----------------------|-----------|
| `PreToolUse:Edit` — branch guard (bloquear edición en main) | **git pre-commit** | `.githooks/pre-commit` (automático) + AGENTS.md |
| `PreToolUse:Bash` — detección de console.log/print de debug | **git pre-commit** | `.githooks/pre-commit` (automático) + AGENTS.md |
| `PreToolUse:Bash` — bloqueo de comandos destructivos en producción | **Ninguno nativo** | Instrucción en AGENTS.md |
| `Stop` — resumen de sesión y persistencia de memoria | **Ninguno nativo** | Flujo SDD manual |

**Conclusión:** Codex no tiene hooks de bloqueo nativos. Branch guard y detección
de debug se ejecutan automáticamente vía el git hook compartido
`.githooks/pre-commit`; el resto de los guardrails se embeben como instrucciones
en AGENTS.md.

---

## 2. Git hook compartido (`.githooks/pre-commit`)

`forge generate` genera un hook ejecutable POSIX (sin Python) en
`.githooks/pre-commit`, idéntico al que usa OpenCode. Activalo una vez por clon:

```sh
git config core.hooksPath .githooks
```

Qué hace en cada `git commit`:

1. **Branch guard** — bloquea el commit si estás en `main`/`master` y hay
   archivos de código staged (los `*.md`, `*.yaml`, `*.json`, `*.txt` quedan exentos).
2. **Debug detection** — bloquea el commit si encuentra `console.log(`,
   `debugger;`, `binding.pry`, `var_dump(` o `dd(` en archivos staged.

Para saltarlo puntualmente (bajo tu responsabilidad): `git commit --no-verify`.

---

## 3. Guardrails que dependen del agente

El git hook solo corre en `git commit`. Los comandos destructivos en producción
(`DROP TABLE`, `TRUNCATE`, `--force-reset`, `rm -rf /`, `git push --force`) NO
los intercepta: ante cualquiera de ellos, Codex debe parar y pedir confirmación
explícita al humano. Estas reglas están documentadas en el `AGENTS.md` generado.
