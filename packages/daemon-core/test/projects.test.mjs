// Casos de uso del registro multi-proyecto (SPEC-077 § 2) — solo fakes de
// SPEC-076: sin SQLite, filesystem ni red. Requiere `npm run build` previo.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const {
  addProject, removeProject, listProjects, scanForProjects, refreshProject,
  registerProject, ProjectError, DuplicateProjectPathError,
} = await import('@cristiancorreau/forge-daemon-core');

const {
  InMemoryRegistry, FakeManifest, FakeVcs, InMemoryEventBus, FakeClock, SeqIds,
} = await import('@cristiancorreau/forge-daemon-core/testing');

const NOW = '2026-07-05T12:00:00.000Z';

let registry, manifests, vcs, bus, clock, ids, deps;

beforeEach(() => {
  registry = new InMemoryRegistry();
  manifests = new FakeManifest();
  vcs = new FakeVcs();
  bus = new InMemoryEventBus();
  clock = new FakeClock(NOW);
  ids = new SeqIds();
  deps = { registry, manifests, vcs, clock, ids, bus };
});

const eventKinds = () => registry.events.appended.map((e) => e.kind);
const busKinds = () => bus.published.map((e) => e.kind);

const MANIFEST = {
  name: 'Demo App',
  profile: 'enterprise',
  metadata: { language: 'typescript', runtimes: ['claude-code'], specsDir: 'docs/specs' },
};

describe('addProject', () => {
  test('camino feliz: registra, cachea metadata, status active y vcsRemote', async () => {
    manifests.setOk('/repos/demo', MANIFEST);
    vcs.remotes.set('/repos/demo', 'git@github.com:demo/demo.git');

    const project = await addProject(deps, { path: '/repos/demo' });

    assert.equal(project.id, 'id-0001');
    assert.equal(project.name, 'Demo App');
    assert.equal(project.profile, 'enterprise');
    assert.equal(project.status, 'active');
    assert.equal(project.vcsRemote, 'git@github.com:demo/demo.git');
    assert.deepEqual(project.metadata, MANIFEST.metadata);
    assert.equal(project.createdAt, NOW);
    assert.equal(project.lastSeenAt, NOW);
    assert.deepEqual(await registry.projects.byPath('/repos/demo'), project);

    // Eventos: persistidos Y publicados (composición: registered + added).
    assert.deepEqual(eventKinds(), ['project.registered', 'project.added']);
    assert.deepEqual(busKinds(), ['project.registered', 'project.added']);
  });

  test('sin remoto git → vcsRemote ausente', async () => {
    manifests.setOk('/repos/demo', MANIFEST);
    const project = await addProject(deps, { path: '/repos/demo' });
    assert.equal('vcsRemote' in project, false);
  });

  test('idempotente por composición: segunda llamada no duplica y conserva id/createdAt', async () => {
    manifests.setOk('/repos/demo', MANIFEST);
    const first = await addProject(deps, { path: '/repos/demo' });

    clock.advance(60_000);
    manifests.setOk('/repos/demo', { ...MANIFEST, name: 'Demo Renamed' });
    const second = await addProject(deps, { path: '/repos/demo' });

    assert.equal(second.id, first.id, 'conserva el id');
    assert.equal(second.createdAt, first.createdAt, 'conserva createdAt');
    assert.equal(second.name, 'Demo Renamed', 'refresca el name del manifest');
    assert.equal(second.lastSeenAt, '2026-07-05T12:01:00.000Z');
    assert.equal((await listProjects(deps)).length, 1, 'no duplica filas');
    assert.deepEqual(eventKinds(), ['project.registered', 'project.added', 'project.updated']);
    assert.deepEqual(busKinds(), eventKinds());
  });

  test('manifest missing → ProjectError(manifest-missing) y la DB no cambia', async () => {
    await assert.rejects(
      addProject(deps, { path: '/repos/empty' }),
      (err) => err instanceof ProjectError && err.code === 'manifest-missing',
    );
    assert.deepEqual(await listProjects(deps), []);
    assert.deepEqual(eventKinds(), []);
  });

  test('manifest invalid → ProjectError(manifest-invalid) y la DB no cambia', async () => {
    manifests.setInvalid('/repos/broken', 'yaml: bad indentation');
    await assert.rejects(
      addProject(deps, { path: '/repos/broken' }),
      (err) => err instanceof ProjectError
        && err.code === 'manifest-invalid'
        && err.message.includes('bad indentation'),
    );
    assert.deepEqual(await listProjects(deps), []);
    assert.deepEqual(eventKinds(), []);
  });
});

describe('registerProject (primitiva de SPEC-076, contrato intacto)', () => {
  test('path duplicado sigue lanzando DuplicateProjectPathError', async () => {
    manifests.setOk('/repos/demo', MANIFEST);
    await addProject(deps, { path: '/repos/demo' });
    await assert.rejects(
      registerProject(deps, { path: '/repos/demo', name: 'x', profile: 'node' }),
      DuplicateProjectPathError,
    );
  });
});

describe('removeProject', () => {
  beforeEach(async () => {
    manifests.setOk('/repos/demo', MANIFEST);
    await addProject(deps, { path: '/repos/demo' });
  });

  test('por id → true, elimina y emite project.removed', async () => {
    assert.equal(await removeProject(deps, { ref: 'id-0001' }), true);
    assert.deepEqual(await listProjects(deps), []);
    assert.equal(eventKinds().at(-1), 'project.removed');
    assert.equal(busKinds().at(-1), 'project.removed');
  });

  test('por path → true y elimina', async () => {
    assert.equal(await removeProject(deps, { ref: '/repos/demo' }), true);
    assert.deepEqual(await listProjects(deps), []);
  });

  test('referencia inexistente → false, sin eventos nuevos', async () => {
    const before = eventKinds().length;
    assert.equal(await removeProject(deps, { ref: '/repos/nope' }), false);
    assert.equal(await removeProject(deps, { ref: 'id-9999' }), false);
    assert.equal(eventKinds().length, before);
    assert.equal((await listProjects(deps)).length, 1);
  });
});

describe('scanForProjects', () => {
  test('marca los ya registrados y resuelve name (null si inválido)', async () => {
    manifests.setOk('/code/a', { name: 'A', metadata: {} });
    manifests.setOk('/code/b', { name: 'B', metadata: {} });
    manifests.setInvalid('/code/c', 'broken');
    await addProject(deps, { path: '/code/a' });

    const candidates = await scanForProjects(deps, { roots: ['/code'] });

    assert.deepEqual(candidates, [
      { path: '/code/a', name: 'A', alreadyRegistered: true },
      { path: '/code/b', name: 'B', alreadyRegistered: false },
      { path: '/code/c', name: null, alreadyRegistered: false },
    ]);
    // scan es solo lectura: únicos eventos son los del addProject previo.
    assert.deepEqual(eventKinds(), ['project.registered', 'project.added']);
  });

  test('maxDepth default 3 y override llegan al puerto', async () => {
    await scanForProjects(deps, { roots: ['/code'] });
    await scanForProjects(deps, { roots: ['/code'], maxDepth: 1 });
    assert.deepEqual(manifests.scanned, [
      { roots: ['/code'], maxDepth: 3 },
      { roots: ['/code'], maxDepth: 1 },
    ]);
  });

  test('respeta maxDepth (candidato profundo queda fuera)', async () => {
    manifests.setOk('/code/x', { name: 'X', metadata: {} });
    manifests.setOk('/code/deep/a/b/c', { name: 'Deep', metadata: {} });
    const candidates = await scanForProjects(deps, { roots: ['/code'], maxDepth: 2 });
    assert.deepEqual(candidates.map((c) => c.path), ['/code/x']);
  });
});

describe('refreshProject', () => {
  beforeEach(async () => {
    manifests.setOk('/repos/demo', MANIFEST);
    await addProject(deps, { path: '/repos/demo' });
  });

  test('manifest desaparecido → degrada a missing conservando metadata', async () => {
    manifests.setMissing('/repos/demo');
    clock.advance(1000);

    const project = await refreshProject(deps, { id: 'id-0001' });

    assert.equal(project.status, 'missing');
    assert.deepEqual(project.metadata, MANIFEST.metadata, 'conserva la última metadata conocida');
    assert.equal(project.lastSeenAt, '2026-07-05T12:00:01.000Z');
    assert.equal(eventKinds().at(-1), 'project.updated');
    assert.equal(busKinds().at(-1), 'project.updated');
    assert.equal(registry.events.appended.at(-1).payload.status, 'missing');
  });

  test('manifest roto → degrada a invalid', async () => {
    manifests.setInvalid('/repos/demo', 'yaml: bad');
    const project = await refreshProject(deps, { id: 'id-0001' });
    assert.equal(project.status, 'invalid');
    assert.equal((await registry.projects.byId('id-0001')).status, 'invalid');
  });

  test('manifest recuperado → vuelve a active y refresca metadata/name', async () => {
    manifests.setMissing('/repos/demo');
    await refreshProject(deps, { id: 'id-0001' });

    manifests.setOk('/repos/demo', {
      name: 'Demo v2', profile: 'startup', metadata: { language: 'php' },
    });
    const project = await refreshProject(deps, { id: 'id-0001' });

    assert.equal(project.status, 'active');
    assert.equal(project.name, 'Demo v2');
    assert.equal(project.profile, 'startup');
    assert.deepEqual(project.metadata, { language: 'php' });
  });

  test('id inexistente → null, sin eventos nuevos', async () => {
    const before = eventKinds().length;
    assert.equal(await refreshProject(deps, { id: 'id-9999' }), null);
    assert.equal(eventKinds().length, before);
  });
});
