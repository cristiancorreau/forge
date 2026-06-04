# session-start

Inicializa una sesión de trabajo: detecta el estado del repo, identifica el
escenario (rama activa, main con PRs, main limpio) y enruta según corresponda.

La lógica vive en el skill central `core/skills/session-start/SKILL.md`.
Seguí esos pasos al pie de la letra: leer estado del repo, leer `project.yaml`,
evaluar el escenario A/B/C y enunciar las reglas de sesión una sola vez.
