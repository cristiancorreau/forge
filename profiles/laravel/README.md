# Profile: laravel

Stack Laravel (12/13) + Sanctum + Eloquent + PostgreSQL o MySQL. Ideal para proyectos PHP que necesitan una API robusta con autenticación token-based, Form Requests, API Resources y jobs asíncronos. Los agentes y skills están orientados a Laravel 13 (AI SDK, `laravel/mcp`, Boost, vector search) manteniendo compatibilidad con 12.

## Agentes incluidos

- **api-engineer** — modelos Eloquent, migraciones, Form Requests, API Resources, controladores, rutas y Feature Tests.
- **fullstack-engineer** — features end-to-end (backend + Blade/Livewire).
- **migration-specialist** — migraciones y actualizaciones de versión de Laravel.
- **laravel-specialist** — agente estrella (scope `app/`): Eloquent y optimización de queries, Sanctum/Fortify, colas/Horizon, eventos, API/JSON:API Resources, Livewire 3/Filament, y capacidades agent/MCP de Laravel 13.
- **laravel-test-engineer** — TDD con Pest 3 (scope `tests/` y `database/factories/`).

## Skills de Laravel (catálogo)

Instalables desde `forge panel` / `forge skills` (también disponibles para cualquier proyecto):

- **laravel-eloquent** — relaciones, eager loading, evitar N+1, casts, scopes, pgvector.
- **laravel-pest** — TDD con Pest 3 (y PHPUnit): factories, fakes, HTTP tests, coverage.
- **laravel-security** — auth, Policies/Gates, Form Requests, CSRF, rate limiting, deploy seguro.
- **laravel-verify** — loop Pint → Larastan/PHPStan → Pest (coverage) → `composer audit`.
- **laravel-mcp** — Laravel 13 para agentes/MCP: Boost, `laravel/mcp`, AI SDK, embeddings y RAG con pgvector.

## Cuándo usar este profile

- El stack de backend usa Laravel (10, 11 o 12).
- La autenticación es Sanctum (SPA/mobile) o Passport (OAuth2 completo).
- La base de datos es PostgreSQL o MySQL.
- El linter es Laravel Pint (PSR-12).

## Hooks específicos del stack

| Hook | Evento | Descripción |
|---|---|---|
| `pre-edit-check.py` | PreToolUse/Edit\|Write | Detecta `var_dump()`, `dd()`, `print_r()` en archivos `.php`; bloquea secrets hardcodeados; protege `main` |
| `pre-bash-check.py` | PreToolUse/Bash | Bloquea comandos destructivos en producción |
| `composer-check.py` | PreToolUse/Bash | Verifica que `composer install/update` no instale paquetes de dev en producción; advierte sobre `artisan migrate:fresh/reset` (stack: laravel) |

Ver `core/hooks/hooks-registry.yaml` para la lista completa.

## Activar en project.yaml

```yaml
profiles:
  active:
    - laravel
```
