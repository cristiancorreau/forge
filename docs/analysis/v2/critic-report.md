# Informe crítico v2: por qué todavía NO recomendamos adoptar forge

**Tipo:** Análisis técnico independiente  
**Revisado:** Mayo 2026  
**Versión analizada:** commit `d828157` (estado actual de `main`)  
**Análisis anterior:** `docs/analysis/v1/critic-report.md`  
**Base:** Lectura directa del código en `/Users/skauch/Developer/Github/forge`

---

## 1. Resumen ejecutivo

forge recibió una ronda de mejoras significativas desde el análisis v1. El bug más evidente fue corregido, cuatro profiles nuevos fueron agregados, se escribieron más de 1.300 líneas de tests, y dos adapters que no existían ahora tienen implementación funcional. Estos son avances reales y merecen reconocimiento honesto.

Sin embargo, la postura de este análisis se mantiene: **no recomendamos adoptar forge en su estado actual**. Las razones han cambiado en parte: algunos problemas fueron resueltos, pero persisten fragilidades estructurales importantes y han aparecido problemas nuevos que el análisis anterior no detectó. El conjunto de problemas subsistentes —documentación desincronizada con el código, adapter de OpenCode con comportamiento inconsistente, audit con fix messages no ejecutables, suite de tests con brechas críticas, y un pre-commit hook que muta archivos silenciosamente— configura un framework que promete más de lo que entrega de manera confiable.

La relación costo/beneficio sigue siendo desfavorable para la mayoría de equipos.

---

## 2. Problemas del análisis v1 que PERSISTEN

### 2.1 El audit sugiere fix messages que no son comandos ejecutables

El análisis v1 identificó que `forge-audit.py` sugería `--only` cuando ese flag no existía. Ese bug fue corregido: `--only` ahora existe y funciona. Sin embargo, el formato de los fix messages sigue siendo inejecutables directamente:

```python
# forge-audit.py líneas 223, 242:
"fix": f"forge-init.py --tool claude-code --force --only={agent['name']}"
```

`forge-init.py` no está en el PATH del sistema. El README muestra claramente el comando correcto: `python3 .agentic/scripts/forge-init.py --tool claude-code`. El audit sugiere `forge-init.py ...` sin prefijo, sin path. Un usuario que copie y ejecute el fix sugerido recibirá `command not found`. El problema de fondo del análisis v1 —acciones de fix incorrectas en el audit— persiste, solo cambió la naturaleza del error.

Los tests de `test_forge_audit.py` no validan el formato de los fix messages en ningún caso. El suite verifica que los niveles de severity sean correctos y que `check_vs_forge` retorne `ok` para Tier 3, pero en ninguna línea se comprueba que un fix message sea ejecutable o tenga el formato correcto.

### 2.2 El pre-commit hook muta archivos silenciosamente

El hook en `hooks/pre-commit` sigue haciendo `git add` sobre `docs/progress.html` dentro del proceso de commit, sin que el desarrollador haya inspeccionado ese archivo:

```bash
# hooks/pre-commit
if ! git -C "$ROOT" diff --quiet "$HTML"; then
  echo "[forge pre-commit] Actualizando docs/progress.html con token stats..."
  git -C "$ROOT" add "$HTML"
fi
```

El análisis v1 señaló este problema. No fue corregido. La versión actual agregó un mensaje informativo (`echo "[forge pre-commit] Actualizando..."`) que mitiga ligeramente el problema, pero el comportamiento de mutación sigue activo. Un commit puede incluir cambios a `progress.html` que el desarrollador no revisó ni staged. Esto viola el principio básico de que un commit debe contener exactamente lo que el desarrollador eligió incluir.

No existe ningún test en el suite que cubra el comportamiento del hook pre-commit ni de `token-stats.py`.

### 2.3 La similitud de texto sigue siendo la métrica de calidad

`forge-audit.py` sigue usando `SequenceMatcher.ratio()` con umbrales fijos (`SIMILARITY_WARN = 0.80`, `SIMILARITY_OUTDATED = 0.50`) para determinar si un agente está "al día" con forge. El análisis v1 señaló que esta heurística confunde especialización intencional con desactualización.

La versión actual agrega un comentario de calibración que documenta los umbrales, lo cual es una mejora de comunicación pero no cambia el problema de fondo: la métrica mide similitud de texto, no calidad conceptual. Un agente de Tier 2 que reescribe el core para adaptarlo a Rails tiene similitud baja con el core, y el audit lo reportará como "posibles mejoras disponibles en forge" aunque esté perfectamente actualizado y especializado.

### 2.4 El mecanismo de actualización sigue siendo destructivo sin alternativa de merge

`--force` sobreescribe el agente de destino completamente. No existe mecanismo de merge ni diff interactivo. La única alternativa es no usar `--force` y perder las actualizaciones de forge. Este es un problema de diseño que requeriría una solución arquitectónica que la versión actual no aborda.

---

## 3. Problemas del análisis v1 que fueron RESUELTOS

### 3.1 El bug de install_agent fue corregido correctamente

El análisis v1 identificó que `install_agent` siempre retornaba `"UPDATE"` para instalaciones nuevas porque evaluaba `dst.exists()` después de copiar el archivo. La corrección es limpia y está bien testeada:

```python
# forge-init.py líneas 95-105
def install_agent(src: Path, dst: Path, name: str, source_label: str) -> str:
    if not src.exists():
        return "MISS"
    if ONLY_AGENT and name != ONLY_AGENT:
        return "SKIP"
    already_existed = dst.exists()  # evaluar ANTES de copiar
    if already_existed and not FORCE:
        return "KEEP"
    shutil.copy2(src, dst)
    return "UPDATE" if already_existed else "OK"
```

El test `test_ok_no_es_update_en_instalacion_nueva` verifica explícitamente el comportamiento correcto. Bug resuelto.

### 3.2 El flag --only existe y funciona

La acción de fix del audit (`--force --only=<agente>`) era inútil en v1 porque `--only` no existía. Ahora existe, está implementado en `forge-init.py` (líneas 46-55) y está testeado en `test_forge_init_integration.py` y en `test_install_agent.py`. El `--only` soporta ambas sintaxis (`--only=nombre` y `--only nombre`). Corrección completa.

### 3.3 Los adapters de OpenCode y Kiro ahora tienen implementación real

El análisis v1 señaló que `adapters/opencode/` y `adapters/kiro/` estaban vacíos. Ahora contienen scripts funcionales:

- `adapters/opencode/generate-agents-md.py`: genera un `AGENTS.md` enriquecido con información del stack, roster completo y sección de compliance condicional. Lee las descriptions desde el frontmatter de los agentes en forge, no los hardcodea.
- `adapters/kiro/generate-steering.py`: genera cuatro archivos en `.kiro/steering/` (`product.md`, `structure.md`, `agents.md`, `compliance.md`) que Kiro IDE usa como contexto persistente.

Ambos adapters tienen cobertura de tests en `test_adapters.py`. Esta es la mejora más sustantiva de la versión.

### 3.4 generate-claude-md.py ahora conecta las fases del sprint

El análisis v1 señaló que las "Phases activas y estado" en `CLAUDE.md` eran siempre texto fijo sin conexión con `project.yaml`. El generador ahora tiene una función `_render_phases()` que lee `sprint.phases` y genera el listado real de fases con sus specs y status. La sección "fuente de verdad" ahora alimenta el documento principal. También se agregó soporte para `language: "mixed"` con placeholder apropiado y para PHP.

### 3.5 El ecosistema de profiles pasó de 4 a 8

El análisis v1 criticó que solo había cuatro profiles con un agente cada uno. Ahora hay 8 profiles: `expo`, `hono-drizzle`, `nextjs-admin`, `playwright-crawler`, `fastapi`, `express`, `rails`, `nestjs`. Duplicar el ecosistema es un avance real.

### 3.6 forge-teardown.py existe y cubre los casos principales

El análisis v1 señaló que no había comando de teardown. Ahora existe `scripts/forge-teardown.py` con modo dry-run por defecto, eliminación selectiva (solo los agentes que forge instaló, no los Tier 3 del proyecto), y tests de cobertura. El camino de salida de forge ahora existe.

---

## 4. Problemas NUEVOS detectados en esta versión

### 4.1 Documentación central desincronizada con el ecosistema de profiles

`docs/agent-standard.md` es la referencia que los equipos leerán para entender el sistema de profiles. Contiene esta tabla:

```
| `rails` | `backend-engineer` *(pendiente)* |
| `fastapi` | `backend-engineer` *(pendiente)* |
```

Esto es incorrecto en dos niveles. Primero, `rails` y `fastapi` ya no están pendientes: tienen agentes funcionales y testeados. Segundo, los agentes que proveen no son `backend-engineer`:

- `profiles/rails/agents/fullstack-engineer.md` — agente `fullstack-engineer`
- `profiles/fastapi/agents/api-engineer.md` — agente `api-engineer`

Además, `express` y `nestjs` —dos de los cuatro profiles nuevos— no aparecen en la tabla en absoluto. La documentación de referencia del framework describe un ecosistema diferente al que existe en el código. Un equipo que lea `agent-standard.md` para decidir qué profile adoptar recibirá información incorrecta sobre qué agentes obtendrá.

### 4.2 fullstack-engineer no tiene descripción en forge-init.py

El profile `rails` provee un agente llamado `fullstack-engineer`. Sin embargo, el diccionario `role_descriptions` en `forge-init.py` (que genera el AGENTS.md del proyecto) no tiene entrada para ese nombre:

```python
role_descriptions = {
    "orchestrator":       "Lead del team — coordina, descompone tareas, sintetiza",
    "backend-engineer":   "Backend — API, base de datos, lógica de negocio",
    # ... 14 entradas más, ninguna es "fullstack-engineer"
}
```

Un proyecto que use el profile `rails` verá en su `AGENTS.md` generado la descripción genérica `"Agente de implementación"` para el agente central del profile. Esto contradice el propósito del adapter de documentación automática. El adapter de Kiro sí tiene la entrada correcta en su diccionario interno, lo que agrava la inconsistencia: el mismo framework describe el mismo agente de manera diferente según qué adapter genera la documentación.

### 4.3 --tool opencode no usa el adapter de OpenCode

`forge-init.py` acepta `--tool opencode` pero no llama a `adapters/opencode/generate-agents-md.py`. En cambio, ejecuta exactamente el mismo código que `--tool claude-code`: instala agentes en `.claude/agents/`, genera `AGENTS.md` con el formato de Claude Code, e instala slash commands de wiki. El adapter de OpenCode es un script autónomo que el usuario debe llamar manualmente y por separado.

```python
# forge-init.py líneas 382-389
if tool in ("claude-code", "opencode", "all"):
    label = "Claude Code / OpenCode" if tool == "all" else tool.title().replace("-", " ")
    init_claude_code(root, forge, config)   # mismo código para ambos
    install_claude_commands(root, forge, config)
    init_wiki(root, forge, config)
```

Esto tiene consecuencias prácticas: un usuario de OpenCode que ejecute `forge-init.py --tool opencode` obtendrá una instalación orientada a Claude Code (con `.claude/agents/`, slash commands de Claude) en lugar de la que esperaría (`.kiro/` o `AGENTS.md` enriquecido del adapter OpenCode). El nombre del flag promete algo que la implementación no cumple.

### 4.4 El suite de tests tiene brechas críticas que no detectarán regresiones importantes

El suite cubre bien los happy paths y algunos casos de error. Sin embargo, hay brechas relevantes:

**No hay tests para `token-stats.py`.** Este script es el que el pre-commit hook llama antes de cada commit. Es el único script sin cobertura de tests. Si introduce un bug, pasará desapercibido hasta que un desarrollador vea comportamiento inesperado en `progress.html`.

**No hay tests end-to-end para el hook pre-commit.** El comportamiento de mutación silenciosa señalado en v1 no tiene ningún test que lo valide ni que lo habría detectado antes de que existiera.

**No hay tests que validen los fix messages del audit.** El audit genera strings como `"forge-init.py --tool claude-code --force --only=backend-engineer"`. Ningún test verifica que ese string sea ejecutable, que tenga el formato correcto, o que el comando que describe exista. Si alguien renombra el script o cambia los flags, los fix messages quedarán desactualizados sin que ningún test falle.

**Los tests de profiles no detectan inconsistencias con `agent-standard.md`.** `test_profiles.py` verifica que cada profile tenga frontmatter correcto, tier 2, y secciones requeridas. No verifica que los agentes que provee coincidan con lo documentado en `agent-standard.md`. La inconsistencia entre `fullstack-engineer` real vs `backend-engineer` documentado no produciría ningún test fallido.

**Los tests de integración de `--tool opencode` no verifican que genere output específico de OpenCode.** `test_forge_init_integration.py` no tiene un caso que ejecute `--tool opencode` y verifique que no instale en `.claude/agents/` o que llame al adapter correcto.

### 4.5 El teardown es incompleto para una desinstalación real

`forge-teardown.py` mejora la situación, pero su alcance tiene limitaciones importantes que el propio script documenta:

- No elimina `CLAUDE.md` ("puede haberse customizado manualmente").
- No elimina `project.yaml` ("fuente de verdad del proyecto").
- No elimina el hook pre-commit — solo imprime instrucciones.
- No elimina el submodule `.agentic` — solo imprime instrucciones.

En la práctica, después de ejecutar `forge-teardown --confirm`, el proyecto sigue teniendo `CLAUDE.md` con referencias a `forge`, `project.yaml` que requiere mantenimiento, y posiblemente el hook activo. El equipo debe ejecutar entre 4 y 6 comandos adicionales después del teardown para quedar realmente desvinculado. El script es un avance respecto a no tener nada, pero no es el "camino de salida limpio" que un framework maduro debería ofrecer.

### 4.6 La promesa de agnóstico-al-tool sigue siendo parcial

El README sigue afirmando compatibilidad con "Claude Code, OpenCode, Codex y otros runtimes". Ahora hay adapters para los tres primeros, pero la integración no es simétrica:

- Claude Code: integración nativa en `forge-init.py`, slash commands, skills como wiki.
- Kiro: adapter funcional, pero requiere llamar manualmente a `generate-steering.py`; `forge-init.py --tool kiro` lo llama vía subprocess, lo cual funciona pero crea una dependencia frágil.
- OpenCode: adapter funcional, pero `forge-init.py --tool opencode` no lo invoca. El adapter existe como herramienta independiente, no integrada.

"Codex" no tiene adapter y no aparece en ningún directorio del repositorio. El README lo menciona en el lede sin ninguna implementación correspondiente.

---

## 5. Riesgos de adopción actualizados

**Riesgo de documentación desactualizada desde el día uno.** Un equipo que intente seleccionar profiles leyendo `agent-standard.md` recibirá información incorrecta sobre qué agentes obtendrá. Si la documentación central del framework ya está desincronizada con el código en el commit más reciente, el patrón de desincronización es estructural, no accidental.

**Riesgo de comportamiento inesperado con `--tool opencode`.** Un usuario de OpenCode seguirá el README, ejecutará `forge-init.py --tool opencode`, y obtendrá una instalación de Claude Code. El error será difícil de diagnosticar porque forge-init termina con exit code 0 y reporta agentes instalados.

**Riesgo de falsa seguridad en compliance (persiste del v1).** El `compliance-reviewer` ahora incluye un disclaimer explícito en la sección "Limitaciones — leer antes de usar". Esto es una mejora en comunicación. Sin embargo, el riesgo operativo persiste: equipos que adoptan forge para compliance pueden confiar en el agente como primer y único filtro, especialmente bajo presión de deadline. El disclaimer en el archivo del agente solo es visible si alguien lo lee directamente; no aparece en el output de forge-init ni en el CLAUDE.md generado.

**Riesgo de tests que dan confianza sin cobertura real.** 112 tests funcionando correctamente es un número que transmite confianza. Pero ninguno de esos tests detectaría: (a) fix messages no ejecutables en el audit, (b) la inconsistencia entre `fullstack-engineer` real y `backend-engineer` documentado, (c) que `--tool opencode` no usa el adapter de OpenCode, ni (d) que el hook pre-commit muta archivos silenciosamente. La cobertura cubre el código que fue testeado, no los comportamientos que importan.

**Riesgo de acumulación de convenciones sin valor claro.** Adoptar forge agrega al proyecto: `project.yaml`, `CLAUDE.md` generado, `AGENTS.md` generado, el directorio `.claude/agents/` con agentes de forge, opcionalmente `.kiro/steering/`, `.claude/commands/` con slash commands, el hook pre-commit, y posiblemente `docs/wiki/`. Cada uno de estos artefactos requiere mantenimiento y tiene dependencias con los demás. El costo de adopción se paga en la primera semana; el costo de mantenimiento es continuo.

---

## 6. Conclusión: por qué todavía NO recomendamos este framework

forge v2 es mejor que forge v1. El bug de `install_agent` fue corregido, los adapters vacíos ahora tienen código, el ecosistema de profiles se duplicó, apareció `forge-teardown.py`, se escribieron 112 tests. Reconocer esto es parte de un análisis honesto.

El problema es que **las mejoras resolvieron los síntomas más visibles sin abordar las fragilidades estructurales**. La documentación central (`agent-standard.md`) describe un ecosistema diferente al que existe en el código. El adapter de OpenCode existe pero no está integrado en el flujo principal. El audit sigue sugiriendo comandos no ejecutables. El pre-commit hook sigue mutando archivos sin supervisión. Y el suite de tests, aunque extenso en número, tiene brechas exactamente donde más importaría tener cobertura.

Un framework de tooling para equipos de desarrollo con agentes de IA tiene que cumplir un estándar más alto que el código de producción que los agentes escribirán: sus scripts son la capa que configura y mantiene todo lo demás. Cuando esa capa tiene documentación desincronizada, comportamiento inconsistente entre flags del mismo script, y tests que no detectan las regresiones más relevantes, el riesgo de adopción es real.

La alternativa sigue siendo la misma que señalaba el análisis v1: escribir un `CLAUDE.md` a mano, definir agentes directamente en `.claude/agents/`, y usar un repositorio interno de plantillas para reutilización. Esta aproximación tiene cero dependencias, cero documentación desincronizada, y cero riesgo de que un fix del audit lleve a ejecutar un comando que no existe o que no hace lo que se espera.

Para equipos que valoran la propuesta de forge —profiles especializados, compliance integrado, SDD, audit automático— la recomendación es esperar a que el framework resuelva los problemas estructurales identificados en este análisis antes de adoptarlo. En particular: que la documentación de `agent-standard.md` refleje el ecosistema real, que `--tool opencode` invoque el adapter de OpenCode, que los fix messages del audit sean ejecutables, y que el suite de tests cubra los comportamientos críticos, no solo los happy paths.

Hasta entonces, forge es un framework con buenas ideas y deuda técnica acumulada en exactamente los lugares donde un equipo que confíe en él no tiene manera fácil de detectarla.

---

*Informe basado en lectura directa de: `docs/analysis/v1/critic-report.md`, `README.md`, `scripts/forge-init.py`, `scripts/forge-audit.py`, `scripts/forge-teardown.py`, `adapters/claude-code/generate-claude-md.py`, `adapters/opencode/generate-agents-md.py`, `adapters/kiro/generate-steering.py`, `core/agents/compliance-reviewer.md`, `templates/project.yaml.tpl`, `docs/agent-standard.md`, `hooks/pre-commit`, `profiles/` (8 profiles), `tests/` (7 archivos de test + conftest.py).*
