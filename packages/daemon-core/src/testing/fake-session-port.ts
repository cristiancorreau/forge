/** FakeSessionPort — registro de llamadas + set mutable de sesiones vivas (SPEC-076 § 6). */
import type { SessionPort } from '../ports/session.js';
import type { RuntimeCommand } from '../ports/runtime.js';

export class FakeSessionPort implements SessionPort {
  readonly opened: Array<{ name: string; cwd: string; command: RuntimeCommand }> = [];
  readonly killed: string[] = [];
  readonly prompts: Array<{ name: string; prompt: string }> = [];
  /** Sesiones "vivas": mutable desde los tests para simular procesos muertos. */
  readonly live = new Set<string>();

  async open(spec: { name: string; cwd: string; command: RuntimeCommand }): Promise<void> {
    this.opened.push(spec);
    this.live.add(spec.name);
  }

  async sendPrompt(name: string, prompt: string): Promise<void> {
    this.prompts.push({ name, prompt });
  }

  async kill(name: string): Promise<void> {
    this.killed.push(name);
    this.live.delete(name);
  }

  async isAlive(name: string): Promise<boolean> {
    return this.live.has(name);
  }

  async listLive(prefix: string): Promise<string[]> {
    return [...this.live].filter((n) => n.startsWith(prefix));
  }
}
