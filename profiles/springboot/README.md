# Profile: springboot

API REST sobre la JVM construida con Spring Boot 3 + Spring Web + Spring Data JPA (Hibernate) + Bean Validation + Flyway/Liquibase, en Java o Kotlin. Ideal para proyectos enterprise que necesitan una API robusta con inyección de dependencias, transacciones declarativas y un ecosistema maduro de testing.

## Agentes incluidos

- **api-engineer** — implementa entidades `@Entity`, repositorios Spring Data JPA, services `@Transactional`, controllers `@RestController`, DTO con Bean Validation, migraciones Flyway y tests con JUnit 5 (`@WebMvcTest`, `@DataJpaTest`, Testcontainers).

## Cuándo usar este profile

- El stack de backend usa Spring Boot 3 (namespace `jakarta.*`).
- El lenguaje es Java 17+ o Kotlin.
- La persistencia es Spring Data JPA sobre Hibernate.
- Las migraciones se gestionan con Flyway o Liquibase (no `ddl-auto`).
- El build es Maven (`./mvnw`) o Gradle (`./gradlew`) con wrapper.
- Los tests usan JUnit 5 + Spring Boot Test.

## Hooks específicos del stack

| Hook | Evento | Descripción |
|---|---|---|
| `pre-edit-check.js` | PreToolUse/Edit\|Write | Detecta `System.out.println`/`printStackTrace` en `.java`/`.kt`; bloquea secrets hardcodeados; protege `main` |
| `pre-bash-check.js` | PreToolUse/Bash | Bloquea `flyway clean`, `DROP TABLE` y comandos destructivos en contexto de producción |

Ver `core/hooks/hooks-registry.yaml` para la lista completa.

## Activar en project.yaml

```yaml
profiles:
  active:
    - springboot
```
