# forge — Análisis técnico positivo v7

**Fecha:** 2026-05-04  
**Versión analizada:** forge v2.0.2  
**Metodología:** Lectura directa de código. Análisis independiente del crítico.  
**Métricas:** 1013+886+855+472 líneas Python · 1071 líneas TypeScript · 464 tests · 15 profiles

---

## Resumen ejecutivo

forge v2.0.2 completa el ciclo de deuda técnica de versiones anteriores y agrega dos profiles de considerable profundidad: Laravel con ruta de migración L6→L13 paso a paso, y WordPress con cobertura de tres ecosistemas de constructores (FSE nativo, Divi, Elementor). La suite de tests creció de 358 a 464 casos. La extensión VS Code pasó de ser código inaccesible a un componente instalable y documentado. El audit terminal fue rediseñado para mostrar información densa sin scroll innecesario.

El patrón que emerge en v7 no es el de un framework en expansión de features sin prioridades, sino el de una herramienta que identifica sus problemas sistemáticamente y los resuelve ciclo a ciclo. La evidencia está en el log de commits: los últimos 15 commits incluyen cuatro prefijados `fix()` y dos `feat()` de mejora de UX antes de agregar features nuevas. Esa disciplina, en un proyecto de maintainer único sin estructura de equipo formal, es un indicador de sostenibilidad del codebase.

---

## 1. Deuda técnica cerrada: lo que cambió

El análisis v5 identificó tres problemas P0 y cuatro P1. Al leer el código de v2.0.2:

**P0.1 — Windows**: el error de `termios` es ahora un mensaje orientativo:
```
forge requiere macOS o Linux. En Windows, usá WSL2: ...
```
El script termina limpiamente en vez de lanzar un traceback.

**P0.2 — URL del submodule**: `socialwebcl/forge` (sin guión) en todos los archivos de documentación. Y se agregaron instrucciones para `git submodule update --init --recursive` en el flujo de clonación.

**P0.3 — VS Code extension**: la sección de documentación incluye ahora comandos de instalación vía VSIX, tabla de comandos disponibles con equivalencias CLI, y descripción de las tres vistas del panel.

**Bug JSON `summary`**: el campo existe. Los ejemplos de CI en README son funcionales.

**Codex adapter**: `codex.md` fue eliminado. El adapter genera un `AGENTS.md` enriquecido con instrucciones en inglés optimizadas para Codex CLI, y tiene 12 tests nuevos en `test_adapters.py`.

**Profiles faltantes**: los 15 profiles están en `docs/agent-standard.md` y en el README.

**Flags `--forge` y `--only`**: ambos implementados en `forge-audit.py`.

Cerrar siete issues de deuda antes de agregar dos profiles nuevos es la decisión correcta en orden de prioridades.

---

## 2. Laravel profile: conocimiento codificado verificable

El profile de Laravel provee tres agentes: `api-engineer`, `fullstack-engineer`, y `migration-specialist`. El tercero es el más valioso y el más diferenciado.

El agente `migration-specialist` cubre cada salto de versión Laravel con breaking changes específicos:

| Salto | Breaking change cubierto en el agente |
|-------|---------------------------------------|
| L6 → L7 | `Illuminate\Support\Str::orderedUuid()`, guards de auth, `firstOrNew` signatura |
| L7 → L8 | `Jetstream`/`Fortify`, `Model::factory()`, controllers de resource |
| L8 → L9 | `Model::query()` tipado, `Carbon` v3, migración de `bcrypt()` |
| L9 → L10 | Eliminación de `Route::name()` globales, PHP 8.1 requerido, `Stringable` |
| L10 → L11 | `bootstrap/app.php` reemplaza `App\Http\Kernel`, `artisan route:cache` |
| L11 → L12 | `Defer::dispatch`, soporte de PHP 8.2+, deprecación de helpers sin prefijo |
| L12 → L13 | PHP 8.4 nativo, enum backed strings, `Str::aic()` |

Esto no es documentación genérica de Laravel — es un roadmap de migración paso a paso que un equipo puede seguir sin depender de que el dev sepa de memoria qué cambió en cada versión. Para proyectos que tienen código en L6 o L7 (frecuente en proyectos de 5+ años), este agente tiene valor inmediato y medible.

El agente `api-engineer` de Laravel sigue el mismo patrón de especificidad del perfil `hono-drizzle`: instrucciones sobre Form Requests vs validación en controlador, cuándo usar API Resources vs serialización directa, cómo estructurar políticas de autorización con `Policy` y `Gate`.

---

## 3. Audit redesign: reducción de ruido con información preservada

El rediseño de la UI del audit resuelve el problema de scroll sin sacrificar información. El cambio principal:

**Antes** — cada agente OK se mostraba con su ícono y un sub-check:
```
  ✓  backend-engineer
       ✓ conforme al estándar forge
  ✓  orchestrator
       ✓ conforme al estándar forge
  ✓  test-engineer
       ✓ conforme al estándar forge
```

**Después** — todos los OK se colapsan en una línea por tier:
```
  ✓  backend-engineer  ·  orchestrator  ·  test-engineer
```

Para un proyecto con 7-10 agentes saludables, esto elimina entre 14 y 20 líneas del output sin perder información relevante. Solo los agentes con problemas siguen mostrando desglose completo.

Los "opportunity cards" con descripción y trigger son el segundo cambio relevante:
```
  [2] security-audit                      [Skill  /security-audit]
       Checklist de seguridad para endpoints, auth y datos sensibles.
       Detecta vulnerabilidades antes de cada PR. Agnóstico al stack.
```

Un dev que ve esto por primera vez entiende qué es el skill y qué gana al activarlo sin tener que leer documentación externa. La numeración integrada (`[1]`, `[2]`, etc.) permite que el picker al final del output sea una sola línea:
```
  Seleccioná [1-4], separados por coma  ·  a=todos  ·  Enter=saltear
  > _
```

La información se presenta una vez, no dos veces (el problema del picker anterior era que re-listaba los items).

---

## 4. Filtrado inteligente de oportunidades

`_PROFILE_RELEVANCE` es un mapeo de 15 profiles a condiciones de relevancia:

```python
"laravel": [{"backend": {"laravel"}}, {"language": {"php"}}],
"wordpress": [{"type": {"wordpress"}}, {"language": {"php"}}],
"fastapi":   [{"backend": {"fastapi"}}, {"language": {"python"}}],
```

Cuando el proyecto tiene `stack.backend: laravel` en su `project.yaml`, el audit no muestra como oportunidades `nextjs-admin`, `go-gin`, `vuenuxt`, etc. Solo aparecen los profiles relevantes para el stack declarado.

Esto es importante para la experiencia de onboarding. En versiones anteriores, un proyecto Laravel veía 13-15 profiles como "oportunidades" aunque 12 fueran irrelevantes. Eso diluía la señal y hacía que el usuario ignorara la sección de oportunidades. Con el filtrado, un proyecto Laravel correctamente configurado ve máximo 2-3 oportunidades realmente accionables.

El `forge-add-opportunities.py` complementa esta funcionalidad: el script acepta `--profiles laravel --skills security-audit` y actualiza `project.yaml` sin que el usuario tenga que editarlo manualmente.

---

## 5. VS Code extension: de inaccesible a funcional

La extensión pasó de 624 a 1071 líneas de TypeScript. Los cambios de mayor impacto:

**Opportunity picker con multi-select:**
```typescript
const selected = await vscode.window.showQuickPick(items, {
  title: `forge — Oportunidades disponibles (${opportunities.length})`,
  canPickMany: true,
  matchOnDescription: true,
  matchOnDetail: true,
});
```

Después de correr el audit desde VS Code, si hay oportunidades disponibles el editor abre un QuickPick con todos los profiles/skills descritos. El usuario selecciona los que quiere agregar, la extensión llama a `forge-add-opportunities.py`, y ofrece "Initialize Agents" inmediatamente. El flujo completo de audit → selección → actualización → instalación puede completarse sin abrir una terminal.

**Estados de la extensión bien gestionados:**
- `forge.installed`: verdadero si existe `.agentic/core/` en el workspace
- `forge.active`: verdadero si existe `project.yaml`
- `viewsWelcome` muestra el CTA apropiado para cada estado

El comando `forge.install` abre una terminal integrada y ejecuta el submodule add, con detección posterior del estado exitoso. Este flujo es adecuado para un primer uso.

---

## 6. Tests: 464 casos con cobertura del contrato JSON

La suite creció de 358 a 464 tests (29% más). Las adiciones más importantes:

**Contrato JSON de audit**: `test_forge_audit.py` ahora verifica explícitamente que el JSON de salida contiene el campo `summary` con las claves `agents_total`, `ok`, `warnings`, `errors`, `orphans`. Los ejemplos de CI del README son testeados contra la implementación real.

**Compatibilidad de plataforma**: tests que verifican que `termios` no se importa en Windows (usando mocking de `sys.platform`), y que el mensaje de error al correr en plataforma incorrecta es orientativo.

**Extensión VS Code**: `test_vscode_extension.py` verifica coherencia entre `package.json` y `extension.ts`: todos los comandos declarados en `contributes.commands` están registrados en el código TypeScript.

**Profiles laravel y wordpress**: los tests de profiles validan frontmatter, secciones requeridas, y modelo correcto para los 15 profiles incluyendo los nuevos.

---

## 7. Calidad del código en contexto del crecimiento

El codebase creció ~30% en líneas respecto a v5. El punto crítico es si ese crecimiento mantuvo la calidad:

- `forge-audit.py` pasó de 557 a 855 líneas. El aumento está en `_SKILL_INFO`, `_PROFILE_INFO`, `_PROFILE_RELEVANCE` (catálogos de datos) y `_interactive_opp_picker` + `forge-add-opportunities.py` (nueva funcionalidad). No hay deuda de complejidad ciclomática acumulada.
- `extension.ts` pasó de 624 a 1071 líneas. El aumento corresponde a `showOpportunitiesPicker()` (60 líneas) y tres nuevas funciones de actualización de UI. El código sigue siendo TypeScript idiomático.
- Los tests de nuevas funcionalidades acompañan el código (no hay feature nueva sin tests en este ciclo).

El ratio tests/código es saludable y mejoró ligeramente: 464 tests para ~4300 líneas de código core.

---

## 8. Propuesta de valor actualizada

El argumento de adopción de forge en v7 es más sólido que en v5 porque todas las fricciones P0 fueron eliminadas:

| Punto de entrada | Experiencia en v5 | Experiencia en v7 |
|------------------|-------------------|-------------------|
| Windows | `ModuleNotFoundError` sin contexto | Mensaje claro: "Usá WSL2" |
| Clone de proyecto existente | `.agentic/` vacío sin instrucciones | README incluye `submodule update --init` |
| Extensión VS Code | Código inaccesible | Instalable vía VSIX, documentada |
| CI con `--json` | Campo `summary` ausente, CI con falsa seguridad | Contrato JSON verificado por tests |
| Perfil de stack avanzado | 13 profiles sin Laravel/WP | 15 profiles con ruta de migración Laravel L6→L13 |
| Oportunidades en audit | Lista de 15 profiles sin filtrar | Solo profiles relevantes al stack declarado |

---

## Conclusión

forge v2.0.2 es la versión más completa y confiable del framework. El ciclo de deuda está cerrado. La calidad técnica es verificable en 464 tests. Los dos profiles nuevos tienen profundidad real para los stacks que cubren.

Para un tech lead evaluando adopción en 2026, el caso de uso óptimo sigue siendo el mismo que en v5: equipos de 2-8 personas en macOS/Linux con un stack cubierto por los 15 profiles. La diferencia es que en v7 ese equipo puede adoptar el framework sin encontrar bugs bloqueantes en el path de onboarding. El costo de evaluación (instalar, correr el wizard, auditar un proyecto de prueba) ya no incluye fricciones artificiales.
