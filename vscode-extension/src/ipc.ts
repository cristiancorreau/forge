// ---------------------------------------------------------------------------
// SPEC-070 / SPEC-072 — single source of truth for action → CLI args mapping.
//
// `toArgs` is PURE: given an action and its payload it returns the exact argv
// tokens to pass to the forge CLI (after the CLI command itself). The webview
// is presentation only; the engine is the same `dist/cli.js` invoked via spawn.
// The parity tests (parity.test.mjs) rely on this being the only place that
// decides which subcommand + flags run.
// ---------------------------------------------------------------------------

/** Payload for `forge init --from <answersFile>`. */
export interface RunInitPayload {
  /** Path to the answers JSON file (relative to the workspace root or absolute). */
  answersFile: string;
  /** When true, append `--dry-run` (preview, writes nothing). */
  dryRun?: boolean;
}

/** Payload for `forge adopt --yes [...]`. */
export interface RunAdoptPayload {
  /** Runtime: claude-code (default), opencode, codex. */
  runtime?: string;
  /** Mode: startup, standard (default), enterprise. */
  mode?: string;
  /** When false, append `--no-wiki` (skip the auto-generated wiki). */
  wiki?: boolean;
  /** When true, append `--dry-run`. */
  dryRun?: boolean;
}

/** Payload for `forge audit --json`. */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface RunAuditPayload {}

/** Payload for `forge doctor`. */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface RunDoctorPayload {}

/** Payload for `forge generate [--runtime <name>]`. */
export interface RunGeneratePayload {
  /** Runtime to generate config for; omitted → auto-detect. */
  runtime?: string;
}

/** Discriminated union of every action the webview can request. */
export type ForgeAction =
  | 'runInit'
  | 'runAdopt'
  | 'runAudit'
  | 'runDoctor'
  | 'runGenerate';

export interface ActionPayloadMap {
  runInit: RunInitPayload;
  runAdopt: RunAdoptPayload;
  runAudit: RunAuditPayload;
  runDoctor: RunDoctorPayload;
  runGenerate: RunGeneratePayload;
}

// ---------------------------------------------------------------------------
// Message contract (webview ⇄ host)
// ---------------------------------------------------------------------------

/** Request to run an action, sent webview → host. */
export interface RunMessage<A extends ForgeAction = ForgeAction> {
  type: 'run';
  action: A;
  payload: ActionPayloadMap[A];
  /** Correlation id so the webview can match the response. */
  requestId?: string;
}

/** Request to write a temporary answers file, sent webview → host. */
export interface WriteAnswersMessage {
  type: 'writeAnswers';
  /** The full answers object collected by the multi-step form. */
  answers: Record<string, unknown>;
  requestId?: string;
}

/**
 * Request to open a VS Code integrated terminal in the workspace running the
 * configured agent runtime. NOT a CLI command — handled with the VS Code
 * terminal API, so it is not part of `toArgs`/the parity contract.
 */
export interface OpenTerminalMessage {
  type: 'openTerminal';
  /** forge runtime (claude-code, opencode, codex, gemini). */
  runtime?: string;
  requestId?: string;
}

export type HostBoundMessage = RunMessage | WriteAnswersMessage | OpenTerminalMessage;

/** forge runtime → the agent CLI command to run in a terminal (or null). Pure. */
const RUNTIME_TERMINAL_CMD: Record<string, string> = {
  'claude-code': 'claude',
  opencode: 'opencode',
  codex: 'codex',
  gemini: 'gemini',
};

/** The terminal command for a runtime, or null when none is known. */
export function terminalCommandForRuntime(runtime?: string): string | null {
  if (!runtime) {
    return null;
  }
  return RUNTIME_TERMINAL_CMD[runtime] ?? null;
}

/** Successful CLI run, sent host → webview. */
export interface ResultMessage {
  type: 'result';
  action: ForgeAction | 'writeAnswers';
  stdout: string;
  stderr: string;
  code: number;
  requestId?: string;
}

/** Failure (spawn error, validation, etc.), sent host → webview. */
export interface ErrorMessage {
  type: 'error';
  action: ForgeAction | 'writeAnswers';
  message: string;
  requestId?: string;
}

/** Answers file written; carries the temp path for the subsequent run. */
export interface AnswersWrittenMessage {
  type: 'answersWritten';
  path: string;
  requestId?: string;
}

export type WebviewBoundMessage = ResultMessage | ErrorMessage | AnswersWrittenMessage;

// ---------------------------------------------------------------------------
// Pure mapping: action → CLI argv
// ---------------------------------------------------------------------------

/**
 * Map an action + payload to the exact CLI argv tokens (after the CLI command).
 * PURE — no I/O, no side effects. This is the contract the parity tests assert.
 */
export function toArgs<A extends ForgeAction>(
  action: A,
  payload: ActionPayloadMap[A]
): string[] {
  switch (action) {
    case 'runInit': {
      const p = payload as RunInitPayload;
      return ['init', '--from', p.answersFile, ...(p.dryRun ? ['--dry-run'] : [])];
    }
    case 'runAdopt': {
      const p = payload as RunAdoptPayload;
      return [
        'adopt',
        '--yes',
        ...(p.runtime ? ['--runtime', p.runtime] : []),
        ...(p.mode ? ['--mode', p.mode] : []),
        ...(p.wiki === false ? ['--no-wiki'] : []),
        ...(p.dryRun ? ['--dry-run'] : []),
      ];
    }
    case 'runAudit': {
      return ['audit', '--json'];
    }
    case 'runDoctor': {
      return ['doctor'];
    }
    case 'runGenerate': {
      const p = payload as RunGeneratePayload;
      return ['generate', ...(p.runtime ? ['--runtime', p.runtime] : [])];
    }
    default: {
      // Exhaustiveness guard.
      const _never: never = action as never;
      throw new Error(`toArgs: unknown action ${String(_never)}`);
    }
  }
}
