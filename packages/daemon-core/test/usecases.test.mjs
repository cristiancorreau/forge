// Casos de uso con fakes en memoria (SPEC-076 § 5-6).
// Requiere `npm run build` previo. Los fakes se importan vía el subpath
// export "@cristiancorreau/forge-daemon-core/testing" (criterio de SPEC-076).
// Corre sin tmux ni SQLite instalados.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const {
  registerProject, createTask, openSession, reconcileOnBoot,
  DuplicateProjectPathError, ProjectNotFoundError, TaskNotFoundError, HarnessNotFoundError,
} = await import('@cristiancorreau/forge-daemon-core');

const {
  InMemoryRegistry, FakeSessionPort, FakeRuntime, FakeRuntimeProvider,
  FakeVcs, InMemoryEventBus, FakeClock, SeqIds,
} = await import('@cristiancorreau/forge-daemon-core/testing');

const NOW = '2026-07-05T12:00:00.000Z';

let registry, bus, clock, ids, sessions, vcs, runtimes, deps;

beforeEach(() => {
  registry = new InMemoryRegistry();
  bus = new InMemoryEventBus();
  clock = new FakeClock(NOW);
  ids = new SeqIds();
  sessions = new FakeSessionPort();
  vcs = new FakeVcs();
  runtimes = new FakeRuntimeProvider([new FakeRuntime('fake')]);
  deps = { registry, bus, clock, ids, sessions, vcs, runtimes };
});

const eventKinds = () => registry.events.appended.map((e) => e.kind);

async function seedHarness(id = 'hrn-1') {
  const harness = {
    id, runtime: 'fake', label: 'main', homeDir: '/home/forge/h1',
    priority: 0, status: 'active', createdAt: NOW,
  };
  await registry.harnesses.insert(harness);
  return harness;
}

describe('registerProject', () => {
  test('camino feliz: persiste, retorna Project y emite project.registered', async () => {
    const project = await registerProject(deps, {
      path: '/repos/demo', name: 'Demo App', profile: 'node',
    });

    assert.equal(project.id, 'id-0001');
    assert.equal(project.createdAt, NOW);
    assert.deepEqual(await registry.projects.byPath('/repos/demo'), project);
    assert.deepEqual(eventKinds(), ['project.registered']);
    assert.equal(bus.published.length, 1);
    assert.equal(bus.published[0].entityId, project.id);
  });

  test('path duplicado → DuplicateProjectPathError', async () => {
    await registerProject(deps, { path: '/repos/demo', name: 'a', profile: 'node' });
    await assert.rejects(
      registerProject(deps, { path: '/repos/demo', name: 'b', profile: 'node' }),
      DuplicateProjectPathError,
    );
  });
});

describe('createTask', () => {
  test('camino feliz: status backlog y evento task.created', async () => {
    const project = await registerProject(deps, { path: '/repos/demo', name: 'demo', profile: 'node' });
    const task = await createTask(deps, { projectId: project.id, title: 'hacer algo' });

    assert.equal(task.status, 'backlog');
    assert.equal(task.createdAt, NOW);
    assert.deepEqual(await registry.tasks.byId(task.id), task);
    assert.deepEqual(await registry.tasks.byProject(project.id), [task]);
    assert.deepEqual(eventKinds(), ['project.registered', 'task.created']);
  });

  test('proyecto inexistente → ProjectNotFoundError', async () => {
    await assert.rejects(
      createTask(deps, { projectId: 'prj-nope', title: 'x' }),
      ProjectNotFoundError,
    );
  });
});

describe('openSession', () => {
  test('crea worktree cuando falta, nombra forge:{project}:{task}:{role} y deja task/session en running', async () => {
    const project = await registerProject(deps, { path: '/repos/demo', name: 'Demo App', profile: 'node' });
    const task = await createTask(deps, { projectId: project.id, title: 'hacer algo' });
    const harness = await seedHarness();

    const session = await openSession(deps, {
      taskId: task.id, harnessId: harness.id, roleName: 'Dev', prompt: 'hazlo',
    });

    // worktree creado con branch forge/{taskId} y base sha del vcs
    assert.equal(vcs.worktrees.length, 1);
    assert.equal(vcs.worktrees[0].branch, `forge/${task.id}`);
    assert.equal(vcs.worktrees[0].baseSha, 'sha-1');
    const updatedTask = await registry.tasks.byId(task.id);
    assert.equal(updatedTask.worktreePath, vcs.worktrees[0].worktreePath);
    assert.equal(updatedTask.baseSha, 'sha-1');

    // sesión tmux con nombre canónico sanitizado
    const expectedName = `forge:demo-app:${task.id}:dev`;
    assert.equal(session.tmuxSession, expectedName);
    assert.equal(sessions.opened.length, 1);
    assert.equal(sessions.opened[0].name, expectedName);
    assert.equal(sessions.opened[0].cwd, updatedTask.worktreePath);
    assert.deepEqual(sessions.opened[0].command.argv, ['fake-runtime', '--role', 'Dev']);

    // estados finales + evento
    assert.equal(session.status, 'running');
    assert.equal(updatedTask.status, 'running');
    assert.equal((await registry.sessions.active()).length, 1);
    assert.ok(eventKinds().includes('session.opened'));
  });

  test('no re-crea worktree si la task ya tiene uno', async () => {
    const project = await registerProject(deps, { path: '/repos/demo', name: 'demo', profile: 'node' });
    const task = await createTask(deps, { projectId: project.id, title: 't' });
    await registry.tasks.update({ ...task, worktreePath: '/repos/demo/.worktrees/existente', baseSha: 'abc1234' });
    const harness = await seedHarness();

    await openSession(deps, { taskId: task.id, harnessId: harness.id, roleName: 'dev', prompt: 'p' });

    assert.equal(vcs.worktrees.length, 0);
    assert.equal(sessions.opened[0].cwd, '/repos/demo/.worktrees/existente');
  });

  test('task inexistente → TaskNotFoundError; harness inexistente → HarnessNotFoundError', async () => {
    await assert.rejects(
      openSession(deps, { taskId: 'tsk-nope', harnessId: 'hrn-1', roleName: 'dev', prompt: 'p' }),
      TaskNotFoundError,
    );

    const project = await registerProject(deps, { path: '/repos/demo', name: 'demo', profile: 'node' });
    const task = await createTask(deps, { projectId: project.id, title: 't' });
    await assert.rejects(
      openSession(deps, { taskId: task.id, harnessId: 'hrn-nope', roleName: 'dev', prompt: 'p' }),
      HarnessNotFoundError,
    );
  });
});

describe('reconcileOnBoot', () => {
  test('mata tmux huérfanas, marca orphaned filas sin proceso y emite eventos', async () => {
    const project = await registerProject(deps, { path: '/repos/demo', name: 'demo', profile: 'node' });
    const task = await createTask(deps, { projectId: project.id, title: 't' });
    const harness = await seedHarness();

    // sesión legítima registrada y viva… hasta que su proceso muere
    const session = await openSession(deps, {
      taskId: task.id, harnessId: harness.id, roleName: 'dev', prompt: 'p',
    });
    sessions.live.delete(session.tmuxSession); // simular proceso muerto

    // sesión tmux huérfana sin fila en el registro
    sessions.live.add('forge:otro:tsk-x:dev');
    // sesión ajena (sin prefijo forge:) — no debe tocarse
    sessions.live.add('personal-session');

    const result = await reconcileOnBoot({ registry, sessions, clock, bus });

    // a) tmux sin fila running → kill + session.reaped
    assert.deepEqual(result.killedTmux, ['forge:otro:tsk-x:dev']);
    assert.deepEqual(sessions.killed, ['forge:otro:tsk-x:dev']);
    assert.ok(sessions.live.has('personal-session'), 'las sesiones ajenas no se tocan');

    // b) fila running sin tmux → orphaned + endedAt + task orphaned
    assert.deepEqual(result.orphanedSessions, [session.id]);
    const orphanedRow = await registry.sessions.byId(session.id);
    assert.equal(orphanedRow.status, 'orphaned');
    assert.equal(orphanedRow.endedAt, NOW);
    assert.equal((await registry.tasks.byId(task.id)).status, 'orphaned');

    const kinds = eventKinds();
    assert.ok(kinds.includes('session.reaped'), `falta session.reaped en ${kinds}`);
    assert.ok(kinds.includes('session.orphaned'), `falta session.orphaned en ${kinds}`);
  });

  test('no toca nada cuando registro y tmux están consistentes', async () => {
    const project = await registerProject(deps, { path: '/repos/demo', name: 'demo', profile: 'node' });
    const task = await createTask(deps, { projectId: project.id, title: 't' });
    const harness = await seedHarness();
    await openSession(deps, { taskId: task.id, harnessId: harness.id, roleName: 'dev', prompt: 'p' });

    const result = await reconcileOnBoot({ registry, sessions, clock, bus });

    assert.deepEqual(result, { killedTmux: [], orphanedSessions: [] });
    assert.equal((await registry.sessions.active()).length, 1);
    assert.equal((await registry.tasks.byId(task.id)).status, 'running');
  });
});
