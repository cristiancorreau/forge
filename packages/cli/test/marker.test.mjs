// Issue #109 — North Star marker in generated project.yaml.
// Imports the compiled dist modules — build first (npm run build:all).
//
//     node --test test/marker.test.mjs

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

let marker, init;
before(async () => {
  assert.ok(existsSync(join(DIST, 'lib', 'marker.js')), 'dist not built — run npm run build:all');
  marker = await import(pathToFileURL(join(DIST, 'lib', 'marker.js')).href);
  init = await import(pathToFileURL(join(DIST, 'commands', 'init.js')).href);
});

describe('North Star marker (#109)', () => {
  test('forgeMarker is the deterministic, unique prefix + version', () => {
    assert.ok(marker.forgeMarker().startsWith(marker.FORGE_MARKER_PREFIX));
    assert.match(marker.forgeMarker(), /^# generated-by: forge v\d+\.\d+\.\d+/);
  });

  test('withForgeMarker is idempotent (never stacks)', () => {
    const once = marker.withForgeMarker('project:\n  name: "x"\n');
    const twice = marker.withForgeMarker(once);
    assert.equal(once, twice);
    assert.equal((once.match(/generated-by: forge/g) || []).length, 1);
  });

  test('buildProjectYaml stamps the marker as the first line and still parses', () => {
    const yaml = init.buildProjectYaml(
      {
        name: 'Demo', slug: 'demo', description: 'd', language: 'typescript',
        type: 'backend', mode: 'standard', backend: 'hono', backendLanguage: 'typescript',
        frontend: null, frontendLanguage: null, mobile: null, mobileLanguage: null,
        database: null, orm: null, packageManager: 'npm', testing: [], profiles: [],
      },
      [],
    );
    assert.ok(yaml.split('\n')[0].startsWith('# generated-by: forge'), 'marker is the first line');
    const parsed = YAML.load(yaml);
    assert.equal(parsed.project.name, 'Demo', 'the YAML still parses (marker is a comment)');
  });
});
