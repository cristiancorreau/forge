# Profile: astro

Perfil para proyectos construidos con Astro 4.x. Cubre sitios estáticos (SSG), apps con SSR parcial mediante adaptadores, y arquitectura de islands con React, Svelte, Vue o Lit.

## Agentes incluidos

- **frontend-engineer** — Implementa páginas, componentes `.astro`, Content Collections, islands de UI y configuración de adaptadores SSR. Scope: `src/` y `public/`.

## Cuándo usar este profile

Activar cuando el stack del proyecto es Astro, independientemente del adaptador de deploy (Vercel, Cloudflare, Node). No usar si el frontend usa Next.js, SvelteKit u otro framework con su propio profile.

## Hooks específicos del stack

- **`pre-edit-check.py`**: detecta debug statements (`console.log`, `debugger`) en archivos `.astro`, `.ts` y `.tsx` antes de cada edición.
- **`post-turn-check.js`**: verifica que `astro build` pase sin errores de TypeScript ni warnings al terminar cada turno.

## Activar en project.yaml

```yaml
profiles:
  active:
    - astro
```
