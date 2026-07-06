// Máquina de estados de Task + sessionName (SPEC-076 § 4).
// Requiere `npm run build` previo (importa vía self-reference del paquete).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { canTransition, sessionName } = await import('@cristiancorreau/forge-daemon-core');

describe('canTransition', () => {
  test('transiciones válidas', () => {
    assert.equal(canTransition('backlog', 'queued'), true);
    assert.equal(canTransition('queued', 'running'), true);
    assert.equal(canTransition('running', 'done'), true);
    assert.equal(canTransition('running', 'needs_input'), true);
    assert.equal(canTransition('running', 'review'), true);
    assert.equal(canTransition('review', 'done'), true);
    assert.equal(canTransition('failed', 'queued'), true);
    assert.equal(canTransition('orphaned', 'queued'), true);
  });

  test('done es terminal: done → * rechazado', () => {
    for (const to of ['backlog', 'queued', 'running', 'needs_input', 'review', 'failed', 'orphaned']) {
      assert.equal(canTransition('done', to), false, `done → ${to} debió rechazarse`);
    }
  });

  test('failed/orphaned solo pueden volver a queued', () => {
    for (const from of ['failed', 'orphaned']) {
      for (const to of ['backlog', 'running', 'needs_input', 'review', 'done']) {
        assert.equal(canTransition(from, to), false, `${from} → ${to} debió rechazarse`);
      }
      assert.equal(canTransition(from, 'queued'), true);
    }
  });

  test('transiciones inválidas varias', () => {
    assert.equal(canTransition('backlog', 'done'), false);
    assert.equal(canTransition('queued', 'review'), false);
    assert.equal(canTransition('needs_input', 'done'), false);
  });
});

describe('sessionName', () => {
  test('formato forge:{project}:{task}:{role}', () => {
    assert.equal(sessionName('demo', 'tsk-1', 'dev'), 'forge:demo:tsk-1:dev');
  });

  test('sanitiza cada segmento a [a-z0-9-]', () => {
    assert.equal(sessionName('Demo App', 'TSK_01!', 'Señor Dev'), 'forge:demo-app:tsk-01:se-or-dev');
  });

  test('recorta guiones sobrantes en los bordes', () => {
    assert.equal(sessionName('--x--', 'y', 'z'), 'forge:x:y:z');
  });
});
