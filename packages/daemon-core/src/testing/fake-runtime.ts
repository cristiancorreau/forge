/** FakeRuntime + FakeRuntimeProvider (SPEC-076 § 6). */
import type { RuntimeCommand, RuntimeEvent, RuntimePort, RuntimeProvider } from '../ports/runtime.js';
import type { Harness, Task } from '../types.js';

export class FakeRuntime implements RuntimePort {
  readonly builtCommands: Array<{ harness: Harness; task: Task; roleName: string; prompt: string }> = [];

  constructor(readonly runtime: string = 'fake') {}

  buildCommand(input: { harness: Harness; task: Task; roleName: string; prompt: string }): RuntimeCommand {
    this.builtCommands.push(input);
    return {
      argv: ['fake-runtime', '--role', input.roleName],
      env: { FAKE_HOME: input.harness.homeDir },
      cwd: input.task.worktreePath ?? '/',
    };
  }

  parseTranscriptLine(_line: string): RuntimeEvent | null {
    return null;
  }

  detectExhaustion(_chunk: string): { retryAfterIso: string | null } | null {
    return null;
  }
}

export class FakeRuntimeProvider implements RuntimeProvider {
  private readonly runtimes = new Map<string, RuntimePort>();

  constructor(runtimes: RuntimePort[] = []) {
    for (const r of runtimes) this.runtimes.set(r.runtime, r);
  }

  add(runtime: RuntimePort): void {
    this.runtimes.set(runtime.runtime, runtime);
  }

  get(runtime: string): RuntimePort | null {
    return this.runtimes.get(runtime) ?? null;
  }
}
