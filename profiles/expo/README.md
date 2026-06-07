# Profile: expo

Perfil para apps móviles construidas con Expo SDK. Cubre iOS y Android con TypeScript estricto, storage seguro nativo y arquitectura offline-first.

## Agentes incluidos

- **mobile-engineer** — Construye la app o SDK móvil del proyecto. Implementa con hooks React, `expo-secure-store`, networking nativo y tests con `react-native-testing-library`. Scope: directorio móvil definido en `CLAUDE.md` (típicamente `packages/mobile/` o `apps/mobile/`).

## Cuándo usar este profile

Activar cuando el proyecto incluye una app móvil con Expo SDK. Compatible con monorepos que tengan otros profiles activos simultáneamente (por ejemplo, `nextjs-admin` para el panel web).

## Hooks específicos del stack

- **`pre-edit-check.py`**: detecta debug statements (`console.log`, `debugger`) en archivos `.ts` y `.tsx` antes de cada edición.
- **`post-turn-check.js`**: corre `tsc --noEmit` al terminar cada turno para verificar TypeScript estricto (`strict: true`). Cualquier error de tipos bloquea el reporte al orchestrator.

## Activar en project.yaml

```yaml
profiles:
  active:
    - expo
```
