# forge — Análisis crítico independiente v8

**Fecha:** 2026-05-05  
**Versión analizada:** forge v0.2.2  
**Metodología:** Lectura directa de código. No se incorpora output de análisis previos.  
**Alcance:** forge.py (1027 líneas), forge-wizard.py (1003), forge-audit.py (1059), forge-init.py (588), generate-claude-md.py (263), extension.ts (1122), 15 profiles, 464 tests, docs/, `.github/workflows/`.

---

## Resumen ejecutivo

forge v0.2.2 cerró en un solo ciclo los tres problemas de gobernanza que llevaban análisis sin resolverse: GitHub Actions, tags semánticos, y CHANGELOG. El repositorio cumple ahora los criterios básicos de un proyecto open source con continuidad verificable. Para equipos que dudaron en adoptar forge por la ausencia de releases formales, ese obstáculo desapareció.

Lo que este análisis señala es la brecha que el cierre de gobernanza deja expuesta: el ciclo agregó ~750 líneas de código nuevo con cero tests. La governance mejoró, pero la calidad de cobertura retrocedió relativamente. Las cuatro features nuevas —scope injection, CLAUDE.md automático, settings.json, TUI de dos paneles— no tienen casos de test. Eso en sí no rompe nada hoy, pero crea una zona del codebase que puede romperse silenciosamente en el próximo ciclo.

El segundo problema es de diseño de flujo: la feature de scope injection depende de que el usuario configure `agent_paths` en `project.yaml`. El wizard no pregunta sobre eso. El template tiene todos los valores en `null`. El resultado es que una feature bien implementada es invisible para la mayoría de los proyectos que instalen forge v0.2.2.

---

## Análisis por área

### 1. Gobernanza: cambio real, verificado en código

**GitHub Actions**: `.github/workflows/tests.yml` existe y tiene matriz correcta:
```yaml
strategy:
  matrix:
    python-version: ["3.9", "3.11", "3.12"]
```
Los 464 tests corren en tres versiones de Python en cada push. El badge en el README referencia este workflow. Verificado.

**Tag v0.2.2**: `git tag` retorna `v0.2.2`. Verificado.

**CHANGELOG.md**: formato Keep a Changelog, tres versiones documentadas (0.2.0, 0.2.1, 0.2.2). Verificado.

**Versioning**: `forge.py` tiene `VERSION = "0.2.2"`. El tag y el código coinciden. El salto de `2.0.2` a `0.2.2` fue explícito; el repositorio no tiene tags `v2.x.x` colgados.

El único pendiente de gobernanza es la extensión VS Code: `package.json` tiene `publisher: "socialwebcl"` pero la extensión no está publicada en el Marketplace. La barrera es administrativa, no técnica.

---

### 2. Test coverage: regresión relativa importante

El ciclo anterior (v7) terminó con la nota: "los tests de nuevas funcionalidades acompañan el código". En v8, eso no se cumplió.

**464 tests en v7 → 464 tests en v8.**

El codebase creció de 4297 a 5062 líneas (+18%). Los tests no crecieron. Las cuatro áreas sin cobertura nueva:

**`_inject_scope(content, scope_path)`** en `forge-init.py` líneas ~80-95:
```python
def _inject_scope(content: str, scope_path: str) -> str:
    lines = content.split("\n")
    if not lines or lines[0].strip() != "---":
        return content
    end = next((i for i, ln in enumerate(lines[1:], 1) if ln.strip() == "---"), -1)
    if end == -1:
        return content
    ...
    lines.insert(end, f'scope: "{scope_path}"')
    return "\n".join(lines)
```

Edge cases sin cobertura: agente sin bloque YAML inicial, agente con `scope:` ya definido, agente con `---` de cierre ausente, agente con encoding no-ASCII en el path.

**`_generate_claude_md(root, forge, config)`** en `forge-init.py`:
```python
spec = importlib.util.spec_from_file_location("generate_claude_md", gen_script)
mod  = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod.generate_claude_md(config)
```
Si `gen_script` no existe o `generate_claude_md` no está exportado, lanza `AttributeError` o `FileNotFoundError`. Ninguno de los dos está testeado.

**`_generate_settings_json(root, config)`**: genera `.claude/settings.json` con contenido condicionado por `project.language`. Si el campo no existe o tiene un valor inesperado, el JSON puede quedar vacío o incorrecto. Sin tests.

**`_two_panel_opp_picker(items_indexed, root)`**: tres paths de ejecución (TUI completo, fallback simple, modo no-interactivo). Los tests del audit verifican el output JSON en modo `--json`, que pasa por el path no-interactivo. Los otros dos paths no están cubiertos.

El impacto no es inmediato — el framework funciona. El impacto es en el ciclo siguiente: cualquier refactor o cambio de path que rompa estas funciones no será detectado por los tests.

---

### 3. scope injection: feature implementada, flujo roto

El mecanismo técnico es correcto. `_AGENT_SCOPE_KEY` mapea nombres de agentes a keys de `agent_paths`. `_get_agent_scope()` busca el path correspondiente en la configuración. `_inject_scope()` inserta el campo `scope:` en el frontmatter.

El problema es el flujo de usuario:

1. `project.yaml.tpl` tiene `agent_paths` con todos los valores en `null`
2. El wizard no hace ninguna pregunta sobre paths de agentes
3. `forge-init` llama a `_get_agent_scope()` y obtiene `None` para todos los agentes
4. `_inject_scope()` no es llamado (el scope es `None`)
5. Los agentes se instalan sin el campo `scope:`

El resultado: para un proyecto que siguió el wizard desde cero, la feature de scope injection nunca se activa. El usuario no recibe ningún mensaje indicando que existe ni cómo activarla.

La feature tiene valor real cuando funciona: un `api-engineer` con `scope: "packages/api"` solo opera sobre ese directorio, reduciendo el contexto irrelevante que Claude Code carga al invocar el agente. Pero está disponible solo para usuarios que editen manualmente `agent_paths` en `project.yaml`, lo que implica leer la documentación o el template detenidamente.

---

### 4. CLAUDE.md auto-generado: importación dinámica frágil

`_generate_claude_md()` usa `importlib.util.spec_from_file_location` para importar `generate-claude-md.py`. Esta es una decisión técnica razonable para importar un módulo desde un path conocido sin modificar `sys.path`. El problema es la fragilidad ante reorganización de directorios:

```python
gen_script = forge / "adapters" / "claude-code" / "generate-claude-md.py"
```

Si el archivo se renombra, mueve, o el directorio `adapters/claude-code/` cambia de estructura, `forge-init` falla en tiempo de ejecución. El error no es descriptivo: `AttributeError: module has no attribute 'generate_claude_md'` o `FileNotFoundError` dependiendo del punto de fallo.

No hay test que verifique que el path existe y que la función exportada es correcta. En un repositorio con CI, ese test debería existir.

---

### 5. La extensión VS Code: sin Marketplace sigue siendo fricción

El campo `publisher: "socialwebcl"` fue agregado en v8, lo que técnicamente permite publicar. El README actualiza las instrucciones de instalación vía VSIX con versión 0.2.1:

```bash
code --install-extension forge-agent-framework-0.2.1.vsix
```

La extensión tiene funcionalidad completa: audit con oportunidades, init, wizard, generación de CLAUDE.md, vistas de proyecto y agentes. La barrera para publicarla en el Marketplace es exclusivamente administrativa: crear una cuenta de publisher en Azure DevOps y ejecutar `npx vsce publish`.

Mientras la extensión no esté en el Marketplace, el path de instalación requiere que el usuario tenga Node.js, vsce, y sepa compilar TypeScript. Eso excluye a los desarrolladores que quieren adoptar forge exclusivamente a través de VS Code sin tocar la terminal.

---

### 6. SendMessage: sin resolución en cuatro análisis

El agente `core/agents/orchestrator.md` usa `SendMessage({ to: "backend-engineer", message: "..." })` como primitiva de coordinación. Cuatro análisis consecutivos (v5, v6, v7, v8) lo señalan como riesgo sin resolución.

Esto no significa que no funcione. Significa que el comportamiento depende de cómo Claude interpreta esa instrucción en el contexto de una sesión multi-agente. Si el runtime cambia su interpretación, el orchestrator deja de coordinar sin error observable.

La verificación es simple: abrir una sesión de Claude Code con el orchestrator instalado y delegar una tarea. Observar si `SendMessage` es reconocido como una llamada al tool `Agent` de Claude Code o si simplemente se interpreta como texto. El resultado debería documentarse en el agente y/o en la documentación de forge.

---

## Tabla de riesgos actualizada

| Riesgo | Estado v7 | Estado v8 | Impacto |
|--------|-----------|-----------|---------|
| Sin GitHub Actions | Persiste | ✅ Cerrado | — |
| Sin releases semánticos | Persiste | ✅ Cerrado | — |
| Sin CHANGELOG | Persiste | ✅ Cerrado | — |
| Versioning inconsistente | Persiste | ✅ Cerrado | — |
| Extensión VS Code sin Marketplace | Parcial | Parcial (publisher agregado) | Medio |
| SendMessage API sin verificar | Persiste | Persiste | Alto (silencioso) |
| Tests para código nuevo | N/A (v7 cumplió) | Nuevo gap | Medio-Alto |
| scope injection invisible | N/A | Nuevo | Medio |
| Maintainer único | Persiste | Persiste | Alto (largo plazo) |

---

## Conclusión

forge v0.2.2 es la primera versión que un tech lead puede aprobar como dependencia externa con confianza razonable: tiene CI, releases semánticos, y CHANGELOG. El código de calidad que estaba presente desde v5 ahora tiene la gobernanza que le faltaba.

Los problemas pendientes son de naturaleza diferente: no bloquean el uso, pero sí determinan el nivel de deuda que se acumula. El gap de tests es el más urgente técnicamente. La invisibilidad de scope injection es el más urgente de DX. El SendMessage del orchestrator es el más urgente desde el ángulo de riesgo silencioso.

El patrón de los últimos ciclos (cerrar deuda antes de agregar features) se rompió en v8 para la cobertura de tests. No es una regresión grave, pero es una señal a monitorear: si el siguiente ciclo también agrega código sin tests, la brecha se vuelve estructural.
