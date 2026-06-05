# Skill: laravel-pest

TDD con Pest 3 en Laravel 13: estructura `tests/Feature` y `tests/Unit`, `RefreshDatabase`,
factories y states, datasets, expectations, HTTP tests, fakes (`Mail`, `Queue`, `Event`,
`Http`, `Storage`), time travel y coverage con umbral mínimo. Activar al escribir o correr
tests en un proyecto Laravel 13.

Triggers: /laravel-pest, "escribir tests", "test con pest", "TDD en laravel",
"feature test", "model factory", "mockear cola/mail/evento", "fake de http",
"coverage de tests", "correr los tests".

---

## Cuándo usar este skill

- Al implementar una feature con TDD: el test se escribe junto con (o antes de) el código.
- Al crear o ajustar factories y states para preparar datos de prueba.
- Al testear endpoints HTTP (status, JSON, redirects, validación).
- Al aislar efectos secundarios con fakes (mail, queue, event, http, storage).
- Al verificar lógica dependiente del tiempo con time travel.
- Al medir cobertura y exigir un umbral mínimo en CI.

> Laravel 13 instala Pest 3 por defecto. Si el proyecto todavía usa PHPUnit puro, cada
> sección incluye la equivalencia. Pest corre sobre PHPUnit, así que ambos estilos
> conviven en el mismo `tests/` sin conflicto.

---

## Estructura de tests

Laravel 13 ubica los tests en dos carpetas, configuradas como suites en `phpunit.xml`:

- `tests/Feature/` — ejercitan el framework completo (rutas, middleware, DB, container).
- `tests/Unit/` — clases aisladas sin booteo de Laravel; rápidos, sin acceso a DB.

El bootstrap de Pest vive en `tests/Pest.php`. Ahí se aplican traits y helpers por
carpeta con `uses()`, evitando repetirlos en cada archivo:

```php
// tests/Pest.php
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Todos los Feature tests heredan TestCase y refrescan la DB en cada test.
pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

// Los Unit tests solo necesitan el TestCase base de PHPUnit (sin Laravel).
pest()->extend(PHPUnit\Framework\TestCase::class)
    ->in('Unit');

// Expectation custom reutilizable en toda la suite.
expect()->extend('toBeOne', fn () => $this->toBe(1));
```

Generar tests con artisan (Laravel 13 scaffoldea en formato Pest por defecto):

```bash
php artisan make:test ProductPurchaseTest --pest          # tests/Feature (default)
php artisan make:test PricingTest --pest --unit           # tests/Unit
php artisan make:test LegacyTest --phpunit                # forzar clase PHPUnit
```

Un Feature test mínimo en Pest:

```php
<?php
// tests/Feature/HomeTest.php

it('muestra la home', function () {
    $response = $this->get('/');

    $response->assertOk();
});
```

Equivalencia PHPUnit:

```php
<?php
// tests/Feature/HomeTest.php
namespace Tests\Feature;

use Tests\TestCase;

class HomeTest extends TestCase
{
    public function test_muestra_la_home(): void
    {
        $this->get('/')->assertOk();
    }
}
```

---

## RefreshDatabase y base de datos

`RefreshDatabase` envuelve cada test en una transacción y la revierte al terminar, dejando
el schema migrado una sola vez. Es el trait correcto para la mayoría de los Feature tests.

```php
<?php
// tests/Feature/OrderTest.php
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class); // omitir si ya está aplicado en tests/Pest.php

it('persiste una orden', function () {
    $this->assertDatabaseCount('orders', 0);

    Order::create(['total' => 1000, 'status' => 'pending']);

    $this->assertDatabaseHas('orders', ['total' => 1000, 'status' => 'pending']);
    $this->assertDatabaseCount('orders', 1);
});
```

Traits relacionados, según el caso:

- `DatabaseTransactions` — envuelve en transacción pero NO migra; útil si la DB ya tiene schema.
- `DatabaseMigrations` — corre `migrate:fresh` antes de cada test (más lento; rara vez necesario).
- `RefreshDatabase` — lo recomendado: migra una vez, transacciona por test.

Aserciones de DB disponibles en cualquier test:

```php
$this->assertDatabaseHas('users', ['email' => 'a@b.com']);
$this->assertDatabaseMissing('users', ['email' => 'baneado@b.com']);
$this->assertDatabaseCount('users', 3);
$this->assertModelExists($user);
$this->assertModelMissing($user); // tras delete()
$this->assertSoftDeleted($user);  // con SoftDeletes
```

Para tests veloces conviene una conexión SQLite en memoria en `phpunit.xml`:

```xml
<php>
    <env name="DB_CONNECTION" value="sqlite"/>
    <env name="DB_DATABASE" value=":memory:"/>
</php>
```

> Si el código bajo prueba usa features específicas de PostgreSQL (pgvector,
> `whereVectorSimilarTo`, JSON operators), NO uses SQLite en memoria: apunta a una DB
> de test Postgres real, porque SQLite no soporta esa sintaxis.

---

## Model factories y states

Las factories generan datos de prueba realistas. Se generan con artisan y viven en
`database/factories/`:

```bash
php artisan make:factory ProductFactory
php artisan make:model Product -f          # modelo + factory de una vez
```

Una factory en Laravel 13 declara `definition()` y opcionalmente `states` como métodos
que devuelven `$this->state(...)`:

```php
<?php
// database/factories/ProductFactory.php
namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class ProductFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name'        => fake()->words(3, true),
            'price'       => fake()->numberBetween(100, 50_000),
            'stock'       => fake()->numberBetween(0, 100),
            'is_active'   => true,
            'published_at' => now(),
        ];
    }

    // State: producto agotado.
    public function outOfStock(): static
    {
        return $this->state(fn (array $attributes) => ['stock' => 0]);
    }

    // State: borrador (no publicado).
    public function draft(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_active'    => false,
            'published_at' => null,
        ]);
    }
}
```

Usar la factory en los tests:

```php
$product = Product::factory()->create();                       // uno persistido
$product = Product::factory()->make();                          // uno sin persistir
$products = Product::factory()->count(5)->create();             // colección

// States encadenados:
$agotado = Product::factory()->outOfStock()->create();
$borrador = Product::factory()->draft()->outOfStock()->create();

// Sobrescribir atributos puntuales:
$caro = Product::factory()->create(['price' => 99_000]);

// Sequences para variar valores entre instancias:
use Illuminate\Database\Eloquent\Factories\Sequence;

Product::factory()
    ->count(4)
    ->state(new Sequence(['is_active' => true], ['is_active' => false]))
    ->create();
```

Relaciones con factories:

```php
// hasMany: una orden con 3 ítems.
$order = Order::factory()
    ->has(OrderItem::factory()->count(3))
    ->create();

// Atajo por nombre de relación + magic method:
$order = Order::factory()
    ->hasItems(3, ['quantity' => 2])
    ->create();

// belongsTo: ítems que pertenecen a una orden existente.
OrderItem::factory()->count(3)->for($order)->create();

// Pivot (belongsToMany) con datos de la tabla intermedia:
$user = User::factory()
    ->hasAttached(Role::factory()->count(2), ['assigned_at' => now()])
    ->create();
```

El modelo debe usar el trait `HasFactory` (incluido por defecto en los modelos de Laravel 13):

```php
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Product extends Model
{
    use HasFactory;
}
```

---

## Datasets

Los datasets ejecutan el mismo test con múltiples entradas, generando un caso por fila.
Reemplazan a `@dataProvider` de PHPUnit con menos boilerplate.

```php
it('valida emails', function (string $email, bool $valido) {
    expect(filter_var($email, FILTER_VALIDATE_EMAIL) !== false)->toBe($valido);
})->with([
    ['a@b.com', true],
    ['sin-arroba', false],
    ['x@y.cl', true],
]);
```

Con claves nombradas (mejoran la salida del runner):

```php
it('calcula descuento por tier', function (string $tier, int $esperado) {
    expect(discountFor($tier))->toBe($esperado);
})->with([
    'free'    => ['free', 0],
    'pro'     => ['pro', 10],
    'premium' => ['premium', 25],
]);
```

Datasets reutilizables registrados en `tests/Pest.php`:

```php
// tests/Pest.php
dataset('emails_invalidos', ['sin-arroba', 'a@', '@b.com', '']);
```

```php
it('rechaza emails inválidos en el registro', function (string $email) {
    $this->post('/register', ['email' => $email, 'password' => 'secret123'])
        ->assertSessionHasErrors('email');
})->with('emails_invalidos');
```

Datasets que devuelven modelos (lazy, se evalúan dentro del test, no al colectar):

```php
it('no deja comprar productos inactivos', function (Closure $product) {
    $this->actingAs(User::factory()->create())
        ->post('/cart', ['product_id' => $product()->id])
        ->assertForbidden();
})->with([
    fn () => Product::factory()->draft()->create(),
    fn () => Product::factory()->outOfStock()->create(),
]);
```

Equivalencia PHPUnit (data provider):

```php
public static function emailProvider(): array
{
    return [['a@b.com', true], ['sin-arroba', false]];
}

#[\PHPUnit\Framework\Attributes\DataProvider('emailProvider')]
public function test_valida_emails(string $email, bool $valido): void
{
    $this->assertSame($valido, filter_var($email, FILTER_VALIDATE_EMAIL) !== false);
}
```

---

## Expectations

La API de expectations de Pest es encadenable y legible. Equivale a los `assert*` de PHPUnit.

```php
expect($user->name)->toBe('Ada');
expect($total)->toBeInt()->toBeGreaterThan(0);
expect($collection)->toHaveCount(3);
expect($product->is_active)->toBeTrue();
expect($response->json())->toBeArray()->toHaveKey('data');
expect($order->status)->toBeIn(['pending', 'paid', 'shipped']);
expect($email)->toMatch('/@/');
expect(fn () => throw new RuntimeException('boom'))->toThrow(RuntimeException::class, 'boom');

// Negación e inversión:
expect($user->email)->not->toBeEmpty();

// Encadenar sobre la misma colección con and():
expect($product)
    ->name->toBe('Teclado')
    ->and($product->price)->toBeGreaterThan(0)
    ->and($product->stock)->toBeInt();
```

Tabla de equivalencias frecuentes:

| PHPUnit                          | Pest                                  |
|----------------------------------|---------------------------------------|
| `assertSame($a, $b)`             | `expect($b)->toBe($a)`                |
| `assertEquals($a, $b)`           | `expect($b)->toEqual($a)`             |
| `assertTrue($x)`                 | `expect($x)->toBeTrue()`              |
| `assertNull($x)`                 | `expect($x)->toBeNull()`              |
| `assertCount(3, $c)`             | `expect($c)->toHaveCount(3)`          |
| `assertInstanceOf(X::class, $y)` | `expect($y)->toBeInstanceOf(X::class)`|
| `expectException(E::class)`      | `...->toThrow(E::class)`              |

> Dentro de un test Pest, `$this` es la instancia `TestCase`, así que las aserciones de
> Laravel (`$this->assertDatabaseHas`, `$this->get`) conviven con `expect()` sin problema.

---

## HTTP tests

Los Feature tests ejercitan rutas reales pasando por middleware y container. Recuerda que
en Laravel 13 el middleware (incluido el de CSRF, `Illuminate\Foundation\Http\Middleware\ValidateCsrfToken`)
se configura en `bootstrap/app.php` — no existe `app/Http/Kernel.php`.

```php
it('crea un producto autenticado', function () {
    $admin = User::factory()->create(['is_admin' => true]);

    $response = $this->actingAs($admin)->postJson('/api/products', [
        'name'  => 'Teclado mecánico',
        'price' => 45_000,
    ]);

    $response
        ->assertCreated()                       // 201
        ->assertJsonPath('data.name', 'Teclado mecánico')
        ->assertJsonStructure(['data' => ['id', 'name', 'price']]);

    $this->assertDatabaseHas('products', ['name' => 'Teclado mecánico']);
});
```

Verbos y aserciones HTTP más usados:

```php
$this->get('/dashboard')->assertOk();                  // 200
$this->get('/admin')->assertForbidden();               // 403
$this->get('/no-existe')->assertNotFound();            // 404
$this->post('/login', [...])->assertRedirect('/home'); // 302 a destino
$this->getJson('/api/users')->assertStatus(200);

// JSON:
$this->getJson('/api/products/1')
    ->assertJson(['data' => ['id' => 1]])              // subconjunto
    ->assertJsonCount(10, 'data')                      // cantidad en una clave
    ->assertJsonPath('data.0.name', 'Mouse')
    ->assertJsonFragment(['status' => 'active'])
    ->assertJsonMissing(['password' => '*']);

// Validación fallida (422 en API, errores de sesión en web):
$this->postJson('/api/products', [])
    ->assertStatus(422)
    ->assertJsonValidationErrors(['name', 'price']);

$this->post('/products', [])
    ->assertSessionHasErrors(['name']);

// Headers, cookies, auth:
$this->withHeaders(['X-Trace' => 'abc'])->getJson('/api/ping');
$this->assertAuthenticated();
$this->assertGuest();
```

Autenticación en API token-based (Sanctum, el default de Laravel 13 para SPA/mobile):

```php
use Laravel\Sanctum\Sanctum;

it('lista órdenes del usuario autenticado', function () {
    $user = User::factory()->has(Order::factory()->count(2))->create();

    Sanctum::actingAs($user, ['orders:read']);

    $this->getJson('/api/orders')
        ->assertOk()
        ->assertJsonCount(2, 'data');
});
```

---

## Fakes

Los fakes interceptan servicios para asertar interacciones sin ejecutar efectos reales
(no se envían mails, no se encolan jobs, no se sube nada). Se activan al inicio del test.

### Mail

```php
use Illuminate\Support\Facades\Mail;
use App\Mail\OrderShipped;

it('envía el mail de despacho', function () {
    Mail::fake();

    $order = Order::factory()->create();
    OrderService::ship($order);

    Mail::assertSent(OrderShipped::class, function (OrderShipped $mail) use ($order) {
        return $mail->order->is($order)
            && $mail->hasTo($order->user->email);
    });
    Mail::assertSentCount(1);
    Mail::assertNotSent(\App\Mail\OrderCancelled::class);
});
```

### Queue

```php
use Illuminate\Support\Facades\Queue;
use App\Jobs\ProcessPodcast;

it('encola el procesamiento del podcast', function () {
    Queue::fake();

    Podcast::factory()->create()->process();

    Queue::assertPushed(ProcessPodcast::class);
    Queue::assertPushedOn('podcasts', ProcessPodcast::class); // en cola específica
    Queue::assertPushed(ProcessPodcast::class, 1);
    Queue::assertNothingPushed();                             // si esperas 0
});
```

### Event

```php
use Illuminate\Support\Facades\Event;
use App\Events\OrderPaid;

it('dispara OrderPaid al pagar', function () {
    Event::fake([OrderPaid::class]); // fakear solo este evento, dejar correr el resto

    $order = Order::factory()->create();
    $order->markAsPaid();

    Event::assertDispatched(OrderPaid::class, fn (OrderPaid $e) => $e->order->is($order));
    Event::assertDispatchedTimes(OrderPaid::class, 1);
});
```

### Http (cliente HTTP saliente)

```php
use Illuminate\Support\Facades\Http;

it('consulta la API de pagos y maneja la respuesta', function () {
    Http::fake([
        'api.pagos.test/charge' => Http::response(['id' => 'ch_123', 'paid' => true], 200),
        'api.pagos.test/*'      => Http::response([], 404),
    ]);

    $result = PaymentGateway::charge(amount: 1000);

    expect($result['id'])->toBe('ch_123');

    Http::assertSent(fn ($request) =>
        $request->url() === 'https://api.pagos.test/charge'
        && $request['amount'] === 1000
    );
    Http::assertSentCount(1);
});

// Prevenir cualquier llamada real no fakeada (recomendado en CI):
Http::preventStrayRequests();
```

### Storage

```php
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\UploadedFile;

it('guarda el avatar subido', function () {
    Storage::fake('public');

    $this->actingAs(User::factory()->create())
        ->post('/profile/avatar', [
            'avatar' => UploadedFile::fake()->image('me.jpg', 200, 200),
        ])
        ->assertRedirect();

    Storage::disk('public')->assertExists('avatars/me.jpg');
    Storage::disk('public')->assertMissing('avatars/viejo.jpg');
});
```

> Ordena los fakes según lo que pruebas: si testeas que algo se ENCOLA, usa `Queue::fake()`.
> Si testeas que el job HACE su trabajo, NO lo fakees: ejecútalo (`Bus::dispatchSync()` o
> llamando `handle()`) y asevera el efecto.

---

## Time travel

Para lógica que depende de fechas (vencimientos, trials, scheduling), congela o avanza el
reloj con los helpers de `TestCase`. Internamente usan Carbon test-now.

```php
it('marca el trial como vencido a los 14 días', function () {
    $user = freezeTime(function () {              // congela "ahora" durante el closure
        return User::factory()->create(['trial_ends_at' => now()->addDays(14)]);
    });

    $this->travel(13)->days();
    expect($user->fresh()->onTrial())->toBeTrue();

    $this->travel(2)->days();                     // total: día 15
    expect($user->fresh()->onTrial())->toBeFalse();

    $this->travelBack();                          // restaurar el reloj real
});
```

Variantes:

```php
$this->travelTo(now()->startOfYear());           // saltar a un instante exacto
$this->travel(5)->hours();
$this->travel(-1)->weeks();

// Ejecutar algo en un instante fijo y volver automáticamente:
$this->travelTo(Carbon\Carbon::parse('2026-12-31 23:59:00'), function () {
    expect(now()->year)->toBe(2026);
});

// Congelar sin avanzar (útil para evitar drift de microsegundos):
$this->freezeTime();
```

Equivalencia PHPUnit: idénticos métodos (`$this->travel`, `$this->travelTo`,
`$this->freezeTime`) porque vienen del trait `InteractsWithTime` del `TestCase` base.

---

## Lifecycle hooks (setup/teardown)

```php
beforeEach(function () {
    $this->user = User::factory()->create();      // disponible en cada test del archivo
});

afterEach(function () {
    // limpieza si hiciera falta (RefreshDatabase ya revierte la DB)
});

beforeAll(fn () => /* una vez antes de todos */);
afterAll(fn () => /* una vez al final */);
```

Equivalen a `setUp()` / `tearDown()` de PHPUnit (recuerda llamar `parent::setUp()` si
sobrescribes en una clase).

---

## Correr los tests

```bash
./vendor/bin/pest                                  # toda la suite
./vendor/bin/pest tests/Feature/OrderTest.php      # un archivo
./vendor/bin/pest --filter="encola"                # por nombre/descripción
./vendor/bin/pest --group=slow                     # tests con ->group('slow')
./vendor/bin/pest --parallel                        # en paralelo (usa varios procesos)
./vendor/bin/pest --bail                            # detener en el primer fallo
./vendor/bin/pest --retry                            # reejecutar solo los que fallaron

php artisan test                                    # wrapper de artisan (usa Pest si está)
php artisan test --filter=OrderTest
php artisan test --parallel
```

---

## Coverage con umbral mínimo

Requiere un driver de cobertura (`Xdebug` con `XDEBUG_MODE=coverage`, o `PCOV`).

```bash
# Reporte en consola:
./vendor/bin/pest --coverage

# Exigir un mínimo: falla (exit code != 0) si la cobertura baja del umbral.
./vendor/bin/pest --coverage --min=80

# Reporte HTML o Clover para CI:
./vendor/bin/pest --coverage --coverage-html=build/coverage
./vendor/bin/pest --coverage-clover=build/clover.xml

# Métrica de "type coverage" (porcentaje de tipos declarados, feature de Pest 3):
./vendor/bin/pest --type-coverage --min=100
```

En CI conviene fijar el driver y el umbral explícitamente:

```bash
XDEBUG_MODE=coverage ./vendor/bin/pest --coverage --min=80 --parallel
```

> Si `--coverage` reporta 0% o avisa que no hay driver, falta Xdebug/PCOV o
> `XDEBUG_MODE=coverage`. Sin driver, el flag `--coverage` no produce números reales.

---

## Workflow TDD recomendado

1. Escribir el test primero en `tests/Feature/` (rojo): describe el comportamiento esperado.
2. Preparar datos con factories y states; usar fakes para aislar efectos externos.
3. Implementar el código mínimo para pasar (verde).
4. Refactorizar con el test como red de seguridad.
5. Antes de cerrar: `./vendor/bin/pest --coverage --min=<umbral>` y `./vendor/bin/pint --test`.

## Qué NO hacer

- No fakees el servicio que estás probando: si testeas que un job hace su trabajo, ejecútalo.
- No dependas del orden entre tests: cada uno arranca con DB limpia (`RefreshDatabase`).
- No uses `now()` real en aserciones de tiempo: congela el reloj con `freezeTime()`/`travelTo()`.
- No referencies `app/Http/Kernel.php` — no existe en Laravel 13 (el middleware va en `bootstrap/app.php`).
- No corras `--coverage` sin driver: el número será falso (0%) y no protege nada.
- No metas llamadas HTTP reales en tests: `Http::fake()` + `Http::preventStrayRequests()`.
- No uses SQLite en memoria si el código bajo prueba depende de Postgres (pgvector, JSON ops).