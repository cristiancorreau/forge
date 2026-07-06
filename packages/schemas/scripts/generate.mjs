#!/usr/bin/env node
/**
 * Genera artefactos deterministas desde los JSON Schema (fuente de verdad):
 *
 *   schemas/*.schema.json ──► src/types.gen.ts        (json-schema-to-typescript)
 *                         ──► src/validators.gen.mjs  (ajv standalone, ESM)
 *                         ──► src/validators.gen.d.mts
 *                         ──► src/schemas.gen.ts      (schemas crudos inlineados)
 *
 * SPEC-075. Ejecutar con `npm run generate`. Idempotente: correrlo dos veces
 * no produce diff.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { compile } from 'json-schema-to-typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = join(__dirname, '..');
const SCHEMAS_DIR = join(PKG, 'schemas');
const SRC = join(PKG, 'src');

const BANNER = '/* GENERADO por scripts/generate.mjs — NO EDITAR */';

/** Entidades en orden estable: nombre público → archivo de schema. */
const ENTITIES = [
  ['project', 'Project', 'project.schema.json'],
  ['harness', 'Harness', 'harness.schema.json'],
  ['team', 'Team', 'team.schema.json'],
  ['teamRole', 'TeamRole', 'team-role.schema.json'],
  ['task', 'Task', 'task.schema.json'],
  ['session', 'Session', 'session.schema.json'],
  ['approval', 'Approval', 'approval.schema.json'],
  ['event', 'Event', 'event.schema.json'],
];

const readSchema = (file) => JSON.parse(readFileSync(join(SCHEMAS_DIR, file), 'utf-8'));

const common = readSchema('common.schema.json');
const raw = new Map(ENTITIES.map(([key, , file]) => [key, readSchema(file)]));

// ---------------------------------------------------------------------------
// 1) src/types.gen.ts — json-schema-to-typescript sobre schemas dereferenciados
//    (los $ref a forge://schemas/v4/common#/$defs/* se inlinean para que el
//    generador no necesite un resolver de URIs forge://).
// ---------------------------------------------------------------------------
const COMMON_REF_PREFIX = 'forge://schemas/v4/common#/$defs/';

function deref(node) {
  if (Array.isArray(node)) return node.map(deref);
  if (node && typeof node === 'object') {
    if (typeof node.$ref === 'string' && node.$ref.startsWith(COMMON_REF_PREFIX)) {
      const defName = node.$ref.slice(COMMON_REF_PREFIX.length);
      const def = common.$defs[defName];
      if (!def) throw new Error(`$def desconocido en common.schema.json: ${defName}`);
      return structuredClone(def);
    }
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, deref(v)]));
  }
  return node;
}

let typesOut = `${BANNER}\n/* eslint-disable */\n\n`;
for (const [key, typeName] of ENTITIES) {
  const schema = deref(structuredClone(raw.get(key)));
  delete schema.$id; // evita que j2ts derive nombres del $id
  const ts = await compile(schema, typeName, {
    bannerComment: '',
    additionalProperties: false,
    format: true,
  });
  typesOut += ts.trim() + '\n\n';
}
typesOut += `// Union types de enums, derivados de las entidades (única fuente: schemas/)
export type TaskStatus = Task['status'];
export type SessionStatus = Session['status'];
export type HarnessStatus = Harness['status'];
export type ApprovalKind = Approval['kind'];
export type ApprovalResolution = NonNullable<Approval['resolution']>;
export type EventEntity = Event['entity'];
`;
writeFileSync(join(SRC, 'types.gen.ts'), typesOut);

// ---------------------------------------------------------------------------
// 2) src/validators.gen.mjs — ajv standalone (precompilado, ESM). Ningún
//    consumidor compila schemas en runtime.
// ---------------------------------------------------------------------------
const ajv = new Ajv({ code: { source: true, esm: true }, schemas: [common] });
addFormats(ajv);

const exportsMap = {};
for (const [, typeName, file] of ENTITIES) {
  const schema = readSchema(file);
  ajv.addSchema(schema);
  exportsMap[`validate${typeName}`] = schema.$id;
}
let validatorsCode = standaloneCode.default
  ? standaloneCode.default(ajv, exportsMap)
  : standaloneCode(ajv, exportsMap);

// ajv standalone emite require() para sus helpers de runtime incluso en modo
// ESM. Se hoistean como imports ESM (determinista: orden de aparición).
const requireSpecs = [...new Set(
  [...validatorsCode.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]),
)];
let imports = '';
requireSpecs.forEach((spec, i) => {
  const alias = `__ajvRuntime${i}`;
  // ajv/ajv-formats son CJS sin mapa "exports": el subpath ESM exige extensión .js
  const esmSpec = spec.endsWith('.js') ? spec : `${spec}.js`;
  imports += `import ${alias} from "${esmSpec}";\n`;
  validatorsCode = validatorsCode.replaceAll(`require("${spec}")`, alias);
});
writeFileSync(join(SRC, 'validators.gen.mjs'), `${BANNER}\n${imports}${validatorsCode}\n`);

// Declaraciones de tipos para el módulo standalone.
let dts = `${BANNER}

export interface ValidationError {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  params: Record<string, unknown>;
  message?: string;
}

export interface ValidateFn {
  (data: unknown): boolean;
  errors?: ValidationError[] | null;
}

`;
for (const [, typeName] of ENTITIES) {
  dts += `export declare const validate${typeName}: ValidateFn;\n`;
}
writeFileSync(join(SRC, 'validators.gen.d.mts'), dts);

// ---------------------------------------------------------------------------
// 3) src/schemas.gen.ts — schemas crudos inlineados (sin I/O en runtime, apto
//    para consumo desde daemon-core sin node:fs).
// ---------------------------------------------------------------------------
let schemasOut = `${BANNER}\n\n`;
schemasOut += `export const COMMON_SCHEMA = ${JSON.stringify(common, null, 2)} as const;\n\n`;
schemasOut += 'export const SCHEMAS = {\n';
for (const [key, , file] of ENTITIES) {
  schemasOut += `  ${key}: ${JSON.stringify(readSchema(file), null, 2).replace(/\n/g, '\n  ')},\n`;
}
schemasOut += '} as const;\n';
writeFileSync(join(SRC, 'schemas.gen.ts'), schemasOut);

console.log('generate: src/types.gen.ts, src/validators.gen.mjs, src/validators.gen.d.mts, src/schemas.gen.ts');
