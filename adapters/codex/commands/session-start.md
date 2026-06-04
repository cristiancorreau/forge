---
name: session-start
description: Inicia una sesión de trabajo con Codex CLI siguiendo el skill central de forge
usage: Copia el contenido de Prompt al inicio de tu sesión de Codex
---

## Prompt para Codex

Inicia la sesión de trabajo siguiendo el skill central `core/skills/session-start/SKILL.md`.

Ejecuta sus 4 pasos en orden: (1) leer estado del repo, (2) leer `project.yaml`
(en Codex, leer también `AGENTS.md` para contexto), (3) evaluar el escenario
A/B/C y enrutar, (4) enunciar las reglas de sesión una sola vez. Si `gh` no está
disponible, omite los pasos que lo requieren y avisa.
