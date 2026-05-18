# Forge v2: Plan de Arquitectura y Roadmap

**Versión:** Borrador 1.0
**Fecha:** Mayo 2026
**Estado:** Documento vivo, para iterar con el equipo de SocialWeb
**Audiencia:** Equipo técnico de SocialWeb, mantenedores futuros del proyecto

---

## 1. Contexto y propósito

Forge es el framework de desarrollo con agentes de IA que SocialWeb usa internamente. Hoy es una herramienta de un solo autor (Cris) que el equipo va a adoptar como estándar de trabajo durante los próximos meses, con el objetivo de liberarlo públicamente cuando esté maduro.

Este documento define hacia dónde evoluciona Forge en su versión 2, qué partes se rediseñan, qué se mantiene, y en qué orden se construye.

Las decisiones se basan en cuatro fuentes de evidencia:

Primero, el estudio de claude-code-harness (Chachamaru127), proyecto japonés con 252 estrellas que cristaliza el patrón "plan-work-review-release" con guardrails en TypeScript y planner-critic dialéctico.

Segundo, las configuraciones del proyecto proyecto-alpha (greenfield, SDD estricto, compliance Ley 21.719), que aporta el ciclo de sesión obligatorio, hooks de enforcement en runtime, integración con GitHub Projects y wiki en git.

Tercero, las configuraciones del proyecto proyecto-beta (producción activa, Vercel + Supabase + Prisma), que aporta el flujo local-to-prod, integración MCP con servicios externos, protecciones contra incidentes reales de producción, y el patrón "leer antes, escribir después" con Obsidian.

Cuarto, la experiencia operativa de SocialWeb trabajando con clientes reales (Cliente-Media, Cliente-ONG, Cliente-Viajes, Cliente-GobiernoCL, Cliente-Deporte) sobre stacks heterogéneos (Laravel, WordPress, Next.js, Hono, etc.).

---

## 2. Principios de diseño para v2

La versión 2 se construye sobre siete principios. Cada feature nueva debe pasar por estos filtros antes de entrar al roadmap.

**Pocos verbos, mucha profundidad.** La superficie de comandos se reduce. Toda la complejidad vive detrás de los verbos, no en su nombre. Forge v1 tiene una superficie demasiado amplia para un usuario que no es el autor.

**La sesión es la unidad de trabajo.** No es "abro Claude Code y empiezo a tipear". Una sesión tiene apertura, contexto, rama git asociada, y cierre. El ritual de apertura detecta trabajo previo y reanuda sesiones existentes en vez de crear nuevas. Esto se inspira directamente en `/session-start` y `/session-close` de proyecto-alpha.

**Configuración declarativa, enforcement en runtime.** El `project.yaml` sigue siendo la fuente de verdad. Pero la nueva versión añade hooks que aplican reglas activamente durante la ejecución de los agentes, no solo en setup. La diferencia entre skill-pack y harness. proyecto-alpha lo hace con `pre-edit-check.py` y `stop-typecheck.sh`. proyecto-beta lo hace con `check-destructive-sql.mjs` y `check-attack-queue.mjs`.

**Multi-runtime real, no aspiracional.** Forge v1 promete soporte para Claude Code, OpenCode, Kiro y Codex, pero el flujo principal está pensado para Claude Code. La v2 asume que el desarrollador real puede usar dos o tres runtimes en paralelo. Las sesiones se coordinan entre ellos.

**Producción es un modo, no un addon.** Las acciones de producción (deploy verificado, smoke tests, rollback, monitoreo) son parte del flujo principal cuando un proyecto tiene marca de "production". El patrón sale del trabajo real en proyecto-beta: nunca dar por terminada una tarea hasta que Vercel responda `state: READY`.

**Memoria del proyecto en git.** Sin vector stores, sin RAG infrastructure, sin servicios externos. El conocimiento del proyecto vive en archivos markdown que Claude lee como contexto. proyecto-alpha lo hace con `docs/wiki/`. proyecto-beta lo hace con `docs/proyecto-beta-obsidian-vault/`. Forge v2 estandariza el patrón con un esqueleto opinado.

**Tu equipo es el primer usuario, no la comunidad.** Cada decisión de diseño se valida contra el uso de los desarrolladores de SocialWeb antes de pensar en adopción externa. Si tu equipo no lo usa con fluidez, la comunidad tampoco lo va a usar.

---

## 3. Arquitectura de Forge v2

### 3.1 Capas del sistema

Forge v2 tiene cinco capas claramente separadas. Cada una tiene un propósito distinto y reglas distintas para evolucionar.

**Capa 1: Configuración declarativa (`project.yaml`).** La fuente de verdad. Stack, modo (startup/standard/enterprise), profiles activos, skills activas, integraciones MCP, reglas no-negociables del proyecto. Esto Forge v1 ya lo tiene y es de lo mejor diseñado.

**Capa 2: Sesiones y ciclo de vida.** Comandos que envuelven el trabajo del día: apertura, trabajo, cierre. Esta es la capa nueva más importante. Toma el patrón de proyecto-alpha y lo generaliza.

**Capa 3: Flujo SDD (plan, work, review, ship).** Los cuatro verbos del trabajo real. Cada uno ejecuta dentro de una sesión activa. Aquí se concentran las skills y los agentes. Se inspira en Harness pero ajustado al patrón SocialWeb.

**Capa 4: Enforcement en runtime (hooks).** PreToolUse, Stop, UserPromptSubmit. Lo que distingue a Forge de una colección de prompts. Reglas que se aplican activamente.

**Capa 5: Memoria del proyecto.** Wiki en git, ADRs, daily notes, log de decisiones. Una sola estructura opinada que cada proyecto adopta sin discutir.

### 3.2 La superficie de comandos

Forge v2 expone seis comandos principales y un puñado de auxiliares.

**Comandos principales (los seis que el desarrollador usa cada día):**

```
/session-start    Apertura de sesión: detecta trabajo previo, propone branch
/session-close    Cierre: commit, changeset, GitHub Projects, PR
/plan             Crear o continuar una spec antes de implementar
/work             Implementación con agent team
/review           Revisión completa (compliance, security, quality)
/ship             Deploy + verificación en producción (solo modo production)
```

**Comandos auxiliares (los que se usan ocasionalmente):**

```
/forge init       Instalar Forge en un proyecto nuevo
/forge audit      Verificar coherencia del proyecto
/forge wiki       Operaciones de wiki: ingest, query, lint
/forge phase      Marcar inicio o fin de una fase del roadmap
```

Esta reducción es importante. Forge v1 tiene wizard, init, audit, scaffold, teardown, opportunities, search. La v2 consolida todo eso bajo `/forge <subcomando>` y deja los seis verbos principales en primer plano.

### 3.3 Estructura de carpetas estándar

Cuando Forge instala en un proyecto, genera la siguiente estructura. Es opinada y no negociable.

```
mi-proyecto/
├── project.yaml                    # Fuente de verdad
├── CLAUDE.md                       # Steering principal (generado de templates)
├── AGENTS.md                       # Convenciones para agent teams
├── .claude/
│   ├── settings.json               # Permisos, hooks, env vars
│   ├── settings.local.json         # Secretos locales (gitignored)
│   ├── commands/                   # Slash commands del proyecto
│   │   ├── session-start.md
│   │   ├── session-close.md
│   │   ├── plan.md
│   │   ├── work.md
│   │   ├── review.md
│   │   └── ship.md                 # solo si mode=production
│   ├── agents/                     # Definiciones de agentes
│   ├── skills/                     # Skills custom del proyecto
│   └── hooks/                      # Scripts de enforcement
│       ├── pre-edit-check.py
│       ├── stop-typecheck.sh
│       ├── pre-bash-check.py       # detecta comandos destructivos
│       └── session-attack-check.mjs # solo si tiene Supabase u otra DB
├── docs/
│   ├── architecture/
│   │   ├── overview.md
│   │   ├── data-model.md
│   │   └── adr/                    # ADRs inmutables
│   ├── specs/                      # SDD specs
│   │   └── _template.md
│   ├── wiki/                       # Memoria del proyecto
│   │   ├── index.md
│   │   ├── log.md                  # append-only
│   │   ├── concepts/
│   │   ├── entities/
│   │   ├── sources/
│   │   └── synthesis/
│   └── daily-notes/                # Notas por sesión
└── .changeset/                     # Si usa changesets
```

Cada elemento tiene una razón concreta. La estructura sale de proyecto-alpha combinada con proyecto-beta.

---

## 4. Los seis comandos principales en detalle

### 4.1 `/session-start`

Lo más importante de Forge v2. Es la primera acción obligatoria de cada sesión y enforza el patrón que proyecto-alpha ya estableció.

**Qué hace en orden:**

Primero, lee el estado del repositorio. Branch actual, fetch, PRs abiertos del usuario, branches recientes ordenadas por fecha.

Segundo, evalúa tres escenarios y actúa según corresponda:

Si ya está en una feature branch, continúa la sesión existente mostrando los últimos commits para dar contexto.

Si está en main con trabajo previo (PRs abiertos o branches sin merge), muestra una lista consolidada y pregunta qué hacer: continuar PR, continuar branch, o nueva sesión.

Si está en main sin trabajo previo, espera el primer mensaje del usuario para inferir el tema y propone un nombre de branch antes de tocar código.

Tercero, antes de cualquier edición, asegura estar en una feature branch. El hook `pre-edit-check.py` enforza esto bloqueando edits en main para archivos de código (no para docs).

Cuarto, si Forge detecta que el proyecto tiene wiki, hace una pre-carga implícita del index y de las notas del área que va a tocar. Esto es lo que proyecto-beta hace explícitamente con Obsidian: "leer antes de implementar".

**Convención de naming de branches:**

```
feature/<tema-corto>-YYYY-MM-DD
fix/<tema>-YYYY-MM-DD
chore/<tema>-YYYY-MM-DD
docs/<tema>-YYYY-MM-DD
```

La fecha en la branch resuelve el problema de múltiples sesiones sobre el mismo tema. Si dos sesiones del mismo día tocan billing, son `feature/billing-webpay-2026-05-16` y `feature/billing-fixes-2026-05-16`. No colisionan.

### 4.2 `/session-close`

El cierre completo de una sesión en una sola operación. Pipeline de ocho pasos.

```
1. git status         → identificar cambios sin commitear
2. commit             → Conventional Commits (lo pendiente)
3. changeset          → si hubo feat: o fix:
4. GitHub Projects    → mover issues trabajados a Done, cerrarlos
5. wiki/daily-notes   → registrar lo que se hizo
6. RELEASE-NOTES.md   → entrada con fecha y resumen
7. commit de cierre   → docs(progress): session close YYYY-MM-DD
8. rebase + PR        → sync con main, crear PR hacia main
```

**El paso 5 es la innovación clave.** Fesw-encuestas lo hace con Obsidian via curl. Cookycmp lo hace con `progress.html`. Forge v2 lo estandariza: cada sesión deja una nota en `docs/daily-notes/YYYY-MM-DD-<tema>.md` con qué se implementó, archivos tocados, decisiones tomadas, y links a commits y PR.

Esto resuelve el problema del "olvido entre sesiones" sin infraestructura: la próxima sesión que toque el mismo tema puede leer las daily-notes anteriores y entender el contexto.

**Antes del PR, rebase obligatorio:**

```bash
git fetch origin main
git log HEAD..origin/main --oneline   # detectar si main avanzó

# Si hay commits nuevos:
git rebase origin/main
git push --force-with-lease

# Si no:
git push -u origin <branch>
```

El `--force-with-lease` es seguro porque la feature branch es exclusiva de esta sesión. Esta es una de las cosas que proyecto-alpha resuelve elegantemente.

**Integración con GitHub Projects:**

Si el proyecto tiene un GitHub Project asociado (definido en `project.yaml`), el comando mueve issues trabajados a `Done` y los cierra. Esto requiere constantes PROJECT_ID, STATUS_FIELD_ID, etc., que viven en `project.yaml` y son leídas por el comando. Cookycmp tiene esto hardcodeado en CLAUDE.md. Forge v2 lo extrae a `project.yaml`.

### 4.3 `/plan`

Crear o continuar una spec. Esto es la materialización de "spec antes que código".

**Qué hace:**

Si recibe `/plan <fase> "<título>"`, crea una spec nueva en `docs/specs/<fase>-<slug>.md` usando la plantilla obligatoria, y guía al usuario por preguntas dirigidas para llenar: problem statement, non-goals, acceptance criteria, compliance mapping (si aplica), edge cases.

Si recibe `/plan` sin argumentos, lista specs en estado "draft" o "in-review" y pregunta cuál continuar.

**La spec sigue una plantilla obligatoria.** El template está en `docs/specs/_template.md` y se instala con Forge. Tiene secciones rígidas que el spec-engineer debe llenar.

**El patrón Planner-Critic.** Esto se toma de Harness. Antes de marcar una spec como "ready-to-implement", `/plan` invoca implícitamente dos agentes en tensión: un Planner que defiende el spec actual y un Critic que lo cuestiona. El usuario aprueba o pide ajustes. Esto evita specs débiles que después generan retrabajo.

Para el modo startup (1-2 personas) el Planner-Critic es opcional. Para standard y enterprise es obligatorio.

### 4.4 `/work`

Implementación. La spec ya está aprobada, ahora se construye.

**Qué hace:**

Lee la spec asociada (o pide elegir una si no hay una sesión activa con spec definida).

Identifica los paquetes afectados (relevante en monorepos como proyecto-alpha).

Propone un agent team con los roles correspondientes según el `project.yaml`. Para proyecto-alpha serían `senior-frontend`, `senior-backend`, `compliance-reviewer`, `qa-reviewer`. Para proyecto-beta serían los mismos cinco roles que ya definió ese proyecto.

Pregunta al usuario si aprueba el team y si quiere ajustar.

Spawnea el team usando `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` o el equivalente del runtime activo.

Coordina la ejecución. Cuando los teammates terminan, sintetiza resultados.

**Tamaño y composición del team:**

Forge v2 adopta la regla empírica de proyecto-beta: 3 a 5 teammates, 5-6 tasks cada uno. No crear team para tareas simples, lectura de código, o cambios en un solo archivo. Para esas, una sesión normal de Claude Code basta.

**Modos de ejecución:**

```
/work              # Paralelo, agent team
/work --serial     # Secuencial, sin team (modo conservador)
/work --codex      # Delegar implementación a Codex CLI en background
/work --autorun    # Tras aprobar plan, corre hasta completar (experimental)
```

El `--autorun` se inspira en el `/harness-work all` de Harness. Es la apuesta de autonomía. Para Forge v2 conviene marcarlo experimental hasta que esté validado con tres o cuatro proyectos reales del equipo.

### 4.5 `/review`

Revisión sobre el diff actual o un PR específico.

**Modos:**

```
/review                # Diff actual (working tree)
/review HEAD~3..HEAD   # Últimos 3 commits
/review PR-42          # Un PR específico
/review --codex        # Suma una opinión de Codex CLI
```

**Qué hace:**

Spawnea agentes en paralelo según el modo del proyecto. En modo startup: solo `qa-reviewer`. En standard: `qa-reviewer` + `security-auditor`. En enterprise: los anteriores más `compliance-reviewer` y `performance-reviewer` si están activos en `project.yaml`.

Cada agente revisa con su checklist. La salida es estructurada: APPROVED, CHANGES_REQUESTED, BLOCKED.

Si BLOCKED, no permite avanzar al `/ship`.

### 4.6 `/ship` (modo production)

El verbo nuevo, sale directo de proyecto-beta. Solo está disponible cuando `project.yaml` declara una integración de hosting (Vercel, Railway, Fly, AWS, etc.).

**Pipeline:**

```
1. Verificar que /review pasó                    → APPROVED requerido
2. git status limpio                              → ningún archivo sin commit
3. Merge PR a main (si el usuario aprueba)
4. Trigger deploy (push + esperar webhook, o manual)
5. Polling de deploy con backoff                  → max 1 poll/min (regla proyecto-beta)
6. Si state=BUILDING: esperar
7. Si state=ERROR: leer build logs, reportar al usuario, NO continuar
8. Si state=READY: 
   - Leer runtime logs (primeros 60s post-deploy)
   - Si hay errores en runtime: reportar, sugerir rollback
   - Si no hay errores: marcar deploy como exitoso
9. Smoke test opcional (si project.yaml lo define)
10. Actualizar daily-note con resultado del deploy
```

**La regla del max 1 poll/min** sale directamente de la experiencia operativa de proyecto-beta. Vercel rate-limita el API y polling agresivo termina con backoffs forzados que retrasan todo. La lección está aprendida, Forge la incorpora por defecto.

**Smoke tests:** declarados en `project.yaml`:

```yaml
deploy:
  provider: vercel
  project_id: prj_xxx
  smoke_tests:
    - url: https://prod.app/api/health
      expect_status: 200
    - url: https://prod.app/api/version
      expect_json: { version: $CURRENT_VERSION }
```

Si los smoke tests fallan post-deploy, `/ship` reporta y propone rollback (no lo ejecuta automáticamente; el rollback en producción siempre requiere confirmación humana explícita).

**Lección dolorosa codificada como regla:** después del incidente `--force-reset` del 2026-04-28 en proyecto-beta (225 usuarios y 35 formularios borrados, recuperados desde backup de Supabase Pro), Forge v2 incluye por defecto un hook `pre-bash-check.py` que detecta y bloquea comandos peligrosos como `--force-reset`, `prisma migrate reset`, `DROP TABLE`, `TRUNCATE`, y similares cuando se ejecutan contra URLs de producción identificadas en `project.yaml`. Este hook no es opcional en modo production.

---

## 5. Hooks: la capa de enforcement

Forge v2 instala hooks por defecto según el modo y el stack del proyecto. Esto es lo que diferencia a Forge de un skill-pack.

### 5.1 Hooks universales (todos los proyectos)

**`pre-edit-check.py`** (PreToolUse, matcher Edit|Write):

```
- Bloquea edits en main para archivos de código (no para docs/, .claude/, README)
- Detecta console.log en archivos TS/JS y avisa
- Detecta posibles secrets hardcodeados
- Detecta PII sin hashear en archivos sensibles (configurable por project.yaml)
```

**`stop-typecheck.sh`** (Stop, sin matcher):

```
- Detecta paquetes modificados durante el turno
- Corre typecheck solo en esos paquetes
- Reporta errores sin bloquear (Claude puede decidir corregir)
- Solo corre si project.yaml define la herramienta de typecheck
```

### 5.2 Hooks de modo production

**`pre-bash-check.py`** (PreToolUse, matcher Bash):

```
- Detecta y bloquea comandos destructivos contra URLs de producción
- Lista de patrones: --force-reset, DROP TABLE, TRUNCATE, DELETE FROM sin WHERE,
  prisma migrate reset, dropdb, rm -rf en paths sensibles
- Si el comando incluye PRODUCTION_DATABASE_URL o equivalentes, bloquea sin más
- Si el comando es ambiguo, pide confirmación explícita
```

**`session-attack-check.mjs`** (UserPromptSubmit):

```
- Revisa la cola de alertas de seguridad antes de cada mensaje del usuario
- Útil para proyectos que tienen un sistema de detección de ataques (como proyecto-beta)
- Si hay alertas pendientes, las muestra como contexto antes de procesar el prompt
```

### 5.3 Hooks de modo enterprise

**`compliance-pre-edit.py`** (PreToolUse, matcher Edit|Write):

```
- Para proyectos con frameworks de compliance declarados (ley-21719, gdpr, etc.)
- Detecta patrones específicos: UPDATE/DELETE en tablas append-only,
  modificación de jerarquía visual entre botones de consent, etc.
- Sale del compliance-pre-edit que proyecto-alpha ya tiene implementado para Ley 21.719
```

**`audit-log-append.py`** (PostToolUse):

```
- Registra cada acción que Claude ejecutó en un audit log inmutable
- Requerido para SOC2 y similares
- Genera evidencia exportable
```

### 5.4 Hooks por stack

Forge v2 selecciona hooks adicionales según el stack declarado en `project.yaml`:

| Stack | Hook adicional |
|---|---|
| Supabase | `check-destructive-sql.mjs` (ya existe en proyecto-beta) |
| Prisma | Bloquea `--force-reset` y `migrate reset` en prod |
| Vercel | Smoke test integration en `/ship` |
| Next.js | Verifica `output: 'standalone'` consistency |
| Drizzle | Verifica que migraciones tengan rollback (proyecto-alpha) |

---

## 6. Memoria del proyecto: wiki en git

Forge v2 estandariza el patrón "memoria en archivos markdown leídos como contexto". Ningún vector store, ningún RAG, ninguna infraestructura externa.

### 6.1 Estructura única opinada

Mezcla lo mejor de proyecto-alpha wiki y proyecto-beta obsidian vault:

```
docs/wiki/
├── index.md              # catálogo, actualizado en cada ingest
├── log.md                # append-only, registro de qué se ingestó cuándo
├── raw/                  # fuentes originales inmutables (NUNCA editar)
├── concepts/             # ideas, patrones, regulaciones
├── entities/             # proyectos, sistemas, personas, productos
├── sources/              # resumen por cada fuente externa
└── synthesis/            # análisis cross-cutting, ADRs

docs/daily-notes/
└── YYYY-MM-DD-<tema>.md  # generadas por /session-close
```

### 6.2 Comandos asociados

```
/forge wiki ingest <url|path|texto>   # agrega contenido y actualiza index
/forge wiki query <pregunta>          # consulta con citas a páginas
/forge wiki lint                      # health check, detecta links rotos, etc.
```

### 6.3 Convenciones obligatorias

`log.md` es append-only. Nunca editar entradas pasadas. Cada ingest es una entrada nueva.

`raw/` es inmutable. Las fuentes originales se preservan tal cual. La síntesis va en otros lados.

`index.md` se regenera automáticamente. Nunca editar a mano.

Los ADRs viven en `docs/architecture/adr/` (no en wiki). Son decisiones formales, inmutables, numeradas.

### 6.4 Integración opcional con Obsidian via MCP

Para proyectos donde el equipo prefiere editar con Obsidian Desktop, Forge v2 documenta la integración con `obsidian-local-rest-api` plugin (igual que proyecto-beta hace). Pero el formato sigue siendo markdown plano en `docs/wiki/` para que Claude lo lea sin depender de Obsidian. Si Obsidian no está corriendo, todo sigue funcionando.

---

## 7. project.yaml v2: el contrato

El archivo más importante de Forge. Define todo lo demás. La v2 incorpora las nuevas capacidades.

```yaml
project:
  name: "Mi Proyecto"
  mode: "standard"           # startup | standard | enterprise
  language: "es"             # idioma para outputs y prompts

stack:
  backend: "hono"            # o nextjs, fastapi, laravel, etc.
  frontend: "nextjs"
  database: "supabase"       # supabase, postgres, mysql, mongodb
  orm: "drizzle"             # drizzle, prisma, typeorm, sqlalchemy
  package_manager: "pnpm"    # pnpm, npm, yarn, bun
  monorepo: "turborepo"      # turborepo, nx, lerna, null

agents:
  active: [orchestrator, qa-reviewer]
  by_role:
    senior-frontend: claude-sonnet-4-6
    senior-backend: claude-sonnet-4-6
    compliance-reviewer: claude-opus-4-7   # razonamiento legal complejo
    orchestrator: claude-opus-4-7

profiles:
  - hono-drizzle
  - nextjs-admin

skills:
  active:
    - new-feature
    - db-migrate
    - browser-test

deploy:
  provider: vercel
  project_id: prj_xxx
  production_url: https://app.example.com
  smoke_tests:
    - url: /api/health
      expect_status: 200

mcp:
  servers:
    - name: supabase
      auto_approve:
        - execute_sql
        - list_tables
        - get_logs
    - name: vercel
      auto_approve:
        - list_deployments
        - get_deployment

github:
  project:
    number: 3
    owner: socialwebcl
    repo: mi-proyecto
    status_field_id: PVTSSF_xxx
    status_in_progress: 47fc9ee4
    status_done: 98236657

rules:
  forbidden_in_production:
    - "prisma migrate reset"
    - "--force-reset"
    - "DROP TABLE"
    - "TRUNCATE"
  required_review_before_ship: true
  require_spec_before_implementation: true
  conventional_commits: true
```

La explicitud aquí es deliberada. Lo que en proyecto-alpha está hardcodeado en CLAUDE.md, en Forge v2 vive en `project.yaml` y se lee desde los comandos.

---

## 8. Modos del proyecto

Los tres modos heredados de Forge v1 se refinan en v2.

**Startup (1-2 personas).** Lo mínimo necesario. Sesiones, plan, work, review, ship. Sin Planner-Critic obligatorio. Sin compliance-reviewer. Sin audit logs. Foco en velocidad. Esto es para los proyectos chicos de la consultora o startups en pre-MVP.

**Standard (3-8 personas).** El default. Roster completo de agentes, fases A/B, Planner-Critic obligatorio, hooks de typecheck y branch-guard activos. Esto es para la mayoría de proyectos de SocialWeb: proyecto-beta, proyecto-IDEA, los proyectos de Cliente-Media no infantiles.

**Enterprise (9+ personas o cliente regulatorio).** Standard más compliance-reviewer activo, audit logs append-only, ADRs obligatorios, 4 fases en lugar de 2, CI con verificación de compliance. Esto es para proyecto-alpha (Ley 21.719), proyectos con SOC2, y eventualmente para sistemas del sector público si Forge alguna vez se aplica ahí (con las restricciones de probidad ya discutidas).

Cada modo activa un conjunto distinto de hooks por defecto. El `forge init` lo configura automáticamente según el modo elegido en el wizard.

---

## 9. Roadmap

El roadmap se organiza en fases trimestrales. Las primeras dos son adopción interna en SocialWeb. La tercera es preparación para liberación pública.

### 9.1 Fase 0 — Estabilización con el equipo (Mayo–Junio 2026)

**Objetivo:** que tres desarrolladores de SocialWeb usen Forge v1 actual (con los cambios mínimos del session-start/close) en proyectos reales y generen feedback.

Tareas:

Reescribir `/session-start` y `/session-close` en Forge tomando los archivos de proyecto-alpha como base. Estos dos comandos solos justifican una versión "v1.5" que se puede usar inmediatamente.

Documentar la convención de naming de branches y la regla "no editar main".

Instalar el hook `pre-edit-check.py` adaptado a stacks no-TypeScript también (PHP, Python, etc.).

Identificar al líder técnico de Forge dentro de SocialWeb que va a recibir el mantenimiento mientras Cris está en el gobierno.

Empezar bitácora de fricción: cada vez que un dev tropieza, se anota.

**Resultado esperado al cierre de la fase:** tres proyectos de SocialWeb usando Forge v1.5 con session-start/close. Lista de 10-15 fricciones identificadas. Líder técnico designado.

### 9.2 Fase 1 — Forge v2 core (Julio–Agosto 2026)

**Objetivo:** consolidar los seis comandos principales y la arquitectura de hooks por modo.

Tareas:

Implementar `/plan`, `/work`, `/review`, `/ship` con sus modos y opciones.

Refactorizar `project.yaml` a la versión 2.0 con migración automática desde v1.

Implementar los hooks universales y de modo production.

Crear el sistema de profiles por stack actualizado.

Crear el agente Planner-Critic con su dialéctica.

Generar el comando `/forge wiki` con ingest, query y lint.

Documentar internamente todo lo nuevo.

Migrar proyecto-alpha y proyecto-beta a Forge v2 (los dos proyectos que han sido fuente de evidencia se convierten en validación: si no funcionan en Forge v2, Forge v2 está mal).

**Resultado esperado al cierre de la fase:** Forge v2 funcionando en proyecto-alpha, proyecto-beta, y al menos un proyecto nuevo de SocialWeb. Documentación interna completa. Cinco proyectos rodando con el flujo `/session-start` → `/plan` → `/work` → `/review` → `/ship` → `/session-close`.

### 9.3 Fase 2 — Multi-runtime real (Septiembre–Octubre 2026)

**Objetivo:** que Forge v2 funcione genuinamente en al menos dos runtimes además de Claude Code.

Tareas:

Implementar y probar el flujo completo en OpenCode.

Implementar y probar el flujo completo en Codex CLI.

Decidir si Kiro vale el esfuerzo (revisar tracción del producto AWS a esa altura).

Refinar la capa de traducción entre runtimes para que los hooks funcionen en todos.

Documentar las diferencias y limitaciones de cada runtime.

**Resultado esperado al cierre de la fase:** dos proyectos de SocialWeb corriendo en runtimes distintos. Documentación clara de qué funciona en cada uno y qué no. Capacidad para cambiar de runtime sin rehacer el proyecto.

### 9.4 Fase 3 — Liberación pública (Noviembre 2026–Enero 2027)

**Objetivo:** liberar Forge v2 bajo `socialwebcl/forge` con Apache 2.0.

Pre-requisitos antes de liberar (los tres "sí" que ya conversamos):

Un desarrollador nuevo en SocialWeb puede empezar a usar Forge productivamente con solo la documentación, sin que nadie le explique en persona.

Hay al menos dos desarrolladores en el equipo, además de Cris, que pueden modificar Forge con autonomía y calidad.

El framework ha sobrevivido al menos cinco proyectos reales sin requerir parches mayores en arquitectura.

Tareas:

Limpiar el repo de cualquier rastro de cliente específico o información sensible.

Escribir el README final con posicionamiento honesto y comparativa contra cc-sdd, Bridle, Harness.

Publicar la extensión de VS Code al Marketplace simultáneamente, con mantenedor asignado.

Escribir tres a cinco artículos de LinkedIn desde el rol académico (UTFSM, MIT) anunciando y explicando el proyecto.

**Resultado esperado al cierre de la fase:** repo público con primer release v2.0.0. Extensión publicada. Tres artículos en LinkedIn. Equipo de SocialWeb capacitado para responder issues de la comunidad.

### 9.5 Fase 4 — Post-liberación (Febrero 2027 en adelante)

**Objetivo:** decidir el camino largo de Forge basado en tracción real.

Posibilidades:

Si recibe tracción orgánica (issues, PRs, mention, downloads), pivotar hacia camino producto: training, certificación, soporte enterprise.

Si no recibe tracción pero el equipo lo sigue usando bien, mantener como activo de marca de SocialWeb y plataforma de pensamiento para Cris.

Si recibe tracción modesta, mantener como proyecto open source bien cuidado sin ambición comercial mientras tú estés en el gobierno.

Esta fase no se planifica en detalle ahora. Se decide con datos en mano.

---

## 10. Riesgos y mitigaciones

**Riesgo: Cris no puede mantener el proyecto activamente mientras está en organismo-publico.**

Mitigación: el líder técnico designado en la Fase 0 es el mantenedor activo. Cris queda como autor original y consultor. Decisiones grandes pasan por comité de dos personas, no por Cris solo.

**Riesgo: el espacio open source se mueve más rápido que el ritmo de SocialWeb.**

Mitigación: Forge v2 no compite con Harness o cc-sdd en velocidad de releases. Compite en aplicabilidad a equipos de consultoría con stacks heterogéneos. El roadmap acepta perder en releases por mes y ganar en madurez por proyecto.

**Riesgo: el equipo no adopta Forge y queda como herramienta de una sola persona.**

Mitigación: la Fase 0 es exactamente para detectar esto. Si al cierre de junio menos de tres devs lo usan voluntariamente, hay que repensar el proyecto antes de seguir invirtiendo. La bitácora de fricción es el termómetro.

**Riesgo: el código actual de Forge tiene rastros de clientes específicos o información sensible.**

Mitigación: hacer auditoría de contenido en la Fase 0, no en la Fase 3. Cualquier cosa que huela a cliente sale del repo aunque sea privado, porque cuando se publique no hay vuelta atrás.

---

## 11. Métricas para decidir

Cómo saber si Forge v2 está funcionando. No hay que medir todo, solo lo que cambia decisiones.

**Métrica primaria: adopción interna.** Cuántos proyectos nuevos de SocialWeb arrancan con Forge v2. Meta al cierre de Fase 1: cinco. Meta al cierre de Fase 2: ocho.

**Métrica secundaria: autonomía del equipo.** Cuántas modificaciones a Forge fueron hechas por alguien que no es Cris. Meta al cierre de Fase 1: 30%. Al cierre de Fase 2: 50%.

**Métrica de calidad de proceso: fricciones documentadas.** Cuántas entradas tiene la bitácora de fricción y cuántas se han resuelto. Meta: bitácora con menos de cinco entradas abiertas en cualquier momento.

**Métricas que NO importan en esta etapa:** estrellas en GitHub, forks, downloads. Estas métricas se miran solo después de la Fase 3.

---

## 12. Lo que NO hace Forge v2

Tan importante como lo que hace.

No es un runtime. Forge configura runtimes existentes (Claude Code, OpenCode, Codex), no reemplaza ninguno.

No es un orquestador de agentes en tiempo real. La orquestación la hace el runtime. Forge define el contrato.

No es un IDE. La extensión de VS Code es un asistente del CLI, no un reemplazo. El trabajo real ocurre en la terminal.

No es un sistema de gestión de proyectos. Se integra con GitHub Projects pero no lo reemplaza.

No es un sistema de memoria con vector store. La memoria vive en git como markdown.

No es un producto comercial mientras Cris esté en organismo-publico. Es una herramienta interna que se libera abierta.

---

## 13. Preguntas abiertas

Cosas que este documento no resuelve y que requieren conversación con el equipo.

¿Quién es el líder técnico de Forge dentro de SocialWeb? Sin esto, el roadmap no arranca.

¿La extensión de VS Code se mantiene en su estado actual o se reescribe junto con v2? Hay que decidir antes de la Fase 1.

¿Forge debe soportar formalmente el stack PHP/Laravel desde v2, dado que es el stack de muchos clientes legacy de SocialWeb? Hoy hay un profile pero los hooks están pensados para Node.

¿Cómo se documenta la migración de un proyecto que ya usa Forge v1 a v2? ¿Es automática o requiere intervención manual?

¿Forge v2 debe tener un modo "consultoría externa" que asume que el equipo va a entregar el proyecto a un cliente, con consideraciones específicas de handoff?

Estas preguntas se resuelven en la primera reunión de equipo sobre Forge v2.

---

## 14. Cierre

Forge v2 toma lo que tres proyectos reales de SocialWeb (proyecto-alpha en greenfield, proyecto-beta en producción) y un proyecto externo destacado (Harness de Chachamaru) demostraron que funciona. No inventa.

Lo más valioso de este plan no es la arquitectura nueva. Es haber identificado que **la sesión es la unidad de trabajo correcta**, no el comando ni la skill ni el agente. Una vez que se acepta esa observación, todo lo demás se ordena.

El siguiente paso concreto es la conversación con el equipo para designar al líder técnico de Forge durante la ausencia de Cris. Sin eso, el roadmap es teórico.

---

**Documento mantenido por:** Por definir
**Última revisión:** Mayo 2026
**Próxima revisión:** Al cierre de Fase 0 (Junio 2026)
