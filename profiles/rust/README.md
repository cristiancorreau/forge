# Profile: rust

API REST en Rust construida con Axum + Tokio + sqlx (o SeaORM), manejo de errores con `thiserror`/`anyhow`, validación con `validator` y serialización con `serde`. Cubre Axum como framework por defecto y menciona las variantes Actix-web y Rocket. Ideal para servicios que necesitan rendimiento, bajo consumo de memoria y seguridad de tipos en tiempo de compilación.

## Agentes incluidos

- **api-engineer** — implementa routers y handlers Axum, acceso a datos con `sqlx`/SeaORM, errores tipados con `IntoResponse`, migraciones y tests de integración con `cargo test`.

## Cuándo usar este profile

- El stack de backend es Rust con un framework web async: Axum (preferido), Actix-web o Rocket (`Cargo.toml`).
- El runtime async es Tokio.
- El acceso a datos es `sqlx` (queries verificadas en compile-time) o SeaORM.
- El manejo de errores combina `thiserror` (dominio) y `anyhow` (borde de la app).
- El tooling es `cargo` con `clippy` y `rustfmt`.

## Hooks específicos del stack

| Hook | Evento | Descripción |
|---|---|---|
| `pre-edit-check.js` | PreToolUse/Edit\|Write | Detecta `println!`/`dbg!` de depuración en `.rs`; bloquea secrets hardcodeados; protege `main` |
| `pre-bash-check.js` | PreToolUse/Bash | Bloquea `sqlx database drop`, `DROP TABLE` y comandos destructivos en contexto de producción |

Ver `core/hooks/hooks-registry.yaml` para la lista completa.

## Activar en project.yaml

```yaml
profiles:
  active:
    - rust
```
