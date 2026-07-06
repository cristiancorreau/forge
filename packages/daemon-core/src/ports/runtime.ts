/**
 * RuntimePort — driver por runtime: claude-code, codex, opencode, …
 * (SPEC-076 § 3). Implementaciones en packages/daemon (SPEC-078).
 */
import type { Harness, Task } from '../types.js';

export interface RuntimeCommand {
  argv: string[];
  env: Record<string, string>;
  cwd: string;
}

/** Evento parseado del transcript de un runtime (JSONL, ACP, …). */
export interface RuntimeEvent {
  kind: string;
  payload?: unknown;
}

export interface RuntimePort {
  readonly runtime: string;                       // id, ej. 'claude-code'
  buildCommand(input: { harness: Harness; task: Task; roleName: string; prompt: string }): RuntimeCommand;
  parseTranscriptLine(line: string): RuntimeEvent | null;
  detectExhaustion(chunk: string): { retryAfterIso: string | null } | null;
}

export interface RuntimeProvider {
  get(runtime: string): RuntimePort | null;
}
