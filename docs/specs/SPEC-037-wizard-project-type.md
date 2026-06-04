# SPEC-037 Wizard: tipo de proyecto + lenguaje/framework por lado

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-04 | Actualizada: 2026-06-04

## Contexto

El wizard de `forge init` asume que el frontend y el backend comparten **un solo
lenguaje** (`project.language`). En la práctica eso es falso: un stack común es
backend Python (FastAPI) + frontend TypeScript (Next.js). Hoy el wizard pregunta
un único "Lenguaje principal" y filtra los frameworks de backend Y frontend con
ese mismo lenguaje, por lo que un proyecto Python no puede elegir Next.js, y un
proyecto TypeScript no puede elegir FastAPI.

Además el wizard nunca pregunta el **tipo de proyecto** (solo frontend, solo
backend, o fullstack), así que siempre pregunta DB/ORM aunque el proyecto no
tenga backend.

Si no lo arreglamos, el `project.yaml` generado describe mal el stack real, los
generadores (CLAUDE.md/AGENTS.md) muestran un lenguaje incorrecto, y el usuario
debe editar el YAML a mano.

## Decisión

### Flujo del wizard (ambos: OpenTUI `tui/wizard.ts` y @clack `lib/wizard.ts`)

1. Nombre del proyecto
2. **Tipo de proyecto**: `frontend` · `backend` · `fullstack`
3. Si `backend|fullstack`: lenguaje backend → framework backend (lista filtrada
   por el lenguaje backend)
4. Si `frontend|fullstack`: lenguaje frontend → framework frontend (lista
   filtrada por el lenguaje frontend)
5. Database / ORM — **solo si hay backend**
6. Package manager → testing → mode → runtime → skills → confirm

### Maps lenguaje → framework

- Backend: TypeScript→[hono, express, nestjs, fastify], Python→[fastapi, django],
  Ruby→[rails], Go→[go-gin], PHP→[laravel].
- Frontend: TypeScript/JS→[nextjs, astro, sveltekit, nuxt] (+ "ninguno/otro").
- Cada selección de framework ofrece una salida "Ninguno / otro".
- `PROFILE_MAP` (framework→profile) se mantiene intacto, así que el lenguaje por
  lado no rompe el mapeo de profiles.

### Modelo de datos (BACKWARD-COMPATIBLE, aditivo)

- `project.type`: enum `frontend | backend | fullstack` (opcional; se infiere
  para archivos viejos).
- `stack.backend_language` y `stack.frontend_language` (strings opcionales).
- `stack.backend` / `stack.frontend` siguen siendo los strings de framework (sin
  cambios de forma).
- `project.language` se mantiene por compatibilidad y se deriva:
  - backend o fullstack con un solo lenguaje → ese lenguaje
  - frontend-only → lenguaje del frontend
  - fullstack con lenguajes distintos entre lados → `mixed`
- `core/schemas/project.schema.json` se extiende **aditivamente** (nuevos campos
  opcionales + el enum `type`); ningún campo nuevo es requerido.

### Wiring

- `yaml.ts`: extender `WizardResult` (`type`, `backendLanguage`,
  `frontendLanguage`) y `ProjectYaml.stack` (`backend_language`,
  `frontend_language`) + `project.type`.
- `init.ts buildProjectYaml()`: escribir `project.type`, los frameworks,
  los lenguajes por lado, y `project.language` derivado. No preguntar DB/ORM sin
  backend (ya garantizado por el flujo).
- Generadores y CLAUDE.md/AGENTS.md: cuando estén presentes, mostrar el lenguaje
  por lado (ej. "Backend: FastAPI (Python)" / "Frontend: Next.js (TypeScript)");
  fallback a `project.language` cuando los campos nuevos no existan (archivos
  viejos).
- `detect.ts`: best-effort — setear `backend_language`/`frontend_language` desde
  frameworks/archivos detectados; inferir `project.type`.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Romper `project.language` y reemplazarlo por dos campos | Modelo más limpio | Rompe todos los project.yaml existentes (incl. el del repo: `language: mixed`) | No es backward-compatible |
| Un único lenguaje + flag "frontend distinto" | Cambio mínimo | No generaliza, sigue forzando un lenguaje base | No resuelve el caso real |
| `project.type` + lenguaje por lado (esta spec) | Aditivo, expresa el stack real, deriva `project.language` | Más campos en el schema | — (elegida) |

## Criterios de aceptación

- [ ] El wizard pregunta tipo de proyecto justo después del nombre.
- [ ] Pregunta lenguaje y framework por lado, con el framework filtrado por el
      lenguaje de ese lado; solo pregunta los lados relevantes al tipo.
- [ ] DB/ORM solo se preguntan cuando hay backend.
- [ ] `buildProjectYaml` para los tres tipos produce el stack + lenguaje por lado
      + `project.language` derivado correctos y pasa `forge validate`.
- [ ] Caso fullstack Python-back + TS-front → `project.language: mixed`,
      `stack.backend_language: python`, `stack.frontend_language: typescript`.
- [ ] Un `project.yaml` viejo (un solo lenguaje, sin campos nuevos) sigue
      validando.
- [ ] El project.yaml del propio repo (`language: mixed`, stack nulos) sigue
      validando.
- [ ] `cd packages/cli && npm run build:all && npm test` en verde.

## Impacto de compliance

No aplica.

## Dependencias

- Ninguna. Construye sobre el wizard y el schema v2 existentes.

## Notas de implementación

- `detect.ts` es best-effort: para TypeScript se setean ambos lenguajes a
  `typescript`; para backends no-TS (Python/Ruby/Go/PHP) se setea
  `backend_language` desde el lenguaje detectado. La inferencia de `project.type`
  se basa en qué lados se detectaron.
- El flujo interactivo de OpenTUI se valida por lógica (helpers puros), no
  visualmente.
