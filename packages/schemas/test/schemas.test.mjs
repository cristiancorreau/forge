// Tests del paquete schemas (SPEC-075) — node --test test/schemas.test.mjs
//
// Requiere `npm run generate && npm run build` previos (dist/ presente).
// Corre sin tmux ni SQLite instalados (Fase 0 de SPEC-074).

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = join(__dirname, '..');
const SCHEMAS_DIR = join(PKG, 'schemas');

before(() => {
  assert.ok(
    existsSync(join(PKG, 'dist', 'index.js')),
    'dist/index.js no existe. Corre "npm run generate && npm run build" primero.'
  );
});

const api = await import('../dist/index.js');
const {
  validateProject, validateHarness, validateTeam, validateTeamRole,
  validateTask, validateSession, validateApproval, validateEvent,
  parseTask, SchemaValidationError, SCHEMAS, TASK_STATUSES,
} = api;

const TASK_STATUS_LIST = [
  'backlog', 'queued', 'running', 'needs_input', 'review', 'done', 'failed', 'orphaned',
];

const NOW = '2026-07-05T12:00:00.000Z';
const ID = {
  project: 'prj_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  harness: 'hrn_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  team: 'tm_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  role: 'rol_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  task: 'tsk_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  session: 'ses_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  approval: 'apr_01ARZ3NDEKTSV4RRFFQ69G5FAV',
};

const FIXTURES = {
  project: {
    valid: { id: ID.project, name: 'demo', path: '/tmp/demo', createdAt: NOW },
    validate: validateProject,
  },
  harness: {
    valid: {
      id: ID.harness, runtime: 'claude-code', label: 'main',
      homeDir: '/home/forge/h1', priority: 0, status: 'active', createdAt: NOW,
    },
    validate: validateHarness,
  },
  team: {
    valid: { id: ID.team, name: 'core-team' },
    validate: validateTeam,
  },
  teamRole: {
    valid: {
      id: ID.role, teamId: ID.team, roleName: 'dev',
      tierPermissions: { allow: ['Read', 'Edit'], deny: ['Bash'] },
    },
    validate: validateTeamRole,
  },
  task: {
    valid: {
      id: ID.task, projectId: ID.project, title: 'do the thing',
      status: 'backlog', createdAt: NOW, updatedAt: NOW,
    },
    validate: validateTask,
  },
  session: {
    valid: {
      id: ID.session, taskId: ID.task, harnessId: ID.harness,
      status: 'running', startedAt: NOW, tokensIn: 0, tokensOut: 0,
    },
    validate: validateSession,
  },
  approval: {
    valid: { id: ID.approval, sessionId: ID.session, kind: 'tool_use', payload: { tool: 'Bash' } },
    validate: validateApproval,
  },
  event: {
    valid: { id: 1, ts: NOW, kind: 'task.created', entity: 'task', entityId: ID.task },
    validate: validateEvent,
  },
};

describe('convenciones de schema (Decisión 3 de SPEC-075)', () => {
  test('hay exactamente 9 archivos *.schema.json con los nombres exactos', () => {
    const files = readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith('.schema.json')).sort();
    assert.deepEqual(files, [
      'approval.schema.json', 'common.schema.json', 'event.schema.json',
      'harness.schema.json', 'project.schema.json', 'session.schema.json',
      'task.schema.json', 'team-role.schema.json', 'team.schema.json',
    ]);
  });

  test('cada schema declara draft-07, $id forge://schemas/v4/ y additionalProperties: false en la raíz de entidad', () => {
    for (const file of readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith('.schema.json'))) {
      const schema = JSON.parse(readFileSync(join(SCHEMAS_DIR, file), 'utf-8'));
      assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#', `${file}: $schema`);
      assert.ok(schema.$id.startsWith('forge://schemas/v4/'), `${file}: $id = ${schema.$id}`);
      if (file !== 'common.schema.json') {
        assert.equal(schema.additionalProperties, false, `${file}: additionalProperties`);
        assert.equal(schema.type, 'object', `${file}: type`);
      }
    }
  });

  test('el enum de Task.status es exacto y TASK_STATUSES exporta la misma lista', () => {
    const schema = JSON.parse(readFileSync(join(SCHEMAS_DIR, 'task.schema.json'), 'utf-8'));
    assert.deepEqual(schema.properties.status.enum, TASK_STATUS_LIST);
    assert.deepEqual([...TASK_STATUSES], TASK_STATUS_LIST);
  });
});

describe('validadores — fixtures válidos por entidad', () => {
  for (const [entity, { valid, validate }] of Object.entries(FIXTURES)) {
    test(`validate ${entity}: fixture válido → true`, () => {
      assert.equal(validate(valid), true, JSON.stringify(validate.errors));
    });
  }
});

describe('validadores — casos negativos', () => {
  test('validateTask rechaza status "in_progress"', () => {
    assert.equal(validateTask({ ...FIXTURES.task.valid, status: 'in_progress' }), false);
  });

  test('validateTask rechaza objeto sin projectId', () => {
    const { projectId, ...rest } = FIXTURES.task.valid;
    assert.equal(validateTask(rest), false);
  });

  test('validateTask rechaza propiedad extra foo', () => {
    assert.equal(validateTask({ ...FIXTURES.task.valid, foo: 'bar' }), false);
  });

  test('validateSession rechaza tokensIn: -1', () => {
    assert.equal(validateSession({ ...FIXTURES.session.valid, tokensIn: -1 }), false);
  });

  test('validateProject rechaza createdAt: "ayer" (format date-time)', () => {
    assert.equal(validateProject({ ...FIXTURES.project.valid, createdAt: 'ayer' }), false);
  });

  test('validateEvent rechaza entity: "user"', () => {
    assert.equal(validateEvent({ ...FIXTURES.event.valid, entity: 'user' }), false);
  });

  test('validateEvent rechaza kind: "TaskCreated"', () => {
    assert.equal(validateEvent({ ...FIXTURES.event.valid, kind: 'TaskCreated' }), false);
  });
});

describe('Project.status y Project.metadata (SPEC-077)', () => {
  const withMeta = {
    ...FIXTURES.project.valid,
    status: 'active',
    metadata: {
      language: 'typescript',
      runtimes: ['claude-code'],
      frameworks: ['laravel', 'react'],
      specsDir: 'docs/specs',
    },
  };

  test('fixture con status y metadata completos → true', () => {
    assert.equal(validateProject(withMeta), true, JSON.stringify(validateProject.errors));
  });

  test('metadata vacía y parcial → true (todos los campos opcionales)', () => {
    assert.equal(validateProject({ ...FIXTURES.project.valid, metadata: {} }), true);
    assert.equal(validateProject({ ...FIXTURES.project.valid, metadata: { language: 'php' } }), true);
  });

  test('status "missing" e "invalid" → true; "gone" → false', () => {
    assert.equal(validateProject({ ...FIXTURES.project.valid, status: 'missing' }), true);
    assert.equal(validateProject({ ...FIXTURES.project.valid, status: 'invalid' }), true);
    assert.equal(validateProject({ ...FIXTURES.project.valid, status: 'gone' }), false);
  });

  test('metadata rechaza propiedades extra (additionalProperties: false)', () => {
    assert.equal(validateProject({ ...withMeta, metadata: { ...withMeta.metadata, foo: 1 } }), false);
  });

  test('metadata.runtimes debe ser array de strings', () => {
    assert.equal(validateProject({ ...FIXTURES.project.valid, metadata: { runtimes: 'claude-code' } }), false);
    assert.equal(validateProject({ ...FIXTURES.project.valid, metadata: { runtimes: [1] } }), false);
  });

  test('el schema define $defs/ProjectMetadata con additionalProperties: false', () => {
    const schema = JSON.parse(
      readFileSync(join(SCHEMAS_DIR, 'project.schema.json'), 'utf-8'),
    );
    assert.ok(schema.$defs?.ProjectMetadata, 'falta $defs/ProjectMetadata');
    assert.equal(schema.$defs.ProjectMetadata.additionalProperties, false);
    assert.deepEqual(schema.properties.status.enum, ['active', 'missing', 'invalid']);
  });
});

describe('parse<X> y SchemaValidationError', () => {
  test('parseTask(válido) retorna el objeto', () => {
    assert.deepEqual(parseTask(FIXTURES.task.valid), FIXTURES.task.valid);
  });

  test('parseTask(inválido) lanza SchemaValidationError con entity y errores con instancePath', () => {
    try {
      parseTask({ ...FIXTURES.task.valid, status: 'in_progress' });
      assert.fail('debió lanzar');
    } catch (err) {
      assert.ok(err instanceof SchemaValidationError, `lanzó ${err.constructor.name}`);
      assert.equal(err.entity, 'task');
      assert.ok(err.errors.length >= 1);
      assert.ok(typeof err.errors[0].instancePath === 'string');
    }
  });
});

describe('SCHEMAS crudos', () => {
  test('SCHEMAS.task es deep-equal al contenido de schemas/task.schema.json', () => {
    const file = JSON.parse(readFileSync(join(SCHEMAS_DIR, 'task.schema.json'), 'utf-8'));
    assert.deepEqual(JSON.parse(JSON.stringify(SCHEMAS.task)), file);
  });

  test('SCHEMAS expone las 8 entidades', () => {
    assert.deepEqual(Object.keys(SCHEMAS).sort(), [
      'approval', 'event', 'harness', 'project', 'session', 'task', 'team', 'teamRole',
    ]);
  });
});

describe('artefactos generados', () => {
  test('ningún archivo de src/ compila schemas en runtime (sin new Ajv / ajv.compile)', () => {
    for (const f of readdirSync(join(PKG, 'src'))) {
      const content = readFileSync(join(PKG, 'src', f), 'utf-8');
      assert.ok(!/new Ajv\(|ajv\.compile\(/.test(content), `${f} instancia/compila Ajv en runtime`);
    }
  });

  test('los artefactos generados llevan banner NO EDITAR', () => {
    for (const f of ['types.gen.ts', 'validators.gen.mjs', 'validators.gen.d.mts', 'schemas.gen.ts']) {
      const content = readFileSync(join(PKG, 'src', f), 'utf-8');
      assert.ok(content.includes('NO EDITAR'), `${f} sin banner`);
    }
  });
});
