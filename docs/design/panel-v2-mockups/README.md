# forge panel v2 — mockups

Mockups de referencia para **SPEC-059** (`forge panel` cockpit). Estética ember,
banner ASCII real. Fuente SVG + render PNG (2×).

| Imagen | Pantalla | Interacción |
|--------|----------|-------------|
| `1-home.png` | Home contextual | Detecta el estado del proyecto y destaca la siguiente acción + acciones rápidas con atajos. |
| `2-palette.png` | Command palette `:` | Fuzzy launcher para correr cualquier comando (`rec` → recommend/eval/mcp/migrate). |
| `3-runner.png` | Runner / log pane | Comando con output; los que escriben corren dry-run → `[Enter] aplicar`. |
| `4-list-actions.png` | Lista con filtro `/` + acciones | `i` install, `e` eval, `u` uninstall (confirm); filtro como modo explícito. |
| `5-help.png` | Overlay de atajos `?` | Cheatsheet; footer y overlay leen el mismo KEYMAP. |

Generación: los SVG se rasterizan con Chrome headless
(`--screenshot --force-device-scale-factor=2`).
