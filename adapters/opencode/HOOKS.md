# Forge Hooks — Adaptación para OpenCode

OpenCode no tiene un sistema de hooks equivalente al PreToolUse/Stop de Claude Code. Este documento describe cómo adaptar cada comportamiento de hook de Forge para OpenCode.

> **Mecanismo de hook de este runtime:** git hooks compartidos (`.githooks/`),
> no hooks nativos. `forge generate --runtime opencode` genera
> `.githooks/pre-commit` (branch guard + detección de debug). Los demás
> guardrails se embeben como instrucciones en `AGENTS.md`.

---

## 1. Equivalencia de hooks

| Hook Forge (Claude Code) | Equivalente en OpenCode | Mecanismo |
|--------------------------|------------------------|-----------|
| `PreToolUse:Edit` — branch guard (bloquear edición en main) | **git pre-commit** | `.githooks/pre-commit` (automático) + AGENTS.md |
| `PreToolUse:Bash` — detección de console.log/print de debug | **git pre-commit** | `.githooks/pre-commit` (automático) + AGENTS.md |
| `PreToolUse:Bash` — bloqueo de comandos destructivos en producción | **Ninguno nativo** | Instrucción en AGENTS.md |
| `Stop` — resumen de sesión y persistencia de memoria | **Ninguno nativo** | Flujo `/session-close` |
| `pre-commit` git hook — inyección de token stats en progress.html | **Compatible** | El hook git funciona igual en OpenCode |

**Conclusión:** OpenCode no tiene PreToolUse ni Stop nativos. Branch guard y
detección de debug se ejecutan de forma automática vía el git hook compartido
`.githooks/pre-commit`; el resto de los guardrails se embeben como instrucciones
en AGENTS.md.

---

## 1.bis. Git hook compartido (`.githooks/pre-commit`)

`forge generate` genera un hook ejecutable POSIX (sin Python) en
`.githooks/pre-commit`. Activalo una vez por clon:

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

## 2. Guardrails que deben embeberse en AGENTS.md

### Branch guard (equivale a PreToolUse:Edit)

```markdown
## Guardrail: Branch guard

NUNCA editar código cuando la rama actual sea `main`, `master` o `develop`.

Antes de cualquier edición de archivo:
1. Verificar la rama actual con `git branch --show-current`
2. Si la rama es `main`, `master` o `develop`: detener y pedir al usuario que cree una rama de feature antes de continuar.

Excepción: archivos de documentación (*.md) pueden editarse en main si el usuario lo indica explícitamente.
```

### Debug detection (equivale a PreToolUse:Bash con grep de debug patterns)

```markdown
## Guardrail: Detección de debug

Antes de hacer commit de cualquier archivo, verificar que no contenga:
- `console.log(` en JavaScript/TypeScript (excepción: archivos de logger o utilidades de logging)
- `print(` en Python que no sea logging de producción
- `debugger;` en JavaScript/TypeScript
- `binding.pry` en Ruby
- `dd(` o `dump(` en PHP

Si se detectan estos patrones en código que va a commitearse: reportar la línea exacta y pedir confirmación antes de continuar.
```

### Producción safety (equivale a PreToolUse:Bash con comandos destructivos)

```markdown
## Guardrail: Producción safety

Nunca ejecutar estos comandos sin confirmación explícita del usuario:
- `DROP TABLE`, `DROP DATABASE`, `TRUNCATE` en cualquier base de datos de producción
- `rm -rf` en directorios que no sean temporales o de build
- `git push --force` a main/master (usar `--force-with-lease` en feature branches si es estrictamente necesario)
- Deploy directo a producción sin haber ejecutado `/review` primero

Para cualquier comando potencialmente destructivo: describir el efecto exacto y pedir confirmación explícita antes de ejecutar.
```

### SQL injection prevention

```markdown
## Guardrail: SQL injection

Nunca concatenar input del usuario directamente en strings SQL.
Siempre usar parámetros preparados o el ORM del proyecto.

Ejemplo prohibido: `f"SELECT * FROM users WHERE email = '{email}'"`
Ejemplo correcto: `cursor.execute("SELECT * FROM users WHERE email = %s", (email,))`
```

---

## 3. Configuración de proyecto OpenCode

OpenCode utiliza un archivo `.opencode/config.json` para configuración a nivel de proyecto. Ejemplo recomendado para proyectos Forge:

```json
{
  "model": "claude-sonnet-4-5",
  "context": {
    "files": [
      "AGENTS.md",
      "project.yaml"
    ]
  }
}
```

**Notas:**
- `context.files`: archivos que OpenCode incluye automáticamente como contexto en cada sesión. Incluir siempre `AGENTS.md` y `project.yaml`.
- `model`: el modelo a usar. Recomendado `claude-sonnet-4-5` o superior para proyectos con `project.mode: standard` o `enterprise`.

---

## 4. Flujo recomendado sin hooks

Dado que OpenCode no tiene hooks automáticos, el cumplimiento de los guardrails depende de:

1. **AGENTS.md bien escrito**: incluir las secciones de guardrails del punto 2 en el AGENTS.md generado por `generate-agents-md.py`.
2. **Disciplina de sesión**: usar `/session-start` al comenzar y `/session-close` al terminar para mantener el estado documentado.
3. **Pre-commit git hook**: el hook de git en `hooks/pre-commit` funciona igual en OpenCode — instalarlo en el proyecto cliente con `git config core.hooksPath .githooks`.

---

## 5. Referencia cruzada con comandos Forge v2

Los comandos SDD disponibles en OpenCode (en `.opencode/commands/`) son:

| Comando | Descripción |
|---------|-------------|
| `/session-start` | Inicializa sesión, detecta branch y estado del repo |
| `/plan` | Crea o revisa specs en docs/specs/ |
| `/work` | Implementa una spec en modo serial |
| `/review` | Revisión de código con veredicto vinculante |
| `/ship` | Pipeline de deploy con polling y smoke tests |
| `/session-close` | Cierra sesión con commit, daily note y PR |
