---
marp: true
theme: default
paginate: true
---

# forge v2 — Análisis Actualizado

**Evaluación comparativa v1 → v2**
3 de mayo de 2026

---

## Agenda

1. Qué cambió desde v1
2. Problemas que persisten
3. Problemas nuevos detectados en v2
4. Nuevas fortalezas: adapters y profiles
5. Nuevas fortalezas: tests y teardown
6. Comparativa v1 vs. v2
7. Veredicto actualizado
8. Cuándo adoptar, cuándo no
9. Q&A

---

## ¿Qué cambió desde v1?

| Problema en v1 | Estado en v2 |
|---|---|
| Bug en `install_agent` (siempre UPDATE) | Corregido con test de regresión |
| Flag `--only` inexistente | Implementado en ambas sintaxis |
| Adapters de OpenCode y Kiro vacíos | Funcionales con 24 tests |
| Sin teardown | `forge-teardown.py` con dry-run |
| 4 profiles | 8 profiles (fastapi, rails, express, nestjs) |
| 0 tests | 112 tests en 7 archivos |
| Sin disclaimer en compliance | Disclaimer en agente y en Kiro |
| Fases de sprint hardcodeadas en CLAUDE.md | Conectadas con `project.yaml` |

> **El equipo respondió al feedback de v1 con trabajo real y medible.**

---

## Problemas que persisten desde v1

**Fix messages del audit no ejecutables**
El audit sugiere `forge-init.py --tool claude-code --force --only=backend-engineer`
El script no está en el PATH → `command not found` al copiar y ejecutar

**Mutación silenciosa en el hook pre-commit**
El hook sigue haciendo `git add docs/progress.html` sin que el desarrollador lo revise
La notificación agregada mitiga levemente; el comportamiento no cambió

**Similitud de texto como métrica de calidad**
`SequenceMatcher.ratio()` con umbrales fijos sigue confundiendo especialización con desactualización

**Actualización destructiva**
`--force` sobreescribe sin merge. No existe alternativa para customizaciones locales.

---

## Problemas nuevos detectados en v2

**`agent-standard.md` más desactualizado que en v1**
- Documenta rails con `backend-engineer (pendiente)` → en el código es `fullstack-engineer`
- Documenta fastapi con `backend-engineer (pendiente)` → en el código es `api-engineer`
- `express` y `nestjs` (profiles nuevos) no aparecen en la tabla

**`--tool opencode` no invoca el adapter de OpenCode**
```python
if tool in ("claude-code", "opencode", "all"):
    init_claude_code(root, forge, config)   # mismo código para ambos
```
Un usuario de OpenCode obtiene una instalación de Claude Code con exit code 0.

**`fullstack-engineer` sin descripción en `forge-init.py`**
El AGENTS.md generado muestra `"Agente de implementación"` para el agente central de rails.

---

## Nuevas fortalezas: adapters y profiles

**8 profiles que cubren el ecosistema moderno**
`hono-drizzle` · `nextjs-admin` · `expo` · `playwright-crawler`
`fastapi` · `express` · `rails` · `nestjs`

Un proyecto FastAPI + Next.js puede declarar `profiles: [fastapi, nextjs-admin]` y obtener agentes especializados para ambas capas con un comando.

**Adapters funcionales para OpenCode y Kiro**
- OpenCode: genera `AGENTS.md` enriquecido con stack y categorías; lee descriptions del frontmatter
- Kiro: genera 4 archivos en `.kiro/steering/` con lógica condicional correcta
- `compliance.md` solo se crea si hay frameworks configurados

**Los tres adapters aplican la misma lógica de compliance automático**
Si `compliance.frameworks` no está vacío y `compliance-reviewer` no está en el roster → se agrega.

---

## Nuevas fortalezas: tests y teardown

**112 tests en cuatro categorías**
- Tests de integración: ejecutan scripts reales sobre `tmp_path`
- Tests unitarios: cargan módulos con `importlib`
- Tests estructurales: recorren todos los profiles dinámicamente
- Tests de regresión: documentan el bug original en el docstring

**`conftest.py`** con `make_project_yaml` y deep merge: cada test configura exactamente lo que necesita.

**`forge-teardown.py` con lógica deliberada**
- Dry-run por defecto
- Elimina solo lo que forge instaló; los agentes Tier 3 sobreviven
- `test_confirm_no_elimina_agentes_tier3` verifica el caso más delicado

> La adopción de forge ahora es **reversible sin pérdida de trabajo acumulado**.

---

## Comparativa v1 vs. v2

| Dimensión | v1 | v2 |
|---|---|---|
| Profiles | 4 | 8 |
| Tests | 0 | 112 |
| Bug `install_agent` | Presente | Resuelto |
| Flag `--only` | Inexistente | Implementado |
| Adapter OpenCode | Vacío | Funcional (no integrado) |
| Adapter Kiro | Vacío | Funcional (integrado) |
| Teardown | Ausente | Presente (parcial) |
| Fix messages ejecutables | No | No |
| `agent-standard.md` sincronizado | Parcialmente | Menos que v1 |
| Python 3.9 | No | Sí |

---

## Veredicto actualizado

**forge v2 mejoró sustancialmente en las cosas medibles.**
Números de tests, profiles, existencia de adapters, corrección del bug principal.

**forge v2 mejoró menos en las cosas que se detectan con uso real.**
Coherencia entre documentación y código, simetría del flag `--tool`, ejecutabilidad del audit.

**Tres problemas prioritarios para v3:**
1. `--tool opencode` debe invocar el adapter de OpenCode
2. Los fix messages del audit deben tener formato ejecutable
3. `agent-standard.md` debe reflejar el ecosistema real

El patrón de respuesta al feedback es positivo.
El framework crece más rápido de lo que sus tests pueden verificar en coherencia entre capas.

---

## ¿Cuándo adoptar, cuándo no?

**Adoptar ahora si:**
- Equipo de 3-8 personas con Claude Code como runtime principal
- Stack cubierto por los 8 profiles disponibles
- Disposición a leer el código cuando difiera de la documentación
- Proyecto con requisitos de compliance real

**Esperar si:**
- Runtime principal es OpenCode (el adapter existe pero no está integrado)
- Se confía en `agent-standard.md` para seleccionar profiles
- Se necesita que los fix messages del audit sean ejecutables sin modificación
- Equipo de 1-2 personas en modo exploración

**Contribuir si:**
- El stack que necesitás no está en los 8 profiles
- El test paramétrico facilita agregar profiles sin overhead adicional

---

## Q&A

**Repositorio:** `/Users/skauch/Developer/Github/forge`
**Commit analizado:** `d828157`
**Informes completos:** `docs/analysis/v2/`

Preguntas sobre hallazgos específicos, metodología de análisis adversarial, o comparativa v1 → v2.
