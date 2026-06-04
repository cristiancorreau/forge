# session-close

Cierra la sesión de trabajo con un pipeline de 8 pasos: commit → changeset →
GitHub Projects → daily note → RELEASE-NOTES → commit de cierre → sync → PR.

La lógica vive en el skill central `core/skills/session-close/SKILL.md`.
Seguí esos 8 pasos en orden. En el Paso 2, firmá el commit con el
`Co-Authored-By` del runtime activo (Claude Code).
