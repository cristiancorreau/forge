# Estándar de Agentes — forge

> **Versión del estándar:** `1.0`  
> Cambios breaking incrementan la versión mayor. forge-audit detecta la versión de cada agente.

Referencia para crear, clasificar y mantener agentes en el framework forge.

## Los 3 tiers

```
Tier 1 — Universal        forge/core/agents/
Tier 2 — Profile          forge/profiles/<stack>/agents/
Tier 3 — Dominio          proyecto/.claude/agents/
```

### Tier 1 — Universal

Agentes definidos por su **tipo de output**, no por tecnología.
Cualquier proyecto de cualquier stack los puede usar sin modificación.

**Criterio de clasificación:** ¿Podría usar este agente en un proyecto Rails, en uno de Hono
y en uno de FastAPI sin cambiar nada? Si la respuesta es sí → Tier 1.

| Agente | Por qué es Tier 1 |
|--------|------------------|
| `orchestrator` | Coordinar agentes es igual en cualquier stack |
| `test-engineer` | Escribir tests aplica a cualquier lenguaje |
| `docs-writer` | Documentar es universal |
| `compliance-reviewer` | El proceso de review legal no depende del stack |
| `security-auditor` | Auth, IDOR, SQL injection son universales |

### Tier 2 — Profile

Mismo rol que Tier 1 pero con instrucciones específicas al stack.
Un `api-engineer` en Hono+Drizzle no es igual a uno en Rails — el rol es el mismo,
los comandos, convenciones y anti-patterns son distintos.

Los profiles viven en `forge/profiles/<stack-name>/agents/`.
Un proyecto puede usar múltiples profiles (ej: `hono-drizzle` + `nextjs-admin`).

**Criterio de clasificación:** ¿El agente hace lo mismo en todos los proyectos pero con
herramientas diferentes? Si la respuesta es sí → Tier 2.

| Profile | Agentes que provee |
|---------|-------------------|
| `hono-drizzle` | `api-engineer` — Hono + Drizzle + TypeScript |
| `nextjs-admin` | `admin-engineer` — Next.js 15 + shadcn/ui |
| `astro` | `frontend-engineer` — Astro + Tailwind |
| `expo` | `mobile-engineer` — React Native / Expo |
| `playwright-crawler` | `scanner-engineer` — Scraping y crawling |
| `fastapi` | `api-engineer` — FastAPI + Python |
| `express` | `api-engineer` — Express + Node.js |
| `rails` | `fullstack-engineer` — Ruby on Rails |
| `nestjs` | `api-engineer` — NestJS + TypeScript |
| `django` | `api-engineer` — Django 4.x + Django REST Framework |
| `go-gin` | `api-engineer` — Go + Gin + sqlc |
| `sveltekit` | `frontend-engineer` — SvelteKit 2 + Svelte 5 runes |
| `vuenuxt` | `frontend-engineer` — Nuxt 3 + Vue 3 + Pinia |

### Tier 3 — Dominio

Agentes que conocen conceptos del negocio del producto. No son reutilizables fuera
del mismo tipo de producto. Viven solo en el proyecto.

**Criterio de clasificación:** ¿El nombre del agente refiere a un concepto del negocio
(no a un rol técnico)? Si la respuesta es sí → Tier 3.

| Agente (ejemplo) | Por qué es Tier 3 |
|------------------|------------------|
| `dsar-specialist` | DSAR es un concepto de Ley 21.719 |
| `gcm-engineer` | Google Consent Mode es de productos CMP |
| `policy-engineer` | Generación de políticas de privacidad |
| `banner-engineer` | Banner SDK es específico de CookyCMP |

---

## Naming convention

| Tier | Patrón de nombre | Ejemplos |
|------|-----------------|---------|
| Tier 1 | `<rol>-engineer` · `<rol>-reviewer` · `<rol>-auditor` | `test-engineer`, `security-auditor` |
| Tier 2 | igual al Tier 1 que extiende (mismo nombre, distinto path) | `api-engineer` en `profiles/hono-drizzle/` |
| Tier 3 | `<dominio>-<rol>` · `<dominio>-specialist` | `dsar-specialist`, `gcm-engineer` |

**Regla de colisión Tier 1 vs Tier 2:** cuando un proyecto activa un profile que provee
`api-engineer`, ese archivo tiene prioridad sobre el Tier 1 genérico.
`forge-init.py` instala primero los de profiles, luego los de core (sin sobreescribir).

---

## Anatomía de un agente

Todo agente en cualquier tier sigue esta estructura exacta, en este orden:

```markdown
---
name: <nombre>
description: <UNA línea: qué hace + scope exacto. Es lo que lee el orchestrator.>
model: opus | sonnet | haiku
tools: Read, Grep, Glob, Bash, Edit, Write [, Agent, WebFetch si aplica]
tier: 1 | 2 | 3
profile: <nombre-del-profile>   ← solo Tier 2; omitir en Tier 1 y 3
---

# Nombre del Agente [— Stack o Dominio si Tier 2/3]

[1 párrafo] Quién sos y cuál es tu scope EXACTO.
Dónde terminás, empieza otro agente.

## Stack   ← solo Tier 2; en Tier 1 es opcional
[Tecnologías que usás, versiones cuando importa]

## Tu trabajo  ← Tier 1; en Tier 2/3 puede llamarse diferente
[Lista de lo que SÍ hacés]

## Reglas
[Restricciones en orden de importancia. Las críticas de compliance primero.]

## Workflow  ← opcional, incluir cuando el orden importa
[Pasos numerados: leer spec → implementar → verificar → reportar]

## No hagas
[Lista explícita de lo que está fuera de scope. Tan importante como las reglas.]
```

### El campo `description` es el más crítico

El orchestrator lee SOLO el `description` del frontmatter para decidir a quién delegar.
Debe responder en una línea: **¿qué hace este agente y en qué directorio trabaja?**

```
✓ "Implementa el backend del proyecto. Hono + Drizzle. NO trabaja fuera de packages/api."
✓ "Construye el dashboard admin con Next.js 15 + shadcn/ui. Scope: packages/admin."
✗ "Agente de backend"   ← demasiado vago
✗ "Implementa todo el sistema de autenticación de CookyCMP usando JWT con kid blocklist..."  ← demasiado largo
```

### Elección de modelo

| Modelo | Cuándo usarlo |
|--------|--------------|
| `opus` | Decisiones complejas, razonamiento legal, compliance, security audit |
| `sonnet` | Implementación de código (el 90% de los casos) |
| `haiku` | Tareas mecánicas: renombrar, formatear, generar boilerplate |

---

## Cómo agregar un agente nuevo

### Si es Tier 1
1. Crear `forge/core/agents/<nombre>.md`
2. Verificar que el nombre no colisiona con ningún Tier 2 existente
3. Agregar al catálogo en este documento
4. El campo `tier: 1` en el frontmatter es obligatorio

### Si es Tier 2
1. Identificar o crear el profile en `forge/profiles/<stack-name>/`
2. Crear `forge/profiles/<stack-name>/agents/<nombre>.md`
3. El nombre debe coincidir con el Tier 1 que extiende (o ser único si no hay Tier 1 equivalente)
4. Agregar `tier: 2` y `profile: <stack-name>` en el frontmatter
5. Documentar el profile en la tabla de esta página

### Si es Tier 3
1. Crear directamente en `proyecto/.claude/agents/<nombre>.md`
2. Agregar a `agents.specialized` en `project.yaml`
3. No va a forge

---

## Checklist antes de publicar un agente

- [ ] `description` en una línea: qué hace + scope exacto
- [ ] `tier` declarado en el frontmatter
- [ ] Sección "No hagas" presente (tan importante como las reglas)
- [ ] `model` justificado (no usar opus por defecto — sonnet es más económico)
- [ ] Sin referencias a proyectos específicos en Tier 1 y Tier 2
- [ ] Sin secrets, tokens ni paths absolutos hardcodeados
- [ ] Workflow incluye: leer spec → implementar → verificar → reportar al orchestrator
