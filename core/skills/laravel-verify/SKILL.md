---
name: laravel-verify
description: "Loop de verificación reproducible para Laravel antes de commit/PR: formato (Pint), análisis estático (Larastan/PHPStan), tests con coverage (Pest), audit de dependencias y checks de configuración. Devuelve PASA o FALLA con acciones concretas."
---

# Skill: laravel-verify

Loop de verificación reproducible para Laravel antes de commit/PR: formato (Pint),
análisis estático (Larastan/PHPStan), tests con coverage (Pest), audit de dependencias
y checks de configuración. Devuelve **PASA / FALLA** con acciones concretas.

Triggers: /laravel-verify, "verificar antes de commit", "loop de verificación laravel",
"chequeo previo a PR", "pint phpstan pest", "está listo para mergear", "correr el quality gate".

---

## Cuándo usar este skill

- Antes de cada `git commit` o de abrir un PR en un proyecto Laravel.
- Como gate de CI (GitHub Actions) en `pull_request` y `push`.
- Como hook de pre-commit local para evitar romper `main`.
- Cuando el `forge-quality-reviewer` pide la corrida completa de verificación.

Requisitos del proyecto (Laravel / PHP 8.3+):

```bash
composer require --dev laravel/pint larastan/larastan pestphp/pest \
  pestphp/pest-plugin-laravel
```

Coverage de Pest necesita `xdebug` (modo `coverage`) o `pcov`. En CI usa `pcov` por
velocidad. El orden del loop es **rápido → costoso**: primero falla lo barato (Pint),
después lo caro (Pest), para acortar el ciclo de feedback.

---

## El loop, de un vistazo

| # | Paso | Comando | Falla si… |
|---|------|---------|-----------|
| 1 | Formato | `./vendor/bin/pint --test` | hay archivos sin formatear |
| 2 | Estático | `./vendor/bin/phpstan analyse` | hay errores fuera del baseline |
| 3 | Tests + coverage | `./vendor/bin/pest --coverage --min=80` | falla un test o coverage < 80% |
| 4 | Dependencias | `composer audit` | hay CVE en dependencias |
| 5 | Config | `php artisan about` + asserts | `APP_DEBUG=true` o `APP_ENV` mal seteado |

Regla de oro: **no se hace commit con ningún paso en rojo.** Cada paso de abajo trae el
comando exacto, qué mirar y la acción concreta para arreglarlo.

---

## Paso 1 — Pint (formato de código)

Pint es el formateador oficial (envoltorio sobre PHP-CS-Fixer). En el loop se corre en
modo `--test` (no modifica nada, solo reporta). El autofix queda explícito.

```bash
# Verifica sin modificar — esto es lo que corre el gate
./vendor/bin/pint --test

# Solo archivos con cambios (git working tree) — ideal para pre-commit, mucho más rápido
./vendor/bin/pint --test --dirty
```

**Acción si FALLA:** corre el autofix y vuelve a verificar.

```bash
./vendor/bin/pint --dirty   # formatea solo lo modificado
./vendor/bin/pint           # formatea todo el proyecto
./vendor/bin/pint --test    # confirma que ya pasa
```

Define el preset en `pint.json` en la raíz del proyecto (recomendado: `laravel`):

```json
{
    "preset": "laravel",
    "rules": {
        "declare_strict_types": true,
        "ordered_imports": { "sort_algorithm": "alpha" },
        "no_unused_imports": true
    },
    "exclude": ["bootstrap/cache", "storage"]
}
```

En CI puedes emitir un reporte parseable con `--format=checkstyle --report=pint-report.xml`
(útil con `cs2pr` para anotar el PR); localmente deja el output por defecto, que lista cada
archivo con su diff.

---

## Paso 2 — Larastan / PHPStan (análisis estático)

Larastan extiende PHPStan con reglas conscientes de Laravel (entiende `Model::find()`,
facades, relaciones Eloquent, etc.). Se instala como extensión y PHPStan la autodescubre.

`phpstan.neon` en la raíz:

```neon
includes:
    - vendor/larastan/larastan/extension.neon
    - phpstan-baseline.neon

parameters:
    level: 6
    paths:
        - app/
        - bootstrap/app.php
        - config/
        - database/
        - routes/
    # Regla de Larastan que valida nombres de propiedades de modelo en argumentos tipados.
    checkModelProperties: true
    # PHPStan 2.x (que usa Larastan 3) ya NO tiene checkMissingIterableValueType.
    # Para tolerar arrays sin value-type se ignora por identificador de error:
    ignoreErrors:
        - identifier: missingType.iterableValue
```

Corrida del gate:

```bash
./vendor/bin/phpstan analyse                 # usa phpstan.neon
./vendor/bin/phpstan analyse --memory-limit=2G
```

### Subida gradual de nivel (0 → 10)

No subas a nivel 9 de golpe en un código existente: te llenas de errores. Estrategia:

```bash
# Empieza donde el proyecto esté limpio (típico: 5 o 6 en código Laravel maduro)
./vendor/bin/phpstan analyse --level=6

# Cuando level N pasa sin errores, sube a N+1 y arregla lo nuevo:
./vendor/bin/phpstan analyse --level=7
```

Metas razonables en Laravel: **level 6** como mínimo de merge, **level 8** como objetivo
del proyecto. Niveles 9–10 (chequeo estricto de `mixed`/null) solo si el equipo se compromete.

### Baseline — congelar la deuda existente

El baseline registra los errores actuales para que el gate solo falle ante errores **nuevos**.
Es la herramienta que permite subir de nivel sin bloquear el desarrollo.

```bash
# Genera/regenera el baseline con los errores actuales del nivel configurado
./vendor/bin/phpstan analyse --generate-baseline
```

Esto crea `phpstan-baseline.neon` (ya incluido en `phpstan.neon` arriba). Reglas:

- **Regenera el baseline solo cuando bajas deuda**, nunca para silenciar un error nuevo
  que acabas de introducir — ese hay que arreglarlo.
- Haz commit del baseline. Forma parte del contrato del repo.
- Revisa el diff del baseline en cada PR: si **crece**, alguien metió deuda; si **encoge**,
  se pagó deuda (bien).

**Acción si FALLA:** lee el error, corrige el tipo/lógica. Si es un falso positivo legítimo
(p. ej. un magic method de un paquete), usa `@phpstan-ignore-next-line` con comentario del
porqué, o ignora ese identificador de error en `phpstan.neon` — pero esto es la excepción,
no el patrón.

> Las versiones recientes de Laravel usan estructura slim (sin `app/Http/Kernel.php` ni
> `app/Console/Kernel.php`); verifica leyendo `bootstrap/app.php`, donde vive la config de
> middleware (`->withMiddleware(...)`). Incluye `bootstrap/app.php` en `paths` por eso.
> **No** referencies los Kernel legacy si tu proyecto ya usa la estructura slim.

---

## Paso 3 — Pest con coverage mínimo

Pest 3 es el runner de tests. El gate exige un piso de coverage del 80%.

```bash
# Tests + coverage con piso del 80% — falla si baja
./vendor/bin/pest --coverage --min=80

# En paralelo (más rápido en CI con varios cores)
./vendor/bin/pest --parallel --coverage --min=80

# Solo lo afectado durante desarrollo (no en el gate final)
./vendor/bin/pest --dirty
./vendor/bin/pest --filter="UserTest"
```

Habilita el driver de coverage. En CI con `pcov`:

```bash
php -d pcov.enabled=1 ./vendor/bin/pest --coverage --min=80
```

Configura el filtro de coverage en `phpunit.xml` (así el `--min` y el reporte miden solo el
código de la app, no vendor ni config):

```xml
<source>
    <include>
        <directory>app</directory>
    </include>
    <exclude>
        <directory>app/Console</directory>
    </exclude>
</source>
```

Ejemplo de test Pest 3 sobre una API Resource de Laravel (`toResource()` + JSON:API). El
método `toResource()` de auto-discovery existe en las versiones recientes; verifica que esté
disponible en tu versión instalada:

```php
<?php

use App\Models\Post;

it('serializa el post via auto-discovery de resource', function () {
    $post = Post::factory()->create(['title' => 'Hola']);

    // toResource() autodescubre App\Http\Resources\PostResource en Laravel reciente
    $payload = $post->toResource()->toArray(request());

    expect($payload['title'])->toBe('Hola');
});

it('lista posts sin lazy loading', function () {
    Post::factory()->count(3)->for(\App\Models\User::factory(), 'author')->create();

    // preventLazyLoading activo en testing: si la relación no está eager-loaded, lanza
    $this->getJson('/api/posts?include=author')
        ->assertOk()
        ->assertJsonCount(3, 'data');
});
```

**Acción si FALLA:**

- *Test roto:* lee el assert, corrige el código (no el test, salvo que el test esté mal).
- *Coverage < 80%:* identifica qué falta cubrir y agrega tests sobre el código nuevo.

  ```bash
  # Reporte HTML para ver línea por línea qué quedó sin cubrir
  ./vendor/bin/pest --coverage --coverage-html=coverage-report
  ```

  Sube el coverage cubriendo el **código que tocaste** en este cambio — no inflando con
  tests triviales de getters. El piso es un guardrail, no una meta a gamear.

---

## Paso 4 — composer audit (vulnerabilidades en dependencias)

```bash
composer audit                       # falla con exit code ≠ 0 si hay CVE
composer audit --format=json         # output parseable para CI
composer audit --no-dev              # solo dependencias de producción
```

**Acción si FALLA:**

```bash
composer why vulnerable/package      # ver quién la trae
composer update vulnerable/package   # subir a versión parcheada
composer update vulnerable/package --with-dependencies
```

Si no hay parche disponible aún y el riesgo es aceptable para esta entrega, documenta la
excepción en el PR (paquete, CVE, por qué se acepta, fecha de revisión) — no la silencies
sin dejar registro. El audit corre también en CI: una dependencia nueva con CVE bloquea el
merge.

---

## Paso 5 — Checks de configuración (`php artisan about` + asserts)

`php artisan about` resume el estado del entorno. El gate verifica que la config sea sana
**antes** de mergear, para que no se filtre `APP_DEBUG=true` a producción.

```bash
php artisan about                            # resumen completo legible
php artisan about --only=environment         # solo el bloque de entorno
php artisan about --json                      # output parseable para asserts en CI
```

Asserts concretos del gate (fallan el loop si no se cumplen):

```bash
# APP_DEBUG debe estar en false fuera de local (config cacheada o env real)
php artisan tinker --execute="exit(config('app.debug') === false ? 0 : 1);" \
  || { echo 'FALLA: APP_DEBUG=true'; exit 1; }

# APP_KEY debe existir
php artisan tinker --execute="exit(config('app.key') ? 0 : 1);" \
  || { echo 'FALLA: APP_KEY vacía — corre php artisan key:generate'; exit 1; }
```

Checks adicionales útiles antes de PR:

```bash
php artisan config:clear     # evita asserts contra config cacheada vieja
php artisan route:list        # confirma que las rutas registran sin error
php artisan migrate:status    # no quedan migraciones pendientes sin aplicar en test
```

**Acción si FALLA:** ajusta `.env` / `.env.example`, corre `php artisan key:generate` si
falta la key, y confirma que `APP_ENV` y `APP_DEBUG` correspondan al entorno
(`local` → debug ok; `production`/`staging` → `APP_DEBUG=false`).

---

## Salida del loop — formato PASA / FALLA

El skill termina con un veredicto único y accionable. Plantilla de reporte:

```
laravel-verify — VEREDICTO: FALLA

  [✓] Pint            — formato OK
  [✗] PHPStan (lvl 6) — 2 errores nuevos (fuera de baseline)
  [✓] Pest            — 84 passed, coverage 86% (min 80%)
  [✓] composer audit  — sin CVE
  [✓] Config          — APP_DEBUG=false, APP_KEY presente

  ACCIONES:
   1. app/Http/Controllers/PostController.php:42 — método undefined en relación.
      → Eager-load `author` o corrige el tipo del retorno.
   2. app/Models/Post.php:18 — cast legacy detectado.
      → Migra de `protected $casts` a `protected function casts(): array`.

  No hacer commit hasta que todos los pasos estén en verde.
```

Si todos pasan: `VEREDICTO: PASA — listo para commit/PR.`

---

## Cableado en CI — GitHub Actions

`.github/workflows/verify.yml`:

```yaml
name: laravel-verify

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'
          coverage: pcov
          tools: composer:v2

      - name: Install dependencies
        run: composer install --prefer-dist --no-interaction --no-progress

      - name: Prepare environment
        run: |
          cp .env.example .env
          php artisan key:generate

      # Paso 1 — Pint
      - name: Pint (formato)
        run: ./vendor/bin/pint --test

      # Paso 2 — PHPStan / Larastan
      - name: PHPStan (estático)
        run: ./vendor/bin/phpstan analyse --no-progress --memory-limit=2G

      # Paso 3 — Pest + coverage
      - name: Pest (tests + coverage)
        run: ./vendor/bin/pest --parallel --coverage --min=80

      # Paso 4 — Dependencias
      - name: composer audit
        run: composer audit

      # Paso 5 — Config
      - name: Config checks
        run: |
          php artisan about --only=environment
          php artisan tinker --execute="exit(config('app.debug') === false ? 0 : 1);"
```

Notas:

- `pcov` es más rápido que Xdebug para coverage en CI.
- Cada paso es un step independiente: el log de Actions muestra exactamente cuál falló.
- Si necesitas base de datos para Pest, agrega un servicio `postgres`. Las versiones recientes
  de Laravel con pgvector usan `Schema::ensureVectorExtensionExists()`; usa la imagen
  `pgvector/pgvector` y verifica que el helper esté disponible en tu versión instalada.

---

## Cableado como pre-commit (local)

Engancha el loop al hook de Git para que falle **antes** de crear el commit. Usa `--dirty`
en Pint y Pest para que sea rápido sobre solo lo modificado.

`.git/hooks/pre-commit` (o gestiónalo con un gestor de hooks versionado):

```bash
#!/usr/bin/env bash
set -e

echo "→ Pint (dirty)..."
./vendor/bin/pint --test --dirty

echo "→ PHPStan..."
./vendor/bin/phpstan analyse --no-progress

echo "→ Pest (dirty)..."
./vendor/bin/pest --dirty

echo "✓ laravel-verify OK — commit permitido."
```

```bash
chmod +x .git/hooks/pre-commit
```

Recomendación: el pre-commit corre el subconjunto rápido (`--dirty`, sin `composer audit`
ni coverage completo) para no entorpecer el flujo; el gate **completo** (coverage 80%,
audit, config checks) corre en CI. Así local es ágil y CI es la autoridad final.

Para versionar el hook en el repo (sin depender del `.git/hooks` de cada quien), usa un
gestor de hooks como `captainhook/captainhook`:

```bash
composer require --dev captainhook/captainhook   # hooks versionados en captainhook.json
```

---

## Qué NO hacer

- **No** silencies un error nuevo de PHPStan regenerando el baseline — el baseline solo
  congela deuda **vieja**; lo nuevo se arregla.
- **No** bajes `--min=80` para que pase el coverage — cubre el código que escribiste.
- **No** referencies `app/Http/Kernel.php` ni `app/Console/Kernel.php` si tu proyecto usa la
  estructura slim de Laravel: ahí no existen. La config de middleware vive en
  `bootstrap/app.php`; verifica leyendo ese archivo.
- **No** uses `protected $casts` ni pares `getXAttribute()/setXAttribute()` — PHPStan +
  el preset de Pint te lo van a marcar; usa `casts(): array` y `Attribute::make()`.
- **No** uses `checkMissingIterableValueType` en `phpstan.neon`: lo removió PHPStan 2.x.
  Ignora ese caso por identificador (`missingType.iterableValue`) si hace falta.
- **No** hagas commit con `APP_DEBUG=true` apuntando a entornos no-locales.
- **No** dejes `composer audit` en rojo sin un motivo documentado en el PR.

---

## Relación con otros skills

- `new-feature` invoca este skill como gate final antes de cerrar la feature.
- El `forge-quality-reviewer` lo corre como parte de su review de PR.
- Es complementario a `laravel-security`: este verifica calidad/regresión, aquel verifica
  seguridad de endpoints. Corre ambos antes de mergear rutas protegidas.
- No depende de otros skills para ejecutarse (es standalone).
