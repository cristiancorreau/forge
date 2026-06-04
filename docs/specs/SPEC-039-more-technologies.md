# SPEC-039 Más tecnologías: FastAPI/Flask, Spring Boot, Flutter, React Native, Rust

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-04 | Actualizada: 2026-06-04

## Contexto

forge reconoce hoy un set acotado de stacks (TypeScript/Hono/Express/NestJS/Fastify,
Python/Django, Ruby/Rails, Go, PHP/Laravel) en tres dimensiones: backend, frontend y
fullstack. Una parte importante de los proyectos reales que un equipo querría adoptar
con `forge adopt` quedan fuera de la detección y del wizard:

- **Backends** muy comunes que no se detectan: FastAPI y Flask (Python), Spring Boot
  (Java/Kotlin), y los frameworks web de Rust (Axum, Actix-web, Rocket).
- Una dimensión entera ausente: **mobile** (Flutter en Dart, React Native/Expo en
  TypeScript/JS).
- Lenguajes nuevos sin soporte: **java, kotlin, dart, rust**.

Si no lo hacemos, `forge adopt`/`forge init` clasifican mal o no clasifican estos
proyectos, el wizard no ofrece sus frameworks, y la wiki generada no documenta sus
tecnologías. El objetivo es ampliar la **detección**, el **wizard** y el **schema +
generadores** de forma ADITIVA y BACKWARD-COMPATIBLE.

## Decisión

### A. Detección (`lib/detect.ts`)

Se agregan marcadores best-effort (nunca lanzan):

- **Python**: FastAPI (`fastapi` en `requirements.txt`/`pyproject.toml`), Flask
  (`flask`), Django (`manage.py`, ya existente).
- **Spring Boot**: `pom.xml` o `build.gradle`/`build.gradle.kts` que contengan
  `spring-boot`. Lenguaje `java` (`.java`/`pom.xml`) o `kotlin` (`.kt`/`*.gradle.kts`/
  plugin `kotlin`). Framework `springboot`, tipo backend.
- **Rust**: `Cargo.toml`. Lenguaje `rust`. Framework según deps: `axum`/`actix`/
  `rocket` (o null). Tipo backend.
- **Flutter**: `pubspec.yaml` con sección/dependencia `flutter:`. Lenguaje `dart`,
  framework `flutter`, tipo mobile.
- **React Native / Expo**: dependencia `react-native` (o `expo`) en `package.json`.
  Lenguaje typescript/javascript, framework `react-native` (o `expo`), tipo mobile.

`DetectedStack` agrega `mobile` + `mobileLanguage`. El `projectType` se infiere a
partir de los lados detectados (se agrega `mobile`); un repo con backend + app mobile
puede setear varios campos del stack — el `type` es la pista primaria.

### B. Wizard (`lib/wizard-flow.ts` + `lib/wizard.ts` + `tui/wizard.ts`)

- `project.type` ahora incluye **mobile** (además de frontend · backend · fullstack).
- Backend por lenguaje:
  - TypeScript → hono, express, nestjs, fastify
  - Python → fastapi, flask, django
  - Java → springboot · Kotlin → springboot
  - Rust → axum, actix, rocket
  - Ruby → rails · Go → go-gin · PHP → laravel
- Mobile por lenguaje: Dart → flutter · TypeScript → react-native, expo.
- Ambos wizards (OpenTUI y clack) leen los MISMOS mapas/helpers de `wizard-flow.ts`.
- DB/ORM se preguntan solo cuando hay backend.
- Siempre se mantiene el escape "Ninguno / otro".

### C. Schema + tipos (aditivo, backward-compatible)

- `core/schemas/project.schema.json`:
  - `project.language` enum + `java`, `kotlin`, `dart`, `rust`.
  - `project.type` enum + `mobile`.
  - `stack.mobile` + `stack.mobile_language` (opcionales).
  - `stack.backend`/`frontend` enums extendidos con los nuevos frameworks.
  - `backend_language`/`frontend_language`/`mobile_language` aceptan los nuevos lenguajes.
  - Sin campos requeridos nuevos. Los `project.yaml` viejos siguen validando.
- `lib/yaml.ts`: `ProjectStack` agrega `mobile`, `mobile_language`. `WizardResult`
  agrega `mobileLanguage`, `mobile`. `deriveProjectLanguage` maneja mobile y
  multi-lado (mixed cuando los lenguajes difieren).

### D. Generadores

- Mapa lenguaje → dev commands extendido: rust→cargo, java→maven/gradle,
  kotlin→gradle, dart→flutter.
- `stackWithLanguage()` renderiza "Spring Boot (Java)", "Flutter (Dart)",
  "Axum (Rust)", "React Native (TypeScript)". Degrada para archivos viejos.
- CLAUDE.md/AGENTS.md incluyen la línea de mobile cuando existe.

### E. adopt / wiki-autogen

- `project-analysis` reconoce los ecosistemas nuevos (java/gradle/maven, rust, dart).
- `wiki-autogen` produce páginas de entidad para springboot, flutter, react-native,
  fastapi, flask, axum/actix/rocket, y renderiza los lenguajes nuevos en
  `concepts/stack.md`.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Agregar Tier-2 PROFILES/agents para cada stack ahora | soporte completo | esfuerzo grande, fuera de scope | Se hace en un esfuerzo separado; este spec cubre detección + wizard + schema |
| Reusar `backend` para mobile | sin nueva dimensión | semánticamente incorrecto (mobile no es backend ni frontend) | Se agrega dimensión `mobile` explícita |
| Parsear pom.xml/Cargo.toml con librerías | más preciso | dependencias nuevas, puede lanzar | Heurística de substring best-effort, nunca lanza |

## Criterios de aceptación

- [ ] `forge adopt --yes` sobre fixtures de FastAPI, Flask, Spring Boot (pom + gradle),
      Rust+Axum, Flutter y React Native detecta el lenguaje/framework/type correcto.
- [ ] El `project.yaml` generado para cada uno valida contra el schema.
- [ ] Un `project.yaml` viejo (single language, sin campos nuevos) sigue validando.
- [ ] El wizard ofrece los frameworks correctos por lenguaje y el tipo `mobile`.
- [ ] La wiki generada tiene la página de entidad del framework detectado y la lint pasa.
- [ ] `cd packages/cli && npm run build:all && npm test` queda verde.

## Impacto de compliance

- No aplica.

## Dependencias

- Construye sobre SPEC-037 (wizard project type + per-side language) y SPEC-038
  (comando adopt). No bloqueada por otras specs.

## Notas de implementación

- La detección es heurística (substring en manifests); puede dar falsos negativos en
  layouts no convencionales. Nunca lanza.
- NO se incluyen PROFILES/agents Tier-2 ni dev-commands afinadas por framework para
  estos stacks — eso es un esfuerzo separado.
- `frontend_language` se mantiene como estaba; los lenguajes nuevos aplican a backend
  (java/kotlin/rust) y mobile (dart). El enum se amplía de forma uniforme para no
  introducir asimetrías en el schema.
