# Profile: wordpress

Perfil para proyectos WordPress. Incluye agentes especializados para desarrollo con las APIs modernas del core, Divi Theme Builder y Elementor Page Builder. Activar solo los agentes que aplican al page builder del proyecto.

## Agentes incluidos

- **wp-engineer** — Desarrollo WordPress moderno: Full Site Editing, bloques Gutenberg personalizados, `theme.json`, plugins con arquitectura OOP, WP REST API y WP-CLI. Scope: plugin o theme activo definido en `CLAUDE.md`.
- **divi-engineer** — Especialista en Divi Theme Builder (Elegant Themes). Módulos personalizados con `ET_Builder_Module`, Theme Builder templates, Divi Library, optimización de performance. Scope: child theme de Divi.
- **elementor-engineer** — Especialista en Elementor Free y Pro. Widgets personalizados, Theme Builder, Dynamic Tags, Loop Grid, Popup Builder y optimización de performance. Scope: child theme de Elementor.

## Cuándo usar este profile

Activar cuando el proyecto es un sitio o aplicación WordPress. Usar `wp-engineer` siempre. Agregar `divi-engineer` o `elementor-engineer` según el page builder activo en el proyecto — nunca ambos simultáneamente.

## Hooks específicos del stack

- **`pre-edit-check.py`**: detecta patrones de debug PHP (`var_dump()`, `print_r()`, `error_log()`) en archivos `.php` antes de cada edición. Estos patrones nunca deben llegar a producción.
- **`post-turn-check.sh`**: corre `composer test` (PHPUnit) y `./vendor/bin/phpcs --standard=WordPress` al terminar cada turno, si están configurados en el proyecto.

### Nota de seguridad

Los tres agentes de este profile tienen campo `last_verified` en su frontmatter. Dado que interactúan con APIs de terceros (Elegant Themes, Elementor Cloud, WooCommerce, ACF, pasarelas de pago), el **security-auditor** debe revisarlos periódicamente (frecuencia recomendada: trimestral).

## Activar en project.yaml

```yaml
profiles:
  active:
    - wordpress
```
