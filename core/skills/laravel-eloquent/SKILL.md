# Skill: laravel-eloquent

Eloquent productivo en Laravel 13: modelar relaciones, eager loading para evitar N+1, casts y
accessors modernos, scopes, recorridos eficientes de datasets grandes y búsqueda vectorial con
pgvector. Activar al escribir o revisar modelos, queries o migraciones de Eloquent.

Triggers: /laravel-eloquent, "modelo eloquent", "relaciones eloquent", "evitar N+1", "eager loading",
"query lenta", "scope eloquent", "cast eloquent", "accessor mutator", "pgvector laravel",
"búsqueda semántica eloquent", "withCount whereHas".

---

## Cuándo usar este skill

- Al definir o modificar modelos Eloquent (relaciones, casts, accessors/mutators, scopes).
- Al detectar o prevenir queries N+1 en controllers, resources o vistas.
- Al recorrer datasets grandes sin reventar la memoria (`chunk`, `cursor`, `lazy`).
- Al agregar o auditar índices y analizar planes de ejecución con `EXPLAIN`.
- Al implementar búsqueda semántica con columnas vector / pgvector (nuevo en Laravel 13).

---

## Modelos y relaciones

Un modelo es una clase en `app/Models`. Genera el modelo con su migración, factory y seeder de una vez:

```bash
php artisan make:model Post -mfs
```

Define las relaciones como métodos tipados. En Laravel 13 declara el tipo de retorno de la relación;
mejora el autocompletado y el análisis estático.

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Post extends Model
{
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class);
    }
}
```

---

## Eager loading: evitar N+1

El problema N+1 ocurre cuando recorres una colección y accedes a una relación dentro del loop: por cada
modelo se dispara una query extra. La solución es cargar la relación por adelantado.

**`with()`** — eager loading en tiempo de query (lo más común):

```php
// MAL: 1 query para los posts + N queries (una por post) para el autor
$posts = Post::all();
foreach ($posts as $post) {
    echo $post->author->name; // query por iteración
}

// BIEN: 2 queries en total
$posts = Post::with('author')->get();

// Anidado y con varias relaciones a la vez
$posts = Post::with(['author', 'comments.author'])->get();

// Acotando columnas y filtrando la relación cargada
$posts = Post::with(['comments' => fn ($q) => $q->where('approved', true)->latest()])->get();
```

**`load()` / `loadMissing()`** — eager loading sobre modelos ya recuperados:

```php
$post = Post::find($id);
$post->load('comments');              // carga siempre

// loadMissing solo consulta si la relación aún no está cargada (idempotente)
$post->loadMissing(['author', 'comments']);
```

**`$with`** — relaciones que SIEMPRE se cargan con el modelo. Úsalo con criterio: si la relación
no se necesita en todos los flujos, termina haciendo trabajo de más.

```php
class Post extends Model
{
    // Se cargan automáticamente en toda query del modelo
    protected $with = ['author'];
}
```

---

## Strictness en desarrollo: `preventLazyLoading`

Configura Eloquent para que falle ruidosamente ante un N+1 en dev/test, pero nunca en producción
(donde lanzaría una excepción fatal al usuario final). Gátealo con `! $this->app->isProduction()`.

```php
<?php
// app/Providers/AppServiceProvider.php

namespace App\Providers;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        // Solo dispara violaciones en dev/test, no en producción
        Model::preventLazyLoading(! $this->app->isProduction());

        // Falla si asignas (fill/create) un atributo que no existe en la tabla
        Model::preventSilentlyDiscardingAttributes(! $this->app->isProduction());

        // Falla si lees un atributo que no se hidrató (típico al hacer select parcial)
        Model::preventAccessingMissingAttributes(! $this->app->isProduction());
    }
}
```

Al acceder a una relación no cargada en dev, Eloquent lanza
`Illuminate\Database\LazyLoadingViolationException`, lo que obliga a agregar el `with()` correcto.

---

## Casts y Attribute accessors/mutators

**Casts** — define el método `casts()`. NO uses la propiedad legacy `protected $casts`.

```php
use Illuminate\Database\Eloquent\Casts\AsCollection;

class User extends Model
{
    protected function casts(): array
    {
        return [
            'is_admin'     => 'boolean',
            'options'      => 'array',
            'meta'         => AsCollection::class,
            'published_at' => 'datetime',
            'price'        => 'decimal:2',
        ];
    }
}
```

> Las columnas `vector` (pgvector) NO se castean a `array`: ese cast pasaría el valor por
> `json_encode`/`json_decode` y corrompería el literal del vector. Se leen y escriben con los
> helpers de embeddings y los operadores vectoriales (ver más abajo), no con un cast de modelo.

**Accessors / mutators** — un único método que retorna un `Attribute`. NO escribas los pares
mágicos legacy `getXxxAttribute()` / `setXxxAttribute()`.

```php
use Illuminate\Database\Eloquent\Casts\Attribute;

class User extends Model
{
    protected function firstName(): Attribute
    {
        return Attribute::make(
            get: fn (string $value) => ucfirst($value),
            set: fn (string $value) => strtolower($value),
        );
    }

    // Atributo computado a partir de otras columnas; cachea el resultado primitivo
    protected function fullName(): Attribute
    {
        return Attribute::make(
            get: fn (mixed $value, array $attributes) =>
                "{$attributes['first_name']} {$attributes['last_name']}",
        )->shouldCache();
    }
}
```

---

## Scopes locales y globales

**Scope local** — un método reutilizable para encadenar en queries:

```php
use Illuminate\Database\Eloquent\Builder;

class Post extends Model
{
    public function scopePublished(Builder $query): void
    {
        $query->whereNotNull('published_at')->where('published_at', '<=', now());
    }

    public function scopeOfAuthor(Builder $query, User $author): void
    {
        $query->where('user_id', $author->id);
    }
}

// Uso: el prefijo "scope" se omite al llamar
$posts = Post::published()->ofAuthor($author)->latest()->get();
```

**Scope global** — se aplica automáticamente a toda query del modelo (ideal para soft-tenancy o
filtros por defecto). Recuérdalo: para saltártelo usa `withoutGlobalScope()`.

```php
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

class PublishedScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $builder->whereNotNull('published_at');
    }
}

class Post extends Model
{
    protected static function booted(): void
    {
        static::addGlobalScope(new PublishedScope);
    }
}

// Saltar el scope global cuando haga falta
$all = Post::withoutGlobalScope(PublishedScope::class)->get();
```

---

## Agregados de relación: `withCount`, `whereHas`, `has`

Evita contar relaciones en un loop (otro N+1). Eloquent agrega la cuenta en la misma query.

```php
// Agrega columnas {relacion}_count sin cargar la relación entera
$posts = Post::withCount('comments')->get();
echo $posts->first()->comments_count;

// Conteo condicional y con alias
$posts = Post::withCount([
    'comments',
    'comments as approved_comments_count' => fn ($q) => $q->where('approved', true),
])->get();

// Filtrar por existencia de relación
$active = Post::has('comments')->get();                   // tiene al menos 1 comentario
$popular = Post::has('comments', '>=', 10)->get();        // 10 o más

// whereHas: filtra por una condición DENTRO de la relación
$posts = Post::whereHas('comments', fn ($q) => $q->where('approved', true))->get();

// Negación
$silent = Post::whereDoesntHave('comments')->get();
```

---

## Datasets grandes: `chunk`, `chunkById`, `cursor`, `lazy`

Nunca hagas `Model::all()` sobre tablas grandes: carga todo en memoria. Recorre por lotes o en streaming.

```php
// chunk: procesa en lotes de N; cada lote es una query
Post::where('active', true)->chunk(500, function ($posts) {
    foreach ($posts as $post) {
        // ...
    }
});

// chunkById: estable cuando MODIFICAS filas dentro del loop (evita saltarte registros)
Post::where('active', true)->chunkById(500, function ($posts) {
    $posts->each->update(['processed' => true]);
});

// lazy: API de colección con bajo uso de memoria (lotes por debajo, LazyCollection arriba)
Post::where('active', true)->lazy()->each(function ($post) {
    // ...
});

// cursor: UNA query, hidrata un modelo a la vez (mínima RAM, pero sin eager loading útil)
foreach (Post::where('active', true)->cursor() as $post) {
    // ...
}
```

Regla práctica: `chunkById` para mutaciones, `lazy`/`cursor` para lecturas pesadas de solo lectura.

---

## Transacciones

Agrupa escrituras relacionadas para que sean atómicas. El closure hace commit al terminar y rollback
automático ante cualquier excepción.

```php
use Illuminate\Support\Facades\DB;

DB::transaction(function () use ($data) {
    $order = Order::create($data['order']);
    $order->items()->createMany($data['items']);
    $order->user->decrement('credit', $order->total);
});

// Reintentos ante deadlock (segundo argumento = número de intentos)
DB::transaction(fn () => $order->process(), attempts: 3);

// Control manual cuando necesitas lógica entre pasos
DB::beginTransaction();
try {
    // ...
    DB::commit();
} catch (\Throwable $e) {
    DB::rollBack();
    throw $e;
}
```

---

## Índices y `EXPLAIN`

Una query lenta casi siempre es un índice faltante. Agrega índices en migraciones sobre columnas que
aparecen en `where`, `join`, `order by` y foreign keys.

```php
// database/migrations/xxxx_create_posts_table.php
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

Schema::create('posts', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->constrained()->index();
    $table->string('slug')->unique();
    $table->timestamp('published_at')->nullable();
    $table->timestamps();

    // Índice compuesto: el orden importa (más selectivo / más usado primero)
    $table->index(['user_id', 'published_at']);
});
```

Analiza el plan de ejecución directo desde el query builder con `->explain()`:

```php
// Devuelve el plan; revisa filas escaneadas y uso de índice
$plan = Post::where('user_id', 1)->where('published_at', '<=', now())->explain();
dump($plan->toArray());
```

```bash
# Inspección directa en la consola SQL (PostgreSQL/MySQL)
# PostgreSQL: EXPLAIN ANALYZE SELECT ... ;  busca "Seq Scan" (mala señal en tablas grandes)
# MySQL:      EXPLAIN SELECT ... ;          busca type=ALL y key=NULL (sin índice)
```

---

## Búsqueda semántica con vector columns / pgvector (nuevo en Laravel 13)

Laravel 13 integra columnas vectoriales sobre `pgvector` para búsqueda por similitud, alimentadas por
el AI SDK de primera parte. Útil para RAG y búsqueda semántica.

**Migración** — habilita la extensión y declara la columna vector con su dimensión:

```php
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

Schema::ensureVectorExtensionExists();

Schema::create('documents', function (Blueprint $table) {
    $table->id();
    $table->text('content');
    // La dimensión depende del modelo de embeddings (p. ej. 1536 para OpenAI)
    $table->vector('embedding', dimensions: 1536)->index();
    $table->timestamps();
});
```

**Generar embeddings** y guardarlos:

```php
use Illuminate\Support\Str;

$document = Document::create([
    'content'   => $text,
    'embedding' => Str::of($text)->toEmbeddings(),
]);
```

**Consultar por similitud** — pasar un string auto-embebe la consulta:

```php
$similar = Document::query()
    ->whereVectorSimilarTo('embedding', $queryString, minSimilarity: 0.4)
    ->orderByVectorDistance('embedding', $queryString)
    ->limit(5)
    ->get();
```

> Para RAG dentro de un agente del AI SDK existe la tool `SimilaritySearch::usingModel(Document::class, 'embedding')`.

---

## Comandos útiles

```bash
php artisan tinker        # REPL para inspeccionar modelos y queries en vivo
php artisan db:show       # resumen de la conexión: tablas, tamaño, número de filas
php artisan db:table posts   # detalle de una tabla concreta (columnas e índices)
php artisan model:show Post  # relaciones, casts, atributos y eventos del modelo
```

En `tinker` puedes ver el SQL crudo de cualquier query sin ejecutarla:

```php
Post::with('author')->where('active', true)->toRawSql();
```

---

## Checklist antes de cerrar

```
✓ Toda query que se recorre carga sus relaciones con with()/load() (sin N+1)
✓ preventLazyLoading() activo en dev/test, gateado con ! isProduction()
✓ Casts vía método casts(); accessors/mutators vía Attribute::make (nada legacy)
✓ Conteos y filtros de relación con withCount/whereHas, no dentro de loops
✓ Datasets grandes recorridos con chunkById/lazy/cursor, nunca all()
✓ Escrituras relacionadas envueltas en DB::transaction()
✓ Índices presentes en columnas de where/join/order; EXPLAIN sin Seq Scan en tablas grandes
```