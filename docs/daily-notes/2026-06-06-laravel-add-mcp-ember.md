# Session 2026-06-06 — laravel-add-mcp-ember

## Completado

Sesión larga, multi-feature, cerrada con 3 releases (v3.1.0 → v3.2.1).

- **Follow-ups post-migración TS (#81 → v3.1.0):** enum de profiles dinámico en `forge validate` (+ laravel/wordpress), detección de debug Java/Kotlin/Rust/Dart en `pre-edit-check.js`, comando `forge update`, automatización `publish-vscode.yml`, checklist de validación Windows.
- **README + landing:** rediseño llamativo (#83), landing en GitHub Pages, español rioplatense → neutro (#84), logo = banner FORGE block-art en SVG con glow ember (#92-94), imágenes por URL absoluta de raw.
- **Ecosistema Laravel 13 (#85, SPEC-044):** 5 skills (`laravel-eloquent/pest/security/verify/mcp`) + 2 agentes Tier 2 (`laravel-specialist`, `laravel-test-engineer`).
- **Resiliencia de versiones (RFC-002, #86-88):** guard anti-staleness real (era no-op; 12 frameworks + scope a skills/commands), purga de 74 literales de versión, directiva operativa de detección a tiempo-de-uso en 24/25 profile agents.
- **`forge add` seguro (#89, SPEC-045):** pipeline de seguridad en capas (higiene Unicode, scan de riesgo offline, degradación en banda, capability-scoping) + provenance; red opt-in solo en este comando.
- **Refuerzo del Guardrail (#90, SPEC-046):** bloqueo incondicional de exfiltración/ofuscación/reverse-shell en `pre-bash-check.js`; warn de escalada en settings.json.
- **`forge mcp` recortado (#91, SPEC-047/RFC-003):** servidor MCP stdio-only opt-in con 2 tools dinámicos (`guardrail_status`, `wiki_search`); SDK lazy, no dependencia.
- **Paleta ember del CLI (#95, SPEC-048):** `ui/theme.ts` compartido; banner/header/TUI en ember sobre near-black, unificado con el landing.
- **Fix panel (#97):** quitado el buscador en vivo de la sección Skills (robaba foco / rompía navegación).
- **Releases:** v3.1.0 (#82), v3.2.0 (#96), v3.2.1 (#98) publicados a npm.

## Archivos modificados

Áreas: `packages/cli/src/{commands,lib,ui,tui}/`, `core/skills/laravel-*`, `profiles/*/agents/`, `core/hooks/`, `adapters/claude-code/commands/`, `packages/cli/test/`, `docs/{specs,proposals}/`, `README.md`, `CHANGELOG.md`, `manifest.json`, `docs/assets/`.

## Commits

```
e0a9df9 chore(release): v3.2.1 (#98)
45abcae fix(panel): quitar el buscador en vivo de la sección Skills (#97)
5aba23d chore(release): v3.2.0 (#96)
be69549 feat(cli): paleta ember — el terminal matchea el landing (SPEC-048) (#95)
174065b docs(readme): logo = banner FORGE (block-art) en SVG con glow ember (#94)
2efc50c feat(cli): forge mcp — servidor MCP recortado, opt-in (SPEC-047 / RFC-003) (#91)
891be45 feat(hooks): reforzar la capa Guardrail — backstop de seguridad (SPEC-046) (#90)
26f916d feat(cli): forge add seguro (SPEC-045) + RFC-003 forge mcp (#89)
ba5dabe feat(profiles): directiva de detección de versión en todos los Tier 2 (#88)
516a325 fix(assets): guard real anti-staleness de versiones + purga (#87)
76edeec docs(rfc): RFC-002 resiliencia de versiones a largo plazo (#86)
64f427a feat(laravel): skills + agentes Laravel 13 + RFC (SPEC-044) (#85)
240ba96 feat: fix follow-ups (#81)
```

## Decisiones tomadas

- **`forge add`: clasificar y consentir, no auto-sanitizar.** Detectar/borrar instrucciones maliciosas es indecidible y genera falsa confianza. La seguridad descansa en capability-scoping (limitar lo posible) + consentimiento informado + los guardrail hooks como backstop en runtime. La red es opt-in y vive solo en ese comando (preserva zero-network).
- **`forge mcp`: piso estático completo, MCP estrictamente aditivo.** Solo 2 tools dinámicos; nada del conocimiento vive solo en MCP (enforced por test de allowlist). SDK lazy y NO dependencia (cold-start de npx intacto). stdio-only en v1.
- **Resiliencia de versiones (RFC-002): el conocimiento de versión que forge autorea → ~0.** Detectar el número es el 20% fácil; saber qué es verdad para esa versión es el 80% que se pudre. Solución = convención + guard de CI + detección a tiempo-de-uso + ruteo a fuentes vivas. Se difiere la maquinaria en `generate`; se descarta el modelo de carpetas versionadas (O(frameworks×versiones×runtimes)).
- **README: imágenes por URL absoluta de raw** (data: URIs bloqueados por GitHub; relativas no andan en npm). Logo = banner FORGE en SVG.
- **Paleta ember centralizada** en `ui/theme.ts` para unificar CLI ↔ landing.

## Blockers para próxima sesión

- **#73** (publicar extensión VS Code 0.6.0 al Marketplace): necesita que el maintainer cargue el secret `VSCE_PAT`. Queda abierto.
- **#74** (validación visual OpenTUI en Windows real): requiere correr el checklist `docs/windows-validation.md` en una máquina Windows. Queda abierto.
- **Trabajo futuro de los RFC (no bloqueante):** `forge add` registro hosteado + ranking (v2); `forge mcp` transporte HTTP con auth (diferido); RFC-002 ruteo formal a fuentes vivas.
