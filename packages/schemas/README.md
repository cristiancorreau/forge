# @cristiancorreau/forge-schemas

Contratos neutrales del dominio FORGE v4 (SPEC-075): `Project`, `Harness`,
`Team`, `TeamRole`, `Task`, `Session`, `Approval`, `Event`.

- **Fuente de verdad**: `schemas/*.schema.json` (JSON Schema draft-07, a mano).
- **Generados** (no editar): `src/types.gen.ts`, `src/validators.gen.mjs`,
  `src/validators.gen.d.mts`, `src/schemas.gen.ts` — regenerar con
  `npm run generate`.
- **Validadores**: precompilados con ajv standalone; ningún consumidor compila
  schemas en runtime. JS puro sin I/O — apto para `daemon-core` (SPEC-076).

## Uso

```ts
import { parseTask, validateTask, TASK_STATUSES, SCHEMAS } from '@cristiancorreau/forge-schemas';
```

## Nota: dos "project schema"

`core/schemas/project.schema.json` (raíz del repo) describe el archivo de
configuración `project.yaml` v2 de cada proyecto. El `schemas/project.schema.json`
de este paquete describe la **entidad `Project` del registro del daemon v4**
(`$id: forge://schemas/v4/project`). Son contratos distintos.

## Scripts

- `npm run generate` — regenera tipos, validadores y schemas inlineados (determinista).
- `npm run build` — `tsc` + copia de artefactos `.mjs`/`.d.mts` a `dist/`.
- `npm test` — `node --test test/*.test.mjs` (requiere `generate` + `build` previos).
