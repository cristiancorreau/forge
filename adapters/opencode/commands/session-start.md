---
name: session-start
description: Inicializa una sesión de trabajo siguiendo el skill central de forge.
---

Inicializa la sesión de trabajo siguiendo el skill central `core/skills/session-start/SKILL.md`.

Ejecuta sus 4 pasos en orden: (1) leer estado del repo, (2) leer `project.yaml`
(en OpenCode, leer también `AGENTS.md` para contexto), (3) evaluar el escenario
A/B/C y enrutar, (4) enunciar las reglas de sesión una sola vez. Recordá la regla
extra de OpenCode: implementar en serie — OpenCode no soporta subagentes paralelos.
