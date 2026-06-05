# Skill: laravel-mcp

Laravel para agentes y MCP: instala Laravel Boost (MCP de desarrollo), construye tu propio
servidor MCP con `laravel/mcp`, usa el AI SDK first-party (`laravel/ai`) para agentes con
tool-calling y embeddings, y expón tu app a clientes de IA de forma segura. Actívalo cuando el
proyecto sea Laravel y haya que integrar IA, MCP o introspección por agentes.

Triggers: /laravel-mcp, "laravel boost", "servidor mcp laravel", "exponer mi app a un agente",
"laravel ai sdk", "agente laravel", "tool calling laravel", "embeddings laravel", "pgvector laravel",
"rag laravel", "boost install", "make:mcp-server", "make:agent".

---

## Cuándo usar este skill

- Al instalar **Laravel Boost** para que el agente tenga introspección del proyecto (schema, rutas, logs, docs).
- Al construir **tu propio servidor MCP** con `laravel/mcp` para exponer tu app a clientes externos (Claude, ChatGPT, editores).
- Al construir **features de IA dentro de la app** con el AI SDK (`laravel/ai`): agentes, tool-calling, structured output.
- Al implementar **búsqueda semántica / RAG** con embeddings y pgvector.
- Al decidir **cómo exponer la app a agentes de forma segura** (auth, scopes, tools read-only).

> Las versiones recientes de Laravel usan estructura slim: no existe `app/Http/Kernel.php` ni
> `app/Console/Kernel.php`; todo el middleware se configura en `bootstrap/app.php` dentro de
> `->withMiddleware(...)`. Verifica leyendo `bootstrap/app.php` y la documentación oficial de tu
> versión instalada (`laravel.com/docs/{tu-versión}.x`), y confirma el requisito de PHP de tu versión.

---

## Los tres paquetes de IA — NO son intercambiables

| Paquete | Qué hace | Quién lo usa | Producción |
|---------|----------|--------------|------------|
| **AI SDK** (`laravel/ai`) | Construir features de IA **dentro** de tu app | Tu app y sus usuarios finales | Sí |
| **Boost** (`laravel/boost`) | Ayudar a los **agentes** a escribir mejor código Laravel | Tú, el desarrollador | **Solo `--dev`** |
| **MCP** (`laravel/mcp`) | **Exponer** la funcionalidad de tu app a clientes de IA externos | Clientes externos (Claude, ChatGPT) | Sí |

Una app de producción puede usar los tres. **Boost está construido sobre `laravel/mcp`.** Las tools del
AI SDK (`Laravel\Ai\Contracts\Tool`) y las tools de MCP (`Laravel\Mcp\Server\Tool`) son clases distintas
con propósitos distintos: no las mezcles.

---

## Guidelines vs Skills (concepto transversal)

- **Guidelines** = se cargan **upfront** (al inicio del contexto). Son convenciones version-aware que el
  agente recibe siempre. Boost las inyecta automáticamente según las versiones detectadas del proyecto.
- **Skills** = se cargan **on-demand** (cuando hacen falta). Son capacidades especializadas que el agente
  activa por trigger, sin pesar en el contexto base.

Boost provee ambos: AI Guidelines (siempre presentes, version-aware) y Agent Skills (bajo demanda).

---

## 1 — Laravel Boost: introspección del proyecto para el agente (dev-only)

Boost levanta un servidor MCP **de desarrollo** que le da al agente herramientas para inspeccionar el
proyecto real. Nunca afecta producción.

```bash
composer require laravel/boost --dev
php artisan boost:install
```

`boost:install` detecta el stack, instala las AI Guidelines version-aware y registra el servidor MCP en
los clientes soportados (Claude Code, Cursor, Codex, Gemini CLI, GitHub Copilot, Junie).

Registro manual en Claude Code (si hace falta):

```bash
claude mcp add -s local -t stdio laravel-boost php artisan boost:mcp
```

El servidor MCP corre con:

```bash
php artisan boost:mcp
```

### Tools que expone Boost

La tabla oficial *Available MCP Tools* lista **11 herramientas** (el "15+" que circula es copy de marketing):

| Tool | Para qué |
|------|----------|
| Application Info | versiones de PHP/Laravel, paquetes, modelos detectados |
| Database Schema | estructura de tablas/columnas/índices |
| Database Query | ejecutar queries de lectura contra la BD del proyecto |
| Database Connections | conexiones configuradas |
| Route Inspector | inspeccionar rutas registradas |
| Tinker | evaluar código en el contexto de la app |
| Read Log Entries | leer entradas de `laravel.log` |
| Last Error | el último error capturado |
| Browser Logs | logs del navegador (frontend) |
| Get Absolute URL | resolver URLs absolutas del proyecto |
| Search Docs | búsqueda **version-aware** sobre 17.000+ chunks indexados por embeddings del ecosistema Laravel |

> No afirmes "15+ tools" como hecho. La tabla oficial lista 11 herramientas.

### Mantener Boost actualizado y agregar skills del catálogo

```bash
php artisan boost:update --discover
```

`--discover` re-detecta el stack y refresca guidelines. Para sumar una Agent Skill del catálogo a tu
proyecto se usa el comando de Boost contra un repo `owner/repo`:

```bash
php artisan boost:add-skill owner/repo
```

---

## 2 — laravel/mcp: construye TU PROPIO servidor MCP

Expón tu app a clientes de IA externos. Instala el paquete y publica las rutas de IA:

```bash
composer require laravel/mcp
php artisan vendor:publish --tag=ai-routes   # crea routes/ai.php
```

### Crear el servidor

```bash
php artisan make:mcp-server WeatherServer
```

```php
<?php

namespace App\Mcp\Servers;

use App\Mcp\Tools\CurrentWeatherTool;
use Laravel\Mcp\Server;
use Laravel\Mcp\Server\Attributes\Instructions;
use Laravel\Mcp\Server\Attributes\Name;
use Laravel\Mcp\Server\Attributes\Version;

#[Name('Weather Server')]
#[Version('1.0.0')]
#[Instructions('Expone clima actual y pronósticos a clientes de IA. Solo lectura.')]
class WeatherServer extends Server
{
    // Tres primitivas de MCP: Tools (acciones), Resources (contexto), Prompts (plantillas)
    protected array $tools = [
        CurrentWeatherTool::class,
    ];

    protected array $resources = [
        // ForecastResource::class,
    ];

    protected array $prompts = [
        // WeatherReportPrompt::class,
    ];
}
```

### Crear una tool MCP

```bash
php artisan make:mcp-tool CurrentWeatherTool
```

```php
<?php

namespace App\Mcp\Tools;

use Laravel\Mcp\Request;
use Laravel\Mcp\Response;
use Laravel\Mcp\Server\Attributes\Description;
use Laravel\Mcp\Server\Tool;
use Illuminate\JsonSchema\JsonSchema;

#[Description('Devuelve el clima actual de una ciudad.')]
class CurrentWeatherTool extends Tool
{
    public function handle(Request $request): Response
    {
        $city = $request->get('city');

        // Lógica real (solo lectura). NUNCA mutar estado en una tool read-only.
        $temp = app(WeatherService::class)->currentTemp($city);

        return Response::text("El clima en {$city} es {$temp}°C.");
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'city' => $schema->string()
                ->description('Nombre de la ciudad')
                ->required(),
        ];
    }
}
```

### Registrar el servidor (stdio local vs HTTP remoto)

En `routes/ai.php`:

```php
<?php

use App\Mcp\Servers\WeatherServer;
use Laravel\Mcp\Facades\Mcp;

// HTTP remoto (clientes externos, ChatGPT/Claude): expón por una ruta web
Mcp::web('/mcp/weather', WeatherServer::class);

// stdio local (editores, desarrollo): nombre lógico del servidor
Mcp::local('weather', WeatherServer::class);
```

- **stdio** (`Mcp::local`): para editores y uso local, sin red.
- **HTTP** (`Mcp::web`): para clientes remotos. **Requiere autenticación** (ver sección de seguridad).

---

## 3 — AI SDK (`laravel/ai`): agentes con tool-calling y structured output

El AI SDK es el sucesor first-party de Prism: **AI SDK es a Prism lo que Eloquent es a Query Builder.**
No uses Prism directamente para features nuevas en Laravel.

```bash
composer require laravel/ai
php artisan vendor:publish --provider="Laravel\Ai\AiServiceProvider"
php artisan migrate
```

Config en `config/ai.php`. Es **provider-agnostic** vía el enum `Laravel\Ai\Enums\Lab`
(`Lab::Anthropic`, `Lab::OpenAI`, `Lab::Gemini`, …).

### Crear un agente

```bash
php artisan make:agent SalesCoach
php artisan make:agent SalesCoach --structured   # para structured output
```

```php
<?php

namespace App\Ai\Agents;

use App\Ai\Tools\RandomNumberGenerator;
use Laravel\Ai\Attributes\MaxSteps;
use Laravel\Ai\Attributes\Model;
use Laravel\Ai\Attributes\Provider;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\HasTools;
use Laravel\Ai\Concerns\Promptable;
use Laravel\Ai\Enums\Lab;

#[Provider(Lab::Anthropic)]
#[Model('claude-sonnet-4-6')]
#[MaxSteps(10)]                 // acota loops descontrolados de tool-calling
class SalesCoach implements Agent, HasTools
{
    use Promptable;

    public function instructions(): string
    {
        return 'Eres un coach de ventas. Responde conciso y accionable.';
    }

    public function tools(): array
    {
        return [
            new RandomNumberGenerator(),
        ];
    }
}
```

Capacidades opt-in vía contratos: `HasTools`, `Conversational`, `HasStructuredOutput`,
`HasProviderOptions`. Atributos de control: `#[MaxSteps(10)]`, `#[Provider]`, `#[Model]`,
`#[MaxTokens]`, `#[Temperature]`.

Invocar el agente:

```php
$response = (new SalesCoach)->prompt('¿Cómo abro una llamada en frío?');
```

### Crear una tool del AI SDK

```bash
php artisan make:tool RandomNumberGenerator
```

```php
<?php

namespace App\Ai\Tools;

use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Illuminate\JsonSchema\JsonSchema;

class RandomNumberGenerator implements Tool
{
    public function description(): string
    {
        return 'Genera un número aleatorio entre min y max.';
    }

    public function handle(Request $request): int
    {
        return random_int($request->integer('min'), $request->integer('max'));
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'min' => $schema->integer()->required(),
            'max' => $schema->integer()->required(),
        ];
    }
}
```

> **Scoping de tools por agente**: evita el bloat de contexto declarando solo las tools que cada agente
> necesita. Guía de Taylor: mantén el total de tools **bastante por debajo de ~50**.

---

## 4 — Embeddings y vector search con pgvector (RAG / semántica)

### Migración con pgvector

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::ensureVectorExtensionExists();

        Schema::create('documents', function (Blueprint $table) {
            $table->id();
            $table->text('body');
            $table->vector('embedding', dimensions: 1536)->index();
            $table->timestamps();
        });
    }
};
```

### Generar embeddings

```php
use Illuminate\Support\Str;
use Laravel\Ai\Embeddings;

// Helper directo
$vector = Str::of($document->body)->toEmbeddings();

// API con caché y batch
$vectors = Embeddings::for([$a->body, $b->body])
    ->cache(3600)
    ->generate();
```

Providers de embeddings: OpenAI, Gemini, Cohere, Mistral, Jina, VoyageAI, Ollama, Bedrock.

### Consultar por similitud

```php
use App\Models\Document;

// El string se auto-embebe; minSimilarity filtra el ruido
$matches = Document::query()
    ->whereVectorSimilarTo('embedding', 'cómo cancelo mi suscripción', minSimilarity: 0.4)
    ->orderByVectorDistance('embedding', 'cómo cancelo mi suscripción')
    ->limit(5)
    ->get();
```

Operadores disponibles: `whereVectorSimilarTo()`, `selectVectorDistance()`,
`whereVectorDistanceLessThan()`, `orderByVectorDistance()`.

### RAG con la tool built-in `SimilaritySearch`

Conecta el AI SDK con tu tabla vectorial para que el agente recupere contexto:

```php
use Laravel\Ai\Tools\SimilaritySearch;
use App\Models\Document;

public function tools(): array
{
    return [
        SimilaritySearch::usingModel(Document::class, 'embedding'),
    ];
}
```

---

## 5 — Exponer tu app a agentes de forma segura

### Autenticación de servidores MCP

- **HTTP (`Mcp::web`)** → **Passport (OAuth 2.1)** recomendado por máxima compatibilidad con clientes de IA.
- **Token simple** → **Sanctum** si solo necesitas tokens de acceso, sin la complejidad de OAuth.

```php
// routes/ai.php — proteger un servidor MCP HTTP
Mcp::web('/mcp/weather', WeatherServer::class)
    ->middleware(['auth:api']);    // Passport / Sanctum guard
```

Elección de paquete de auth (regla 2026):

- **Sanctum** = default para la mayoría de APIs: tokens livianos + cookie SPA + mobile, soporta abilities/scopes, sin OAuth.
- **Passport** = servidor OAuth2/OAuth 2.1 completo: úsalo **solo** para clientes de terceros, "Log in with X", autorización delegada o M2M (client-credentials). Para MCP HTTP es la opción de máxima compatibilidad.
- **Fortify** = backend de session-auth headless (sin UI) para apps web first-party. No emite tokens de API.

### Scopes y tools read-only

```php
// Exigir un scope/ability específico antes de exponer la tool
public function handle(Request $request): Response
{
    abort_unless($request->user()?->tokenCan('weather:read'), 403);

    return Response::text(/* ... solo lectura ... */);
}
```

```
✓ Tools de lectura por defecto. Las que mutan estado requieren scope explícito y verificación de ownership.
✓ Nunca confíes en argumentos de la tool para autorizar: re-verifica auth y permisos en handle().
✓ Limita el surface: registra en $tools solo lo que el cliente externo realmente necesita.
✗ No expongas Tinker ni queries arbitrarias a clientes externos (eso es de Boost, que es dev-only).
```

---

## Señales de alerta — STOP y consultar

```
✗ Crear o referenciar app/Http/Kernel.php — las versiones recientes de Laravel usan estructura slim sin ese archivo; el middleware va en bootstrap/app.php (verifícalo leyendo bootstrap/app.php).
✗ Mezclar Laravel\Ai\Contracts\Tool (AI SDK) con Laravel\Mcp\Server\Tool (MCP) — son clases distintas.
✗ Usar Prism directamente para features nuevas — el AI SDK lo supersede.
✗ Instalar Boost sin --dev, o exponer boost:mcp a clientes externos — Boost es dev-only.
✗ Exponer un servidor MCP HTTP sin autenticación — siempre auth:api (Passport/Sanctum).
✗ Afirmar "Boost tiene 15+ MCP tools" como hecho — la tabla oficial lista 11.
✗ Agente sin #[MaxSteps] declarado — riesgo de loop infinito de tool-calling.
✗ Tabla vectorial sin Schema::ensureVectorExtensionExists() ni ->index() en la columna vector.
```

---

## Relación con otros skills

- Se apoya en `security-audit` para revisar la auth y los scopes de cualquier servidor MCP HTTP expuesto.
- `db-migrate` cubre las migraciones (incluida la de pgvector) si la feature toca el schema.
- `new-feature` lo invoca cuando una feature de Laravel requiere integración de IA, MCP o RAG.
