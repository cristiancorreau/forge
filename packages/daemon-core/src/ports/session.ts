/**
 * SessionPort — ciclo de vida de sesiones de agente (SPEC-076 § 3).
 * Implementación: tmux control mode (SPEC-078).
 */
import type { RuntimeCommand } from './runtime.js';

export interface SessionPort {
  open(spec: { name: string; cwd: string; command: RuntimeCommand }): Promise<void>;
  sendPrompt(name: string, prompt: string): Promise<void>;
  kill(name: string): Promise<void>;
  isAlive(name: string): Promise<boolean>;
  listLive(prefix: string): Promise<string[]>;  // nombres con prefijo 'forge:'
}
