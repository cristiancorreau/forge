# forge v2.0 — Análisis Técnico Dual

**Evaluación independiente del framework de agentes IA**
Fecha: 2026-05-03

---

## ¿Qué es forge?

Framework de desarrollo con agentes IA para equipos de software.

**Función central:** leer `project.yaml` → generar configuración de agentes para Claude Code, OpenCode y Kiro.

**En números:**
- 290 tests · pasan en 2.5s
- 9 profiles de stack
- 7 agentes core universales
- 20 MCP servers catalogados
- 1 dependencia externa (`pyyaml`)

---

## Metodología: análisis dual independiente

Dos análisis del mismo repositorio sin coordinación entre sí.

| | Agente Crítico | Agente Positivo |
|---|---|---|
| **Posición** | No recomienda forge | Recomienda forge |
| **Fuente** | Mismo código fuente | Mismo código fuente |
| **Diferencia** | Peso asignado a cada hallazgo | Contexto de uso asumido |

**Objetivo:** separar hechos objetivos del código de interpretaciones dependientes del contexto.

---

## Fortalezas clave (1/2)

### Arquitectura de tres tiers coherente

```
Tier 1 — Universal    forge/core/agents/         (7 agentes)
Tier 2 — Profile      forge/profiles/<stack>/    (9 stacks)
Tier 3 — Dominio      proyecto/.claude/agents/   (no lo toca forge)
```

**Por qué funciona:** el criterio de clasificación es objetivo y verificable. La prioridad Tier 2 > Tier 1 tiene test explícito. Los agentes Tier 3 son invisibles para el framework.

### Suite de tests con cobertura estructural real

290 tests en 11 archivos temáticos: wizard (33 tests), integración con filesystem temporal, auditoría con agentes sintéticos, validación parametrizada de todos los profiles.

---

## Fortalezas clave (2/2)

### Catálogo MCP funcional offline

40+ recursos · 20 MCP servers con instalación guiada directa a `.claude/settings.json`

Cubre el ciclo completo: git, GitHub, postgres, sqlite, Playwright, Docker, Cloudflare, Vercel, Linear, Sentry, memoria persistente.

### Audit integrable en CI/CD

```bash
forge-audit.py --json | jq '.summary'
# exit code 1 si hay errores críticos
```

### Wizard con inferencia inteligente

Detecta modo por tamaño de equipo, infiere lenguaje por stack, sugiere profiles, ajusta YAML según compliance y base de datos.

---

## Limitaciones y riesgos (1/2)

### Asimetría de runtimes — hecho del código, no interpretación

| Runtime | Soporte | Genera |
|---|---|---|
| Claude Code | Completo | agents/ + CLAUDE.md + slash commands |
| OpenCode | Parcial | AGENTS.md con roster |
| Kiro | Básico | 4 archivos de steering genéricos |

Skills `browser-test`, `wiki-ingest` y `obsidian-sync`: **exclusivos de Claude Code**.

### Mecánica de actualización con riesgo de pérdida de datos

`forge-init.py --force` sobreescribe personalizaciones sin merge semántico ni rollback. La guía lo documenta explícitamente como operación peligrosa.

---

## Limitaciones y riesgos (2/2)

### CLI no automatizable

```python
# forge.py línea 958-960
if not IS_TTY:
    print("forge: terminal interactivo requerido.")
    sys.exit(1)
```

No hay modo no-interactivo para pipelines de CI completos.

### Mantenimiento de instancia única

- Un solo maintainer
- Sin versioning semántico formal
- Sin CONTRIBUTING.md
- Sin señales de comunidad externa

El riesgo de continuidad recae en el proyecto que adopta forge.

### Precios hardcodeados en `token-stats.py`

Tarifas de Anthropic que envejecen sin advertencia ni mecanismo de actualización automática.

---

## Casos de uso ideales

**Equipo de 3-8 personas con Claude Code activo**
El wizard configura el roster en minutos. El audit mantiene coherencia. El catálogo elimina fricción de configuración MCP.

**Proyecto con compliance regulatorio (GDPR, Ley 21.719)**
El `compliance-reviewer` con poder de veto se instala automáticamente. Las reglas no-negociables están en el core de cada agente, no en instrucciones ad hoc.

**Equipo que evalúa múltiples runtimes**
Un solo `project.yaml` genera configuración para Claude Code, OpenCode y Kiro con `forge-init.py --tool all`.

**CI/CD con verificación de agentes**
El flag `--json` con exit code semántico permite un paso de verificación de coherencia en cualquier pipeline.

---

## Casos donde NO es la solución

**Desarrolladores individuales o pares**
El overhead de submodule, YAML y hooks no se amortiza. Configurar `.claude/agents/` directamente es más simple y suficiente.

**Stacks no cubiertos sin recursos para completar profiles**
Django, Laravel, Vue/Nuxt, SvelteKit, Remix, Go, Spring Boot, monorepos. El scaffold genera estructura vacía de conocimiento específico.

**Organizaciones con política de independencia de vendor**
El lock-in con Anthropic/Claude Code es estructural. Migrar implica reescribir la integración desde cero.

**Pipelines de CI que requieren automatización total**
Sin modo no-interactivo documentado para el wizard completo.

---

## Matriz de decisión

| Criterio | Usar forge | No usar forge |
|---|---|---|
| Runtime | Claude Code activo | Portabilidad entre herramientas IA |
| Equipo | 3-8 personas o 9+ | 1-2 personas |
| Stack | hono, nextjs, fastapi, rails, nestjs | Django, Laravel, Go, SvelteKit... |
| Compliance | GDPR, Ley 21.719 | Sin requisitos regulatorios |
| Git fluency | Cómodo con submodules | Sin experiencia con submodules |
| CI/CD | Scripts directos | Automatización sin TTY |
| Vendor risk | Asumible | No negociable |

---

## Veredicto y recomendación

**forge es la herramienta correcta cuando:**
- El equipo ya adoptó Claude Code como herramienta principal
- El stack está cubierto por los profiles existentes
- El equipo tiene 3-8 personas
- Hay requisitos de compliance o necesidad de roster estandarizado

**forge no es la solución cuando:**
- Se busca portabilidad entre runtimes de IA
- El equipo es de 1-2 personas
- El stack no está cubierto y no hay recursos para completar profiles
- La política organizacional prioriza independencia de vendor

**La alternativa válida:** configurar `.claude/agents/` directamente sin intermediario. Menor overhead, control total, riesgo de lock-in cero — pero sin estandarización entre proyectos ni auditoría automática.

---

## Próximos pasos sugeridos

**Para equipos que decidan adoptar forge:**
1. Verificar que el stack principal tiene profile disponible
2. Documentar plan de contingencia ante discontinuación del upstream
3. Revisar compatibilidad del lock-in con Anthropic con la política de vendor de la organización
4. Evaluar el onboarding con un proyecto piloto antes de adopción masiva

**Para el maintainer de forge:**
1. Agregar sanitización de entrada en `build_yaml()`
2. Documentar secuencias script-a-script equivalentes para CI sin TTY
3. Automatizar el teardown completo del submodule en `forge-teardown.py`
4. Añadir versioning semántico formal y mecanismo de actualización de precios
5. Expandir profiles para Django, Vue/Nuxt y monorepos con Turborepo
