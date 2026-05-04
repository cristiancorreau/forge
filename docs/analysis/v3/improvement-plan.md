# Plan de mejora — forge v2.0
> Generado a partir del análisis crítico independiente (2026-05-03)

---

## Issues identificados

### P0 — Seguridad / Correctitud

| ID | Archivo | Problema |
|----|---------|---------|
| ISS-001 | `scripts/forge-wizard.py` | `build_yaml()` construye YAML con f-strings sin sanitizar. Comillas dobles en el nombre del proyecto generan YAML inválido. Sin validación post-generación. |

### P1 — Funcionalidad rota o incompleta

| ID | Archivo | Problema |
|----|---------|---------|
| ISS-002 | `scripts/forge-teardown.py` | Detecta el submodule pero imprime instrucciones manuales en lugar de ejecutar los comandos git. El flag `--confirm` no hace el teardown completo de git. |
| ISS-003 | `scripts/forge-init.py` | Cuando Tier 2 sobreescribe Tier 1 por colisión de nombres, no hay advertencia. El usuario no sabe qué agente "ganó". |
| ISS-004 | `forge.py` | CLI requiere TTY interactivo. Sin modo `--batch` para CI. Los scripts individuales no están documentados como alternativa. |

### P2 — Cobertura de profiles insuficiente

| ID | Stack | Justificación |
|----|-------|--------------|
| ISS-005 | Django | Framework Python más usado en producción. Solo FastAPI está cubierto. |
| ISS-006 | Vue / Nuxt | El wizard lo ofrece como opción de frontend pero no hay profile. |
| ISS-007 | Go (Gin/Echo) | Stack backend muy común en startups y microservicios. |
| ISS-008 | SvelteKit | Alternativa emergente a Next.js con crecimiento significativo. |

### P3 — Calidad y robustez

| ID | Archivo | Problema |
|----|---------|---------|
| ISS-009 | `scripts/token-stats.py` | Precios de modelos hardcodeados sin aviso de posible desactualización. |
| ISS-010 | `scripts/forge-audit.py` | Similitud basada en `SequenceMatcher.ratio()` genera falsos positivos cuando el contenido fue reescrito con mejor redacción. Falta nota explicativa al usuario. |
| ISS-011 | `forge.py` | Terminal con < 56 columnas corrompe el header. Sin detección de ancho mínimo. |

### P4 — Mantenibilidad y documentación

| ID | Archivo | Problema |
|----|---------|---------|
| ISS-012 | `docs/` | Sin CONTRIBUTING.md ni guía de gobernanza. |
| ISS-013 | `docs/agent-standard.md` | Sin versioning semántico del estándar. Cambios breaking no tienen mecanismo de migración. |

---

## Plan de implementación

### Sprint A — Correcciones críticas (P0 + P1)

**Agente 1 — fix-yaml-security** → ISS-001
- Sanitizar inputs en `build_yaml()`: escapar comillas dobles, caracteres especiales YAML
- Agregar validación YAML post-generación con `yaml.safe_load()`
- Tests: agregar casos con comillas, dos puntos, caracteres especiales

**Agente 2 — fix-teardown** → ISS-002
- Ejecutar los tres comandos git en `--confirm`: `git rm --cached`, `rm -rf`, `git config --remove-section`
- Mantener `--dry-run` que muestra lo que haría
- Actualizar tests de teardown

**Agente 3 — fix-tier-warnings + audit-notes** → ISS-003 + ISS-010
- Emitir warning cuando Tier 2 sobreescribe Tier 1 con mismo nombre
- En forge-audit: agregar nota explicativa cuando similitud < 0.80 ("puede ser reescritura intencional")
- Registrar qué agentes se omitieron por colisión

### Sprint B — Nuevos profiles (P2)

**Agente 4 — profile-django-vue** → ISS-005 + ISS-006
- Profile `django`: agente `api-engineer` (Django 4.x + DRF + PostgreSQL + pytest)
- Profile `vuenuxt`: agente `frontend-engineer` (Nuxt 3 + TypeScript + Pinia + Vitest)
- Agregar ambos al CATALOG de `aitmpl-search.py`

**Agente 5 — profile-go-svelte** → ISS-007 + ISS-008
- Profile `go-gin`: agente `api-engineer` (Go + Gin/Echo + sqlc/GORM + testify)
- Profile `sveltekit`: agente `frontend-engineer` (SvelteKit + TypeScript + Tailwind + Vitest)
- Agregar ambos al CATALOG de `aitmpl-search.py`

---

## Criterios de éxito

- Los 290 tests existentes siguen pasando
- Cada nuevo profile tiene al menos 3 tests en `tests/test_profiles.py` (si existe) o en un archivo nuevo
- Los fixes de P0/P1 están cubiertos por tests
- `python3 -m pytest tests/ -q` pasa sin errores tras todos los cambios
