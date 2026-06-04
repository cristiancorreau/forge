---
name: session-close
description: Cierra una sesión de trabajo con Codex CLI siguiendo el skill central de forge
usage: Copia el contenido de Prompt al final de tu sesión de Codex
---

## Prompt para Codex

Cierra la sesión de trabajo siguiendo el skill central `core/skills/session-close/SKILL.md`.

Ejecuta su pipeline de 8 pasos en orden: commit → changeset → GitHub Projects →
daily note → RELEASE-NOTES → commit de cierre → sync → PR. En el Paso 2, firma
el commit con `Co-Authored-By: Codex <noreply@openai.com>`.
