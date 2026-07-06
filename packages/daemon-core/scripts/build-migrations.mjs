#!/usr/bin/env node
/**
 * Inlinea migrations/*.sql en src/db/migrations.generated.ts (SPEC-076 § 8).
 * El dominio no puede leer filesystem, así que el SQL viaja como constante.
 * Mismo patrón que packages/cli/scripts/build-assets.mjs. Corre en `prebuild`.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = join(__dirname, '..');
const MIGRATIONS_DIR = join(PKG, 'migrations');
const OUT = join(PKG, 'src', 'db', 'migrations.generated.ts');

const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}-.+\.sql$/.test(f)).sort();
if (files.length === 0) {
  console.error('build-migrations: no hay migrations/NNN-*.sql');
  process.exit(1);
}

const escape = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

let out = `/* GENERADO por scripts/build-migrations.mjs — NO EDITAR.
 * Fuente de verdad: migrations/*.sql (SPEC-076). */

export interface Migration {
  readonly id: number;
  readonly name: string;
  readonly sql: string;
}

export const MIGRATIONS: ReadonlyArray<Migration> = [
`;
for (const file of files) {
  const name = file.replace(/\.sql$/, '');
  const id = parseInt(name.slice(0, 3), 10);
  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
  out += `  {\n    id: ${id},\n    name: ${JSON.stringify(name)},\n    sql: \`${escape(sql)}\`,\n  },\n`;
}
out += '];\n';

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);
console.log(`build-migrations: ${files.length} migración(es) → src/db/migrations.generated.ts`);
