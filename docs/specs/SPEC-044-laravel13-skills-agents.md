# SPEC-044 Skills + agentes de Laravel 13

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-05 | Actualizada: 2026-06-05

## Contexto

El ecosistema de Laravel adoptó fuertemente el desarrollo asistido por agentes:
**Laravel Boost** (servidor MCP con tools de introspección del proyecto),
**skills.laravel.cloud** (catálogo de Agent Skills instalables por slug) y
**Laravel 13** (marzo 2026, "the clean stack for Artisans and agents") con AI SDK
first-party, `laravel/mcp`, vector search nativo (pgvector) y JSON:API resources.

forge ya tiene un profile `laravel` con 3 agentes (`api-engineer`,
`fullstack-engineer`, `migration-specialist`) pero ningún skill específico de
Laravel. Conviene capitalizar ese ecosistema con contenido forge-native
(no copiar skills de terceros: distintos autores/licencias) que suba el techo de
calidad de los proyectos Laravel gestionados por forge.

## Decisión

Agregar **5 skills** al catálogo (`core/skills/laravel-*`) y **2 agentes** al
profile (`profiles/laravel/agents/`), todos orientados a Laravel 13:

### Skills (catálogo global, instalables por panel / `forge skills`)
- `laravel-eloquent` — modelos, relaciones, eager loading / evitar N+1
  (`preventLazyLoading`), casts y `Attribute`, scopes, recorridos eficientes,
  índices, y vector columns / pgvector.
- `laravel-pest` — TDD con Pest 3 (y PHPUnit): factories/states, Feature/Unit/HTTP,
  fakes, `RefreshDatabase`, datasets, coverage `--min`.
- `laravel-security` — auth (Sanctum/Fortify/Passport), Policies/Gates, Form
  Requests, mass assignment, CSRF, rate limiting, SQLi/XSS, secrets, deploy seguro.
- `laravel-verify` — loop reproducible Pint → Larastan/PHPStan → Pest (coverage) →
  `composer audit` → checks de `artisan about`, cableado en CI / pre-commit.
- `laravel-mcp` — **el diferencial Laravel 13**: Laravel Boost, construir servidores
  MCP con `laravel/mcp` (tools como clases, stdio/HTTP), AI SDK (`laravel/ai`,
  agentes con tool-calling, embeddings), pgvector/RAG y cómo exponer la app a
  agentes de forma segura.

### Agentes (Tier 2, se instalan con el profile laravel)
- `laravel-specialist` — agente estrella. Scope `app/`: Eloquent, Sanctum/Fortify,
  colas/Horizon, eventos, API/JSON:API Resources, Livewire 3/Filament, y awareness
  de las capacidades agent/MCP de Laravel 13.
- `laravel-test-engineer` — TDD con Pest. Scope `tests/` y `database/factories/`.

### Inspiración arquitectónica
El análisis del ecosistema (Boost MCP, guidelines vs skills, registro abierto,
profiles version-aware, búsqueda semántica) se documenta y debate por separado
(RFC de arquitectura); esta spec sólo cubre el contenido Laravel 13.

## Alternativas consideradas

| Opción | Descartada por |
|--------|----------------|
| Skills scoped al profile (`profiles/laravel/skills/`) | requiere extender el CLI (installProfile/manifest/teardown). Se prefiere el catálogo global, que espeja el modelo plano de skills.laravel.cloud sin cambios de CLI. |
| Importar skills de terceros de skills.laravel.cloud | licencias/atribución de múltiples autores; se opta por contenido forge-native. |
| Hardcodear "Laravel 13" en prosa de agentes | viola el guard de versiones; se referencia 13 sólo para features version-específicas (AI SDK/MCP) y se evita el patrón `Laravel 1[0-9],`. |

## Criterios de aceptación

- [ ] 5 `core/skills/laravel-*/SKILL.md` con header `# Skill: <id>` y `Triggers:`.
- [ ] 2 agentes Tier 2 con frontmatter válido (`name/description/model/tier/profile/last_verified`).
- [ ] Los 5 skills registrados en `manifest.json` y en `SKILLS` de `lib/catalog.ts`.
- [ ] Command stubs en `adapters/claude-code/commands/laravel-*.md`.
- [ ] Cero referencias a Python/.agentic; español neutro; pasa `assets.test` (incl. guard de versiones).
- [ ] Test que verifica el registro de skills + existencia de agentes.
- [ ] `npm run build:all` + `npm test` verdes (incl. windows-latest).

## Impacto de compliance

No aplica.
