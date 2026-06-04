# SPEC-040 Tier 2 profiles para stacks nuevos (Spring Boot, Flutter, Rust, Flask)

> Estado: APPROVED
> Responsable: forge-cli-engineer
> Creada: 2026-06-04 | Actualizada: 2026-06-04

## Contexto

SPEC-039 amplió la auto-detección de stacks: `detect.ts` ya reconoce Spring Boot
(`pom.xml`/`build.gradle[.kts]` con `spring-boot`), Flutter (`pubspec.yaml` con
sección `flutter:`), Rust web (Axum/Actix/Rocket en `Cargo.toml`) y Flask
(`requirements.txt`/`pyproject.toml` con `flask`). Pero forge **no tiene profiles
Tier 2** para esos stacks: cuando `forge adopt`/`forge init` los detecta, no activa
ningún agente especializado y el proyecto cae al `backend-engineer`/`mobile-engineer`
genérico de Tier 1.

FastAPI y Expo (React Native) ya tienen profile, así que no se tocan. Faltan cuatro
profiles para cerrar la cobertura de los stacks que ya se detectan.

Si no lo hacemos, los proyectos Spring Boot, Flutter, Rust y Flask reciben guía
genérica sin las convenciones, comandos y anti-patterns idiomáticos del stack, que es
precisamente lo que aporta un profile Tier 2.

## Decisión

Crear cuatro profiles Tier 2 nuevos, cada uno con `README.md` y un agente que sigue
`docs/agent-standard.md` (frontmatter completo + secciones del cuerpo):

| Profile | Agente | Stack |
|---|---|---|
| `springboot` | `api-engineer` | Spring Boot 3 + Spring Web + Spring Data JPA/Hibernate + Bean Validation + Maven/Gradle + JUnit 5 (Java/Kotlin) |
| `flutter` | `mobile-engineer` | Flutter 3 + Dart 3 + Riverpod (o Bloc) + go_router + pub + flutter test/analyze |
| `rust` | `api-engineer` | Axum + Tokio (variantes Actix/Rocket) + sqlx/SeaORM + anyhow/thiserror + cargo test/clippy/fmt |
| `flask` | `api-engineer` | Flask 3 + blueprints + SQLAlchemy + marshmallow/pydantic + pytest + ruff |

Wiring:

- **PROFILE_MAP** (en `commands/adopt.ts`, `lib/wizard.ts`, `tui/wizard.ts`): mapear
  `springboot → springboot`, `flutter → flutter`, `axum|actix|rocket → rust`,
  `flask → flask`. `react-native`/`expo` ya mapean a `expo`; no se tocan.
- **manifest.json**: agregar los 4 profiles al inventario `profiles` con su `stack` y
  `agents`.
- **docs/tiers.md** y **docs/agent-standard.md**: agregar los 4 profiles a las tablas
  de catálogo Tier 2.
- **README.md**: extender la mención de stacks Tier 2.
- **aitmpl-search.ts**: agregar las 4 entradas al catálogo curado de profiles.

El catálogo (`listCatalogAgents`) y el instalador (`installProfile`/`installCoreAgents`)
ya leen `profiles/<name>/agents/` del filesystem, así que no requieren cambios de código.

## Alternativas consideradas

| Opción | Pros | Contras | Descartada por |
|--------|------|---------|----------------|
| Un solo profile `rust` con 3 sub-agentes (axum/actix/rocket) | Cobertura por framework | Sobre-fragmenta; el rol es el mismo | El agente cubre Axum como default y menciona las variantes |
| Reusar el `backend-engineer` genérico de Tier 1 | Cero archivos nuevos | Pierde convenciones idiomáticas del stack | Es justo lo que un profile Tier 2 debe aportar |
| Mapear `axum`/`actix`/`rocket` a tres profiles separados | Granularidad | Triplica mantenimiento por un rol idéntico | Un profile `rust` con variantes es suficiente |

## Criterios de aceptación

- [ ] Existen `profiles/{springboot,flutter,rust,flask}/README.md` y su agente en `agents/`.
- [ ] Cada agente cumple `docs/agent-standard.md`: frontmatter (`name`, `description`, `model: sonnet`, `tools`, `tier: 2`, `profile`, `last_verified`) + secciones `## Stack`, `## Reglas`, `## No hagas`.
- [ ] PROFILE_MAP (en las 3 definiciones) mapea `springboot`, `flutter`, `axum`/`actix`/`rocket`, `flask` a sus profiles.
- [ ] `manifest.json` lista los 4 profiles.
- [ ] `docs/tiers.md`, `docs/agent-standard.md` y `README.md` mencionan los 4 profiles.
- [ ] `listCatalogAgents` reporta los nuevos agentes de profile.
- [ ] Los tests (`packages/cli/test/`) verifican frontmatter, secciones, PROFILE_MAP, manifest y catálogo de los 4 profiles.
- [ ] `forge adopt --yes` sobre fixtures Spring Boot / Rust+Axum / Flutter / Flask escribe `project.yaml` con el profile correspondiente en `agents.profiles` y `forge validate` pasa.
- [ ] `cd packages/cli && npm run build:all && npm test` queda verde.

## Impacto de compliance

- No aplica. Los profiles incorporan las reglas de seguridad estándar (auth + authz por
  endpoint, parámetros preparados, PII fuera de logs), consistentes con el resto de los
  agentes de backend, pero no introducen tratamiento de datos personales nuevo.

## Dependencias

- Requiere la detección de stacks de SPEC-039 (ya implementada en `lib/detect.ts`).

## Notas de implementación

- El profile `rust` cubre Axum como framework por defecto y menciona Actix/Rocket como
  variantes; los tres frameworks detectados (`axum`/`actix`/`rocket`) mapean al mismo profile.
- La guía de cada agente es best-practice idiomática; no se agregan hooks de guardrail
  específicos por stack en esta spec.
