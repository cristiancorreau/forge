# Skill: laravel-security

Seguridad de aplicaciones Laravel 13: auth, autorización, validación, mass assignment,
CSRF, rate limiting, inyección SQL, XSS, secrets, uploads y deploy seguro. Actívalo al
crear o revisar cualquier endpoint, modelo, formulario o configuración que toque datos
de usuario, autenticación o producción.

Triggers: /laravel-security, "seguridad laravel", "auth laravel", "policy laravel",
"form request", "mass assignment", "sanctum o passport", "csrf laravel", "rate limit laravel",
"inyección sql laravel", "blade xss", "asegurar endpoint laravel", "deploy seguro laravel".

---

## Cuándo usar este skill

- Al crear o modificar endpoints (rutas web o API) que requieren auth o autorización.
- Al definir o cambiar modelos Eloquent (`$fillable`/`$guarded`, casts).
- Al escribir validación de input: SIEMPRE en un Form Request, nunca inline en el controller.
- Al elegir el paquete de auth (Sanctum vs Fortify vs Passport).
- Al renderizar datos de usuario en Blade (`{{ }}` vs `{!! !!}`).
- Al manejar secrets, uploads, queries crudas o cualquier `DB::raw`.
- Antes de cada deploy a producción (`APP_DEBUG=false`, `key:generate`, HTTPS, headers).

> Laravel 13 (marzo 2026, PHP 8.3+) tiene **estructura slim**: NO existe `app/Http/Kernel.php`.
> Todo el middleware se configura en `bootstrap/app.php` dentro de `->withMiddleware()`.

---

## 1. Autenticación — elegir el paquete correcto

No uses Passport por defecto. La regla en 2026:

| Paquete | Para qué | Cuándo |
|---------|----------|--------|
| **Sanctum** | Tokens de API + cookie de SPA + mobile, con abilities/scopes | Default para casi todo: SPA propia, app mobile, API first-party |
| **Fortify** | Backend headless de auth por **sesión** (sin UI) | App web first-party que renderiza su propio frontend |
| **Passport** | Servidor **OAuth2 / OAuth 2.1** completo | Solo clientes de terceros, "Log in with X", delegación, M2M (client-credentials) |

```bash
# API / SPA / mobile (default):
composer require laravel/sanctum

# App web por sesión, sin frontend de auth:
composer require laravel/fortify

# Solo si necesitas un servidor OAuth2 real:
composer require laravel/passport
```

**Sanctum — tokens de API con abilities (scopes):**

```php
// Emitir un token con abilities acotadas (principio de mínimo privilegio).
$token = $user->createToken('mobile', ['posts:read', 'posts:create']);

return ['token' => $token->plainTextToken];
```

```php
// routes/api.php — proteger e inspeccionar abilities.
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/posts', [PostController::class, 'store'])
        ->middleware('ability:posts:create');
});
```

```php
// Dentro del controller, verificación granular adicional.
if (! $request->user()->tokenCan('posts:create')) {
    abort(403, 'Token sin permiso.');
}
```

Reglas:

- El middleware de auth corre ANTES de cualquier lógica. Sin token/sesión válida → 401, sin procesar nada.
- Emite tokens con las abilities mínimas necesarias, no con `['*']`.
- Nunca confíes en headers que el cliente controla (`X-User-Id`, `X-Role`); deriva la identidad del token/sesión.

---

## 2. Autorización — Policies, Gates y `@can`

La autorización va en Policies (o Gates), nunca dispersa con `if` ad-hoc en cada controller.

```bash
php artisan make:policy PostPolicy --model=Post
```

```php
// app/Policies/PostPolicy.php
namespace App\Policies;

use App\Models\Post;
use App\Models\User;

class PostPolicy
{
    public function update(User $user, Post $post): bool
    {
        return $user->id === $post->user_id;   // ownership check (anti-IDOR)
    }

    public function delete(User $user, Post $post): bool
    {
        return $user->id === $post->user_id || $user->is_admin;
    }
}
```

```php
// En el controller: Gate::authorize() lanza 403 automáticamente si falla.
use Illuminate\Support\Facades\Gate;

public function update(UpdatePostRequest $request, Post $post)
{
    Gate::authorize('update', $post);    // resuelve la Policy y aborta con 403 si no pasa

    $post->update($request->validated());

    return $post->toResource();          // nuevo en 13: auto-descubre PostResource
}
```

> En el esqueleto slim de Laravel 13 el controller base (`App\Http\Controllers\Controller`)
> está vacío: NO incluye el trait `AuthorizesRequests`, así que `$this->authorize(...)` no
> existe por defecto. Usa `Gate::authorize(...)` (funciona sin trait) o el middleware `can:`.
> Si prefieres `$this->authorize(...)`, agrega `use AuthorizesRequests;` al controller base.

```php
// Atajos útiles para route model binding: autoriza vía la Policy antes del controller.
Route::put('/posts/{post}', [PostController::class, 'update'])
    ->middleware('can:update,post');   // no requiere ningún trait en el controller
```

```blade
{{-- En Blade: nunca muestres acciones que el usuario no puede ejecutar. --}}
@can('update', $post)
    <a href="{{ route('posts.edit', $post) }}">Editar</a>
@endcan

@cannot('delete', $post)
    <span class="text-muted">No puedes borrar este post</span>
@endcannot
```

**IDOR (Insecure Direct Object Reference):** al cargar un recurso por ID, verifica SIEMPRE
ownership/permiso en la Policy. No asumas que un ID "difícil de adivinar" protege nada. Que el
recurso aparezca en route model binding NO implica que el usuario actual pueda verlo.

---

## 3. Validación — siempre en un Form Request

Nunca valides en el cuerpo del controller con `$request->validate([...])` para nada no trivial.
Usa un Form Request: combina **autorización + validación** y mantiene el controller limpio.

```bash
php artisan make:request StorePostRequest
```

```php
// app/Http/Requests/StorePostRequest.php
namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePostRequest extends FormRequest
{
    public function authorize(): bool
    {
        // La autorización corre ANTES de validar. false => 403 automático.
        return $this->user()->can('create', \App\Models\Post::class);
    }

    public function rules(): array
    {
        return [
            'title'     => ['required', 'string', 'max:255'],
            'body'      => ['required', 'string'],
            'status'    => ['required', Rule::in(['draft', 'published'])],
            'tags'      => ['array', 'max:10'],
            'tags.*'    => ['string', 'max:30'],
        ];
    }

    // Normaliza input ANTES de validar (no para confiar en él, sino para validarlo bien).
    protected function prepareForValidation(): void
    {
        $this->merge(['title' => trim((string) $this->input('title'))]);
    }
}
```

```php
// Controller: la validación corre automáticamente al type-hintear el Form Request.
public function store(StorePostRequest $request)
{
    // Usa SOLO los datos validados; nunca $request->all() ni $request->input() crudo.
    $post = $request->user()->posts()->create($request->validated());

    // Alternativa con whitelist explícita:
    // $post->fill($request->safe()->only(['title', 'body', 'status']));

    return $post->toResource();
}
```

Reglas:

- `authorize(): bool` controla el acceso; `rules()` controla la forma del input. Los dos siempre.
- Recupera datos con `$request->validated()` o `$request->safe()->only([...])` — nunca `->all()`.
- Prefiere la sintaxis de array de reglas (`['required', 'max:255']`) sobre el string `'required|max:255'`.
- Una regla `confirmed`, `exists`, `unique` mal puesta es un bug de seguridad (p. ej. `email` sin `unique`).

---

## 4. Mass assignment — `$fillable` o `$guarded`

Sin protección, un atacante envía `is_admin=1` o `user_id=99` en el body y Eloquent lo persiste.

```php
// app/Models/Post.php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Post extends Model
{
    // Whitelist explícita: SOLO estos campos son asignables en masa.
    protected $fillable = ['title', 'body', 'status'];

    // NUNCA pongas en $fillable: id, user_id, is_admin, role, email_verified_at, etc.
    // Esos campos se asignan a mano desde el servidor con valores de confianza.

    // Laravel 13: define casts con el MÉTODO casts(), no la propiedad legacy $casts.
    protected function casts(): array
    {
        return [
            'is_admin'     => 'boolean',
            'published_at' => 'datetime',
        ];
    }
}
```

```php
// Asigna los campos sensibles desde el servidor, fuera de la asignación masiva.
$post = $request->user()->posts()->create($request->validated()); // user_id viene de la relación
$post->forceFill(['approved_by' => auth()->id()])->save();          // valor de confianza
```

Endurecimiento global recomendado (atrapa silencios peligrosos en dev/test):

```php
// app/Providers/AppServiceProvider.php — boot()
use Illuminate\Database\Eloquent\Model;

public function boot(): void
{
    // Lanza excepción si se intenta asignar un atributo fuera de $fillable.
    Model::preventSilentlyDiscardingAttributes(! $this->app->isProduction());
    Model::preventAccessingMissingAttributes(! $this->app->isProduction());
}
```

Regla: `$fillable` (allowlist) sobre `$guarded = []` (que abre todo). Nunca uses `$guarded = []`
combinado con `Model::create($request->all())`.

---

## 5. CSRF — `PreventRequestForgery`

En Laravel 13 el middleware de CSRF se llama **`PreventRequestForgery`** (renombrado desde
`VerifyCsrfToken`) y ya está en el grupo `web` por defecto. NO hay `app/Http/Kernel.php`: si
necesitas excluir rutas (p. ej. webhooks), se configura en `bootstrap/app.php`.

```php
// bootstrap/app.php
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withMiddleware(function (Middleware $middleware) {
        // Excluir SOLO rutas de webhooks externos que firman su propia request.
        $middleware->validateCsrfTokens(except: [
            'stripe/webhook',
            'webhooks/*',
        ]);
    })
    ->create();
```

```blade
{{-- Formularios web: incluir SIEMPRE el token. --}}
<form method="POST" action="{{ route('posts.store') }}">
    @csrf
    {{-- ... --}}
</form>
```

Reglas:

- No deshabilites CSRF globalmente. Excluye solo endpoints concretos de webhooks que validan firma propia.
- Las APIs con Sanctum por **token** (header `Authorization: Bearer`) no necesitan CSRF; las SPA de Sanctum por **cookie** sí dependen del flujo CSRF de Sanctum (`/sanctum/csrf-cookie`).

---

## 6. Rate limiting — `RateLimiter` y `throttle`

Sin rate limiting, login y endpoints de IA quedan expuestos a brute force y abuso de costo.

```php
// app/Providers/AppServiceProvider.php — boot()
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

public function boot(): void
{
    // Límite por usuario autenticado, con fallback a IP.
    RateLimiter::for('api', function (Request $request) {
        return Limit::perMinute(60)->by($request->user()?->id ?: $request->ip());
    });

    // Login: agresivo y por (email + IP) para frenar credential stuffing.
    RateLimiter::for('login', function (Request $request) {
        return Limit::perMinute(5)->by($request->input('email') . '|' . $request->ip());
    });
}
```

```php
// routes/api.php — aplicar el limiter nombrado.
Route::middleware(['throttle:api'])->group(function () {
    Route::apiResource('posts', PostController::class);
});

// Login con su propio limiter.
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');

// Throttle inline simple: 100 requests por minuto.
Route::get('/search', SearchController::class)->middleware('throttle:100,1');
```

Regla: aplica `throttle` a TODA ruta de auth (login, registro, reset password, verificación)
y a cualquier endpoint que dispare costo (IA, envío de email/SMS, exportaciones).

---

## 7. Inyección SQL — bindings, nunca concatenación

Eloquent y el Query Builder usan bindings por defecto y son seguros. El peligro aparece con
`DB::raw`, `whereRaw`, `orderByRaw`, `selectRaw` cuando metes input del usuario sin bindings.

```php
use Illuminate\Support\Facades\DB;

// PELIGRO — concatenación directa de input. NUNCA:
$users = DB::select("SELECT * FROM users WHERE email = '" . $request->email . "'");
User::whereRaw("name = '" . $request->name . "'")->get();

// CORRECTO — bindings parametrizados:
$users = DB::select('SELECT * FROM users WHERE email = ?', [$request->email]);
User::whereRaw('name = ?', [$request->name])->get();

// Mejor aún — query builder de alto nivel (binding implícito):
User::where('email', $request->email)->get();
```

```php
// orderBy con columna dinámica: NUNCA pases el input directo a orderByRaw.
// Valida contra una allowlist de columnas permitidas.
$sortable = ['created_at', 'title', 'status'];
$column   = in_array($request->input('sort'), $sortable, true)
    ? $request->input('sort')
    : 'created_at';

Post::orderBy($column)->paginate();
```

Reglas:

- Nombres de columna/tabla NO pueden ir como binding (un `?` solo liga valores). Para columnas
  dinámicas, valida contra una allowlist; nunca interpoles el string del usuario.
- `DB::raw` con input de usuario es la causa #1 de SQLi en Laravel. Si no puedes evitarlo, usa
  el segundo argumento de bindings.

---

## 8. XSS — Blade `{{ }}` vs `{!! !!}`

```blade
{{-- {{ }} escapa HTML automáticamente (htmlspecialchars). SEGURO por defecto. --}}
<h1>{{ $post->title }}</h1>
<p>Hola, {{ $user->name }}</p>

{{-- {!! !!} imprime HTML SIN escapar. Es la puerta directa a XSS. --}}
{{-- NUNCA con datos de usuario sin sanitizar. --}}
<div>{!! $userBio !!}</div>   {{-- PELIGRO si $userBio viene del usuario --}}
```

Si necesitas renderizar HTML provisto por usuarios (p. ej. contenido de un editor rich-text),
sanitízalo en el servidor con una allowlist antes de guardarlo o mostrarlo:

```bash
composer require mews/purifier   # HTML Purifier para Laravel
```

```php
// Sanitiza antes de persistir; solo entonces es defendible usar {!! !!}.
$post->body = clean($request->input('body')); // allowlist de tags/atributos seguros
```

Reglas:

- `{{ }}` siempre, salvo que tengas una razón explícita y el contenido esté sanitizado.
- En atributos y URLs, valida esquemas: bloquea `javascript:` en `href`/`src`.
- En JSON embebido en Blade usa `@json($data)` (escapa correctamente para `<script>`).

---

## 9. Secrets — `.env` / `config`, nunca hardcodeados

```php
// PELIGRO — clave hardcodeada en código que va a git:
$client = new StripeClient('sk_live_51H...');

// CORRECTO — el secret vive en .env y se lee vía config (cacheable).
// .env:                STRIPE_SECRET=sk_live_...
// config/services.php:  'stripe' => ['secret' => env('STRIPE_SECRET')],
$client = new StripeClient(config('services.stripe.secret'));
```

Reglas:

- Nunca llames `env()` fuera de archivos `config/*`. Con `config:cache` en producción, `env()`
  devuelve `null` en runtime. Lee siempre vía `config('...')`.
- `.env` jamás se commitea (debe estar en `.gitignore`); commitea solo `.env.example` con placeholders.
- Rota cualquier secret que haya tocado un commit o un log, aunque lo hayas borrado después.

---

## 10. Cifrado de datos sensibles — `Crypt`

```php
use Illuminate\Support\Facades\Crypt;

// Cifrado simétrico autenticado con APP_KEY (AES-256-GCM).
$encrypted = Crypt::encryptString($apiTokenDeTercero);
$plain     = Crypt::decryptString($encrypted);
```

```php
// Mejor: castea el atributo como 'encrypted' para cifrar/descifrar transparente.
protected function casts(): array
{
    return [
        'oauth_token'    => 'encrypted',
        'recovery_codes' => 'encrypted:array',
    ];
}
```

Reglas:

- Passwords NO se cifran, se **hashean**: `Hash::make()` / `Hash::check()` (bcrypt/argon2). Cifrar
  un password es un error (es reversible).
- `Crypt` depende de `APP_KEY`. Si rotas la key, los datos cifrados con la anterior dejan de
  descifrarse: planifica re-cifrado.

---

## 11. HTTPS y headers de seguridad

```php
// app/Providers/AppServiceProvider.php — boot()
use Illuminate\Support\Facades\URL;

public function boot(): void
{
    // Fuerza generación de URLs https en producción (detrás de proxy/load balancer).
    if ($this->app->isProduction()) {
        URL::forceScheme('https');
    }
}
```

Confía en el proxy solo de forma explícita (TrustProxies se configura en `bootstrap/app.php`):

```php
// bootstrap/app.php
->withMiddleware(function (Middleware $middleware) {
    $middleware->trustProxies(at: '*', headers:
        Illuminate\Http\Request::HEADER_X_FORWARDED_FOR |
        Illuminate\Http\Request::HEADER_X_FORWARDED_PROTO
    );
})
```

Headers de seguridad vía un middleware propio (registrado en el grupo `web`):

```bash
php artisan make:middleware SecurityHeaders
```

```php
// app/Http/Middleware/SecurityHeaders.php
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

public function handle(Request $request, Closure $next): Response
{
    $response = $next($request);

    $response->headers->set('X-Content-Type-Options', 'nosniff');
    $response->headers->set('X-Frame-Options', 'DENY');
    $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
    $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // Content-Security-Policy: define una política acorde a tu frontend.
    $response->headers->set('Content-Security-Policy', "default-src 'self'");

    return $response;
}
```

```php
// bootstrap/app.php — añadir al grupo web.
->withMiddleware(function (Middleware $middleware) {
    $middleware->web(append: [\App\Http\Middleware\SecurityHeaders::class]);
})
```

---

## 12. Uploads seguros

```php
// En el Form Request: valida tipo real, tamaño y dimensiones.
public function rules(): array
{
    return [
        'avatar' => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'max:2048'], // KB
        'doc'    => ['required', 'file', 'mimetypes:application/pdf', 'max:10240'],
    ];
}
```

```php
// Guarda con nombre generado por Laravel (hash), nunca con el nombre del cliente.
// Por defecto va a storage/app/private (NO accesible públicamente).
$path = $request->file('avatar')->store('avatars');           // disco 'local' privado
// Para archivos públicos, usa el disco 'public' conscientemente:
// $path = $request->file('doc')->store('docs', 'public');
```

Reglas:

- Valida `mimes`/`mimetypes` y `max` SIEMPRE. No confíes en la extensión ni en el `Content-Type` del cliente.
- Nunca uses `getClientOriginalName()` como nombre de archivo (path traversal / sobrescritura).
- Sirve archivos privados a través de un controller que verifica autorización, no por URL directa.
- Almacena uploads fuera del docroot; el directorio de subida no debe poder ejecutar PHP.

---

## 13. Deploy seguro

```bash
# 1. Generar APP_KEY (una vez por entorno; sin ella Crypt/sesiones fallan).
php artisan key:generate

# 2. Cachear config/rutas/eventos (rápido y obliga a leer secrets vía config()).
php artisan config:cache
php artisan route:cache
php artisan event:cache

# 3. Optimizar autoloader de Composer sin dependencias de dev.
composer install --no-dev --optimize-autoloader

# 4. Migraciones sin prompt interactivo.
php artisan migrate --force
```

Checklist `.env` de producción:

```
✓ APP_ENV=production
✓ APP_DEBUG=false        ← CRÍTICO: con true se exponen stacktraces, queries y secrets
✓ APP_KEY=base64:...     ← generada, no vacía
✓ APP_URL=https://...    ← https, no http
✓ SESSION_SECURE_COOKIE=true   ← cookies de sesión solo por https
✓ LOG_LEVEL=error              ← no loguear debug/info con PII en producción
```

Reglas:

- `APP_DEBUG=false` en producción es no negociable. Con `true`, cualquier error 500 filtra
  entorno, conexión a BD, fragmentos de código y a veces valores de `.env`.
- Nunca dejes `/telescope`, `/horizon`, `/_ignition` ni rutas de debug accesibles sin gate de auth.
- Verifica los runtime logs tras el deploy, no solo que el build pasó.

---

## Checklist OWASP por endpoint

Antes de mergear cualquier endpoint que toque auth, autorización o datos sensibles:

```
AUTENTICACIÓN
  ✓ El endpoint exige auth (auth:sanctum / sesión) si no es deliberadamente público
  ✓ Sin token/sesión válida → 401, antes de cualquier lógica
  ✓ La identidad sale del token/sesión, NO de headers que el cliente controla

AUTORIZACIÓN (Broken Access Control — #1 OWASP)
  ✓ Hay una Policy/Gate que decide quién puede ejecutar la acción
  ✓ Gate::authorize(...) o middleware can: se invoca en CADA método (no solo en uno)
  ✓ IDOR cubierto: al cargar por ID se verifica ownership/permiso del recurso concreto

VALIDACIÓN E INPUT
  ✓ Toda entrada pasa por un Form Request (authorize() + rules()), no validación inline
  ✓ Se usa $request->validated()/safe(), nunca ->all() ni ->input() crudo al persistir
  ✓ Mass assignment protegido con $fillable (allowlist); is_admin/user_id NO están ahí

INYECCIÓN
  ✓ Sin DB::raw/whereRaw/orderByRaw con input concatenado; bindings o allowlist de columnas
  ✓ Blade usa {{ }}; cualquier {!! !!} solo con contenido sanitizado en servidor

CONFIGURACIÓN Y EXPOSICIÓN
  ✓ Rate limiting (throttle) en rutas de auth y de costo (IA, email/SMS, export)
  ✓ Secrets vía config()/.env, nunca hardcodeados; .env fuera de git
  ✓ Errores de producción no exponen stacktrace ni mensajes internos (APP_DEBUG=false)
  ✓ Uploads: mimes/mimetypes + max validados, nombre generado, almacenamiento privado
  ✓ CSRF activo en rutas web; excepciones solo para webhooks con firma propia
```

Severidades (alineadas con el skill `security-audit`):

- **CRÍTICO**: endpoint sin auth, SQLi por `DB::raw`+input, IDOR sin Policy, `APP_DEBUG=true` en prod, secret hardcodeado en git.
- **ALTO**: bypass de autorización por rol, mass assignment de `is_admin`/`user_id`, `{!! !!}` con input de usuario.
- **MEDIO**: sin rate limiting en login/IA, CSRF deshabilitado de más, headers de seguridad ausentes.
- **BAJO**: cookies sin `Secure`, logs verbosos en producción, dependencias desactualizadas sin CVE activo.

---

## Relación con otros skills

- Complementa a `security-audit` (checklist agnóstico al stack) con la implementación concreta en Laravel 13.
- `new-feature` lo invoca cuando la feature toca auth, autorización o datos sensibles.
- Lo puede invocar el agente `forge-audit-specialist` o un reviewer durante un PR.
- Standalone: no depende de otros skills para ejecutarse.