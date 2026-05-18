# Profile: laravel

API REST construida con Laravel 10/11/12 + Sanctum + Eloquent + PostgreSQL o MySQL. Ideal para proyectos PHP que necesitan una API robusta con autenticación token-based, Form Requests, API Resources y jobs asíncronos.

## Agentes incluidos

- **api-engineer** — implementa modelos Eloquent, migraciones, Form Requests, API Resources, controladores, rutas y Feature Tests con PHPUnit.

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
