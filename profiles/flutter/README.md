# Profile: flutter

App móvil multiplataforma construida con Flutter 3 + Dart 3, state management con Riverpod (o Bloc), navegación con `go_router`, modelos con `freezed` y tests con `flutter test`. Ideal para proyectos que necesitan una sola base de código para iOS y Android con tipado estricto y un tooling de análisis maduro.

## Agentes incluidos

- **mobile-engineer** — construye features con arquitectura feature-first: widgets componibles, providers/blocs, repositorios, modelos `freezed`, rutas `go_router` y widget/unit tests.

## Cuándo usar este profile

- El stack móvil es Flutter 3 + Dart 3 (`pubspec.yaml` con sección `flutter:`).
- El state management es Riverpod o Bloc/Cubit.
- La navegación usa `go_router`.
- Las dependencias se gestionan con `pub`.
- Los tests usan `flutter test` y el lint es `flutter analyze`.

## Hooks específicos del stack

| Hook | Evento | Descripción |
|---|---|---|
| `pre-edit-check.js` | PreToolUse/Edit\|Write | Detecta `print()`/`debugPrint()` de depuración en `.dart`; bloquea secrets hardcodeados; protege `main` |
| `post-turn-check.sh` | Stop | Corre `flutter analyze`; cualquier warning bloquea el turno |

Ver `core/hooks/hooks-registry.yaml` para la lista completa.

## Activar en project.yaml

```yaml
profiles:
  active:
    - flutter
```
