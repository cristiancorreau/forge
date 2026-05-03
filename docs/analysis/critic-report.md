# Informe crítico: por qué NO recomendamos adoptar forge

**Tipo:** Análisis técnico independiente  
**Revisado:** Mayo 2026  
**Base:** Lectura directa del código en `/Users/skauch/Developer/Github/forge`

---

## 1. Resumen ejecutivo

forge se presenta como un "framework de trabajo para equipos de desarrollo con agentes de IA", agnóstico a la tecnología y compatible con múltiples runtimes. La propuesta es atractiva en papel: configuración centralizada en un `project.yaml`, agentes especializados reutilizables, skills componibles y soporte para compliance regulatorio.

Sin embargo, la lectura del código real revela un framework con una relación costo/beneficio desfavorable para la mayoría de los equipos. No porque sus ideas sean malas —algunas son sólidas—, sino porque las implementa con una capa de indirección, convención y tooling que genera más fricción de la que resuelve. El overhead de adopción es alto, el ecosistema de profiles es embrionario, los adapters para runtimes alternativos son esqueletos vacíos, y la promesa de "agnóstico al tool" no está respaldada por implementación real.

La conclusión es que forge es un framework de opiniones fuertes con muy poco código que las sostenga. Para un equipo con tiempo y disposición de adaptarse a sus convenciones, puede funcionar. Para el resto, agrega complejidad sin retorno claro.

---

## 2. Análisis técnico detallado

### 2.1 La promesa de "agnóstico al tool" no existe en el código

El README promete compatibilidad con "Claude Code, OpenCode, Codex y otros runtimes". La realidad de los adapters es diferente:

- `adapters/claude-code/` contiene dos archivos funcionales: `generate-claude-md.py` y tres comandos de wiki.
- `adapters/opencode/` está vacío. Cero archivos.
- `adapters/kiro/` está vacío. Cero archivos.

El único adapter que funciona es el de Claude Code. `forge-init.py` sí tiene código para `init_kiro()`, pero este método genera apenas dos archivos `.md` con contenido genérico que no aprovecha ningún concepto del framework. La función `init_claude_code` tiene ~130 líneas; `init_kiro` tiene ~30 y produce documentos de placeholder.

Cuando el README dice "compatible con OpenCode y Codex", lo que realmente quiere decir es que el proyecto puede generar un `AGENTS.md` genérico. Eso no es un adapter; es un archivo de texto.

### 2.2 El ecosistema de profiles es un esqueleto de 4 entradas

El sistema de profiles (Tier 2) es conceptualmente la parte más valiosa del framework: agentes especializados por stack, que reemplazan a los genéricos. La realidad:

```
profiles/
├── expo/agents/mobile-engineer.md          (1 agente)
├── hono-drizzle/agents/api-engineer.md     (1 agente)
├── nextjs-admin/agents/admin-engineer.md   (1 agente)
└── playwright-crawler/agents/scanner-engineer.md  (1 agente)
```

Cuatro profiles, un agente cada uno. El propio `agent-standard.md` lista `rails` y `fastapi` como "pendiente". No existe cobertura para stacks populares como Django, Express, Laravel, NestJS o Nuxt. Un equipo que use cualquier stack fuera de los cuatro listados recibirá solo los agentes genéricos de Tier 1, que no tienen conocimiento del stack y producen instrucciones vagas como "adaptá si el proyecto usa nombres distintos".

### 2.3 forge-init.py: bug silencioso en el status de instalación

En `scripts/forge-init.py`, la función `install_agent` tiene un defecto lógico:

```python
def install_agent(src: Path, dst: Path, name: str, source_label: str) -> str:
    if not src.exists():
        return "MISS"
    if dst.exists() and not FORCE:
        return "KEEP"
    shutil.copy2(src, dst)
    return "UPDATE" if dst.exists() else "OK"
```

La línea `return "UPDATE" if dst.exists() else "OK"` se evalúa **después** de ejecutar `shutil.copy2(src, dst)`. Una vez que `copy2` copia el archivo, `dst.exists()` siempre será `True`, por lo que el status `"OK"` para una instalación nueva nunca se devuelve en la práctica: todo se reporta como `"UPDATE"`. Es un bug menor en la UI, pero ilustra la falta de tests sobre el propio tooling.

### 2.4 forge-audit.py: complejidad sin fiabilidad

`forge-audit.py` tiene casi 500 líneas y realiza análisis de similitud de texto entre los agentes del proyecto y los de forge usando `SequenceMatcher`. El problema:

1. **La similitud de texto no mide calidad conceptual.** Un agente profundamente especializado (Tier 3) que reescribe el de forge para adaptarlo a su dominio será marcado como "muy diferente / probablemente desactualizado" si la similitud cae por debajo del 50%, aunque esté perfectamente bien.

2. **Los umbrales son arbitrarios y sin calibración.** `SIMILARITY_WARN = 0.80` y `SIMILARITY_OUTDATED = 0.50` están hardcodeados sin documentación que justifique esos valores.

3. **La heurística de "extended" es frágil.** El código considera que un agente con más del 20% de líneas que forge es "especialización intencional". Esto es una aproximación burda que puede producir tanto falsos positivos como falsos negativos.

4. **El flag `--only=<agent>` que aparece en los mensajes de fix no existe.** `forge-init.py` no soporta ese flag. Los mensajes de corrección que el audit sugiere al usuario son ejecutar un comando que falla.

```python
"fix": f"forge-init.py --tool claude-code --force --only={agent['name']}"
```

Buscar `--only` en `forge-init.py`: no aparece. Es un mensaje de acción falsa.

### 2.5 generate-claude-md.py: generación rígida con lógica hardcodeada

El generador de `CLAUDE.md` mapea `language` a comandos de desarrollo mediante un bloque `if/elif` que cubre cuatro lenguajes: TypeScript, Python, Ruby y Go. Cualquier otro lenguaje cae al caso `else` con `# ver documentación del proyecto` en todos los campos. El campo `language` en `project.yaml.tpl` permite `"mixed"`, pero el generador no tiene rama para ese caso.

Más problemático: el `CLAUDE.md` generado contiene una sección "Phases activas y estado" con contenido fijo:

```
- **Completadas:** —
- **En curso:** —
- **Pendientes:** —
```

Esa sección se genera igual para todos los proyectos y no se conecta con los datos del `project.yaml` (`sprint.phases`). La "fuente de verdad" del framework no alimenta el documento principal que los agentes leerán. El usuario debe actualizar esa sección a mano, lo que contradice el propósito de la generación automática.

### 2.6 El hook pre-commit introduce mutación silenciosa en los commits

`hooks/pre-commit` parchea `docs/progress.html` con estadísticas de tokens y hace `git add` sobre ese archivo antes de completar el commit. Esto significa que cada commit puede incluir un archivo que el desarrollador no inspeccionó, modificado por el hook en el momento del commit.

El problema no es técnico sino de trazabilidad: si el script `token-stats.py` introduce un error en el HTML, ese error queda en el commit sin que el desarrollador lo haya visto. El script usa `|| true` para suprimir errores, lo que asegura que fallos silenciosos no bloqueen el commit pero tampoco sean visibles.

### 2.7 La capa de abstracción genera dependencia sin escape limpio

Adoptar forge como git submodule significa:

1. Un `project.yaml` que debe mantenerse sincronizado con la realidad del proyecto.
2. Scripts Python que deben ejecutarse manualmente cuando cambia la configuración.
3. Agentes en `.claude/agents/` que pueden divergir del core si forge evoluciona.
4. Un hook de git que asume la existencia de `docs/progress.html`.
5. Un audit que reporta divergencias con recomendaciones de fix incorrectas (ver punto 2.4).

No existe un comando de "teardown" ni una guía de migración para abandonar el framework. Salir de forge implica limpiar manualmente todos los archivos generados, el submodule, el hook y el `project.yaml`.

---

## 3. Riesgos de adopción

**Riesgo de lock-in opaco.** forge no hace lock-in técnico (no hay servidor, no hay API key propia), pero hace lock-in de convención: los agentes esperan `docs/specs/`, `CLAUDE.md`, `AGENTS.md` y `project.yaml` en ubicaciones fijas. Cambiar cualquiera de estas convenciones requiere editar los agentes manualmente.

**Riesgo de desactualización divergente.** El mecanismo de actualización es `forge-init.py --force`, que sobreescribe los agentes del proyecto con la versión de forge. Esto destruye cualquier customización que el equipo haya hecho. Sin `--force`, los agentes no se actualizan. No hay merge ni versionado: es todo o nada.

**Riesgo de falsa seguridad en compliance.** El `compliance-reviewer` usa `model: opus` y tiene un checklist razonable, pero no tiene acceso a las leyes en texto completo ni integración con fuentes oficiales. Es un agente que razona sobre compliance con el conocimiento de entrenamiento del modelo. Para aplicaciones que realmente operan bajo GDPR, Ley 21.719 o LGPD, un checklist en un archivo Markdown no sustituye revisión legal real. El framework no advierte esta limitación.

**Riesgo de overhead en equipos pequeños.** El flujo SDD exige una spec aprobada antes de cada feature. Para un equipo de uno o dos desarrolladores trabajando en modo exploración, esta restricción es un cuello de botella sin beneficio. El orchestrator rechaza spawnear agentes sin spec, lo que convierte el framework en un obstáculo para el trabajo iterativo.

**Riesgo de tooling roto sin aviso.** Los mensajes de fix del audit sugieren comandos que no existen (`--only` flag). Un desarrollador nuevo que confíe en esas sugerencias perderá tiempo investigando por qué el comando falla.

---

## 4. Comparación con alternativas más simples

### CLAUDE.md manual

La alternativa más directa es escribir un `CLAUDE.md` a mano con las convenciones del proyecto. Costo: 30 minutos. Beneficio: control total, sin dependencias, sin scripts externos, sin riesgo de que un generador produzca contenido desactualizado.

forge ofrece generación automática de este archivo, pero el archivo generado tiene secciones vacías que el desarrollador debe completar igualmente (fases del sprint, estructura del proyecto real). La ventaja es marginal.

### Archivos de agente directamente en `.claude/agents/`

Claude Code soporta nativamente subagentes definidos en `.claude/agents/`. Un equipo puede definir sus propios agentes sin forge, sin `project.yaml`, sin scripts de init. El "framework" es simplemente el directorio. Añadir un agente es crear un archivo `.md`. No hay nada que instalar ni mantener.

### Repositorio interno de plantillas

Para equipos que quieren reutilizar convenciones entre proyectos, un repositorio de plantillas (un directorio `templates/` con archivos de agente base) copiado manualmente o con un script de 20 líneas cubre el 80% del valor de forge sin la capa de indirección. Sin submodule, sin audit de similitud, sin hook de git automático.

La diferencia entre estas alternativas y forge es que forge intenta ser más sofisticado: ofrece profiles, tiers, skills componibles y auditoría automática. Pero esa sofisticación tiene un costo de mantenimiento real (los profiles están incompletos, los adapters vacíos, el audit tiene bugs) que las alternativas simples no tienen.

---

## 5. Conclusión: por qué no recomendamos este framework

forge tiene ideas bien estructuradas: la separación en tiers de agentes, el sistema de profiles por stack, la composición de skills, el flujo SDD. Su documentación interna (`agent-standard.md`, `methodology`) es clara y refleja pensamiento cuidadoso.

El problema es que **el código no está a la altura de las ideas**.

Los adapters para OpenCode y Kiro no tienen implementación. El ecosistema de profiles cubre cuatro stacks con un agente cada uno. El audit sugiere comandos que no existen. El generador de `CLAUDE.md` desconecta la "fuente de verdad" del documento que los agentes leerán. El pre-commit hook muta silenciosamente archivos sin que el desarrollador los vea. El flag `--force` destruye customizaciones sin posibilidad de merge.

Un framework que promete ser agnóstico al tool pero solo funciona con uno. Que promete mantener los agentes actualizados pero el mecanismo de actualización es destructivo. Que incluye un audit que reporta acciones de corrección incorrectas. Que añade cinco dependencias de convención (project.yaml, CLAUDE.md, AGENTS.md, docs/specs/, hooks) sin un camino claro de salida.

Para un equipo que adopte forge hoy, el resultado más probable es un submodule que se desactualiza, un `project.yaml` que diverge de la realidad, y agentes en `.claude/agents/` que nadie actualiza porque `--force` destruiría sus modificaciones. Con el tiempo, el framework se convierte en deuda: archivos de configuración que existían "porque forge los pidió" y que nadie entiende del todo.

La recomendación es no adoptar forge en su estado actual. Si la propuesta de valor (agentes reutilizables, compliance integrado, SDD) es relevante para el equipo, la inversión correcta es construir esas convenciones directamente en el repositorio del proyecto, sin la capa de indirección que forge introduce y sin heredar sus limitaciones actuales.

---

*Informe basado en lectura directa de: `README.md`, `templates/project.yaml.tpl`, `scripts/forge-init.py`, `scripts/forge-audit.py`, `adapters/claude-code/generate-claude-md.py`, `core/agents/*.md` (7 agentes), `core/skills/README.md`, `core/skills/new-feature/SKILL.md`, `core/skills/local2prod/SKILL.md`, `profiles/` (4 profiles), `hooks/pre-commit`, `docs/agent-standard.md`, `core/workflows/sdd.md`.*
