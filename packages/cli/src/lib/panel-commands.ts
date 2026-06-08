/**
 * panel-commands.ts — pure logic layer for the forge panel command palette.
 *
 * SPEC-059 PR3/PR4. Everything in this module is pure (no TTY, no render,
 * no FS writes) so it can be tested with node --test without Bun.
 *
 *   COMMANDS  — the 23 CLI command registry with kind classification.
 *   fuzzyMatch — subsequence match + score ordering.
 *   logBuffer  — fixed-window append buffer for the log pane.
 *   runPanelCommand — dispatcher: runs pure commands in-process, returns
 *                     delegation signals for writes-fs / delegated kinds.
 */

// ── Command registry ─────────────────────────────────────────────────────────

/** Classification of how a command runs inside the panel. */
export type CommandKind =
  | 'pure'        // reads only; runs in-process via runPanelCommand
  | 'writes-fs'   // would mutate the filesystem; delegated (dry-run→apply is v2)
  | 'delegated';  // another TUI / long-lived process; must exit the panel

export interface PanelCommand {
  id: string;
  name: string;
  aliases: string[];
  desc: string;
  kind: CommandKind;
}

/**
 * All 23 CLI commands listed in the help text.
 * kinds:
 *   pure      → audit, doctor, validate, recommend, eval, skills, catalog
 *   writes-fs → generate, update, adopt, add, scaffold, teardown
 *   delegated → init, migrate, session-start, session-close, mcp, wiki,
 *               panel (re-entry), recommend --apply (treated as writes-fs),
 *               update --force
 */
export const COMMANDS: PanelCommand[] = [
  // ── Pure (read-only, run in-process) ──
  {
    id: 'audit',
    name: 'audit',
    aliases: ['a', 'aud'],
    desc: 'Audit project against the forge standard',
    kind: 'pure',
  },
  {
    id: 'doctor',
    name: 'doctor',
    aliases: ['doc', 'dr'],
    desc: 'Check environment, installed runtimes and project.yaml completeness',
    kind: 'pure',
  },
  {
    id: 'validate',
    name: 'validate',
    aliases: ['val', 'v'],
    desc: 'Validate project.yaml schema (exit 1 on error, CI-safe)',
    kind: 'pure',
  },
  {
    id: 'recommend',
    name: 'recommend',
    aliases: ['rcm', 'rec'],
    desc: 'Stack-aware advisor: best catalog items for THIS project',
    kind: 'pure',
  },
  {
    id: 'eval',
    name: 'eval',
    aliases: ['ev', 'skill-eval'],
    desc: 'Evaluate a SKILL.md quality score',
    kind: 'pure',
  },
  {
    id: 'skills',
    name: 'skills',
    aliases: ['sk', 'skill'],
    desc: 'List available forge skills grouped by category',
    kind: 'pure',
  },
  {
    id: 'catalog',
    name: 'catalog',
    aliases: ['cat', 'search'],
    desc: 'Search the unified offline catalog (skills, profiles, MCP servers, frameworks)',
    kind: 'pure',
  },
  // ── Writes-FS (would mutate the filesystem; delegated for now, dry-run→apply is v2) ──
  {
    id: 'generate',
    name: 'generate',
    aliases: ['gen', 'g'],
    desc: 'Generate runtime config files from project.yaml',
    kind: 'writes-fs',
  },
  {
    id: 'update',
    name: 'update',
    aliases: ['upd', 'up'],
    desc: 'Update managed files to the bundled catalog (--dry-run, --force)',
    kind: 'writes-fs',
  },
  {
    id: 'adopt',
    name: 'adopt',
    aliases: ['ad'],
    desc: 'Onboard forge into an EXISTING codebase (analyze + auto-wiki)',
    kind: 'writes-fs',
  },
  {
    id: 'add',
    name: 'add',
    aliases: [],
    desc: 'Install a skill from an external source (security pipeline, opt-in network)',
    kind: 'writes-fs',
  },
  {
    id: 'scaffold',
    name: 'scaffold',
    aliases: ['sc', 'scf'],
    desc: 'Scaffold a new agent: Tier 2 profile, or Tier 3 domain agent (--tier 3)',
    kind: 'writes-fs',
  },
  {
    id: 'teardown',
    name: 'teardown',
    aliases: ['td', 'tear'],
    desc: 'Cleanly uninstall forge from a project (manifest-driven)',
    kind: 'writes-fs',
  },
  // ── Delegated (another TUI / long-lived process — must exit panel first) ──
  {
    id: 'init',
    name: 'init',
    aliases: ['i'],
    desc: 'Initialize forge in a project (wizard + post-install dashboard)',
    kind: 'delegated',
  },
  {
    id: 'migrate',
    name: 'migrate',
    aliases: ['mig', 'mg'],
    desc: 'Migrate project.yaml from v1 schema to v2 (--dry-run, --backup)',
    kind: 'delegated',
  },
  {
    id: 'session-start',
    name: 'session-start',
    aliases: ['ss', 'start'],
    desc: 'Open a work session (prints the /session-start skill steps)',
    kind: 'delegated',
  },
  {
    id: 'session-close',
    name: 'session-close',
    aliases: ['sc2', 'close'],
    desc: 'Close a work session (prints the /session-close skill steps)',
    kind: 'delegated',
  },
  {
    id: 'mcp',
    name: 'mcp',
    aliases: [],
    desc: "Run forge's MCP server (stdio, opt-in): live guardrail_status + wiki_search",
    kind: 'delegated',
  },
  {
    id: 'wiki',
    name: 'wiki',
    aliases: ['w'],
    desc: 'Manage the project knowledge base (status | ingest | query | lint)',
    kind: 'delegated',
  },
  {
    id: 'panel',
    name: 'panel',
    aliases: ['p'],
    desc: 'Open the interactive panel (config, monitor, skills, hooks, templates)',
    kind: 'delegated',
  },
  {
    id: 'aitmpl-search',
    name: 'aitmpl-search',
    aliases: ['ait', 'tmpl'],
    desc: 'Search the unified offline catalog (aitmpl alias)',
    kind: 'pure',
  },
  {
    id: 'version',
    name: 'version',
    aliases: ['ver', '--version', '-v'],
    desc: 'Show forge version',
    kind: 'pure',
  },
  {
    id: 'help',
    name: 'help',
    aliases: ['--help', '-h', '?'],
    desc: 'Show help',
    kind: 'pure',
  },
];

// ── Fuzzy match ──────────────────────────────────────────────────────────────

/**
 * Compute a subsequence match score for `query` against `target`.
 * Returns -1 when query is not a subsequence of target.
 * Higher score = better match. Exact prefix beats scattered matches.
 */
export function scoreMatch(query: string, target: string): number {
  if (query.length === 0) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact prefix: highest score
  if (t.startsWith(q)) return 1000 - t.length;

  // Subsequence match: scan target for all chars of query in order
  let qi = 0;
  let consecutiveBonus = 0;
  let lastMatchPos = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Consecutive chars bonus
      if (lastMatchPos === ti - 1) consecutiveBonus += 10;
      lastMatchPos = ti;
      qi++;
    }
  }

  if (qi < q.length) return -1; // not a subsequence
  return 100 + consecutiveBonus - t.length;
}

/**
 * Fuzzy match `query` against the command name + aliases.
 * Returns matching commands ordered by score (highest first).
 * An empty query returns all commands in original order.
 */
export function fuzzyMatch(
  query: string,
  commands: PanelCommand[] = COMMANDS,
): PanelCommand[] {
  if (!query.trim()) return [...commands];

  const q = query.trim().toLowerCase();
  const scored: Array<{ cmd: PanelCommand; score: number }> = [];

  for (const cmd of commands) {
    // Score against name, id and each alias — take the best
    const candidates = [cmd.name, cmd.id, ...cmd.aliases];
    let best = -1;
    for (const c of candidates) {
      const s = scoreMatch(q, c);
      if (s > best) best = s;
    }
    if (best >= 0) scored.push({ cmd, score: best });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.cmd);
}

// ── Log buffer ───────────────────────────────────────────────────────────────

/** A fixed-capacity sliding-window buffer for the log pane. */
export interface LogBuffer {
  /** Append one or more lines (newlines are split into individual entries). */
  append(lines: string | string[]): void;
  /** Return the latest `maxLines` lines (the visible window). */
  getWindow(): string[];
  /** Total lines appended (including those scrolled off). */
  total: number;
  /** Maximum lines kept. */
  maxLines: number;
}

/**
 * Create a LogBuffer that keeps only the last `maxLines` lines in memory.
 * Repaint cost is O(maxLines) regardless of total output — safe for long runs.
 */
export function logBuffer(maxLines: number): LogBuffer {
  if (maxLines < 1) throw new RangeError('maxLines must be >= 1');
  const buf: string[] = [];
  let total = 0;

  return {
    get maxLines() { return maxLines; },
    get total() { return total; },
    append(lines) {
      const toAdd = (Array.isArray(lines) ? lines : [lines])
        .flatMap(l => l.split('\n'));
      for (const l of toAdd) {
        buf.push(l);
        total++;
        if (buf.length > maxLines) buf.shift();
      }
    },
    getWindow() {
      return buf.slice();
    },
  };
}

// ── Command runner ───────────────────────────────────────────────────────────

/** Returned when a command should be delegated (run outside the panel). */
export interface DelegateSignal {
  delegate: true;
  cmd: string;
  reason: string;
}

/** Returned when a command needs FS confirmation before applying (v1: also delegates). */
export interface NeedsApplySignal {
  needsApply: true;
  cmd: string;
  reason: string;
}

/** Returned when a pure command ran successfully in-process. */
export interface PureResult {
  ok: boolean;
  lines: string[];
}

export type RunResult = PureResult | DelegateSignal | NeedsApplySignal;

/** Context passed to runPanelCommand. */
export interface PanelRunContext {
  /** Project root (cwd of the panel). */
  root: string;
  /** Forge root (resolved from FORGE_HOME or paths.ts). May be null if not installed. */
  forgeRoot: string | null;
}

// Lazy imports — loaded on first use (keeps startup fast and avoids circular deps).
// Only the pure-kind commands ever reach these paths.

async function importAudit() {
  const { runAudit } = await import('../commands/audit.js');
  return runAudit;
}

async function importDoctor() {
  const { runDoctor } = await import('../commands/doctor.js');
  return runDoctor;
}

async function importRecommend() {
  const { recommend, groupRecommendations } = await import('./recommend.js');
  return { recommend, groupRecommendations };
}

async function importValidate() {
  // validate is a named export from commands/validate.ts; the programmatic
  // runner is runValidate (returns { ok, errors }) — fall back if unavailable.
  try {
    const mod = await import('../commands/validate.js') as Record<string, unknown>;
    const fn = mod['runValidate'] ?? mod['validate'];
    return typeof fn === 'function' ? fn as (root: string) => { ok: boolean; errors: string[] } : null;
  } catch {
    return null;
  }
}

/**
 * Run a panel command by id.
 *
 * - kind:'pure'      → executes the pure function, returns PureResult with lines.
 * - kind:'writes-fs' → returns NeedsApplySignal (dry-run→apply is v2).
 * - kind:'delegated' → returns DelegateSignal (exit panel, run in shell).
 *
 * Never throws — errors are captured and returned as PureResult { ok: false }.
 */
export async function runPanelCommand(
  id: string,
  ctx: PanelRunContext,
): Promise<RunResult> {
  const cmd = COMMANDS.find(c => c.id === id);
  if (!cmd) {
    return {
      ok: false,
      lines: [`Unknown command: ${id}`],
    };
  }

  if (cmd.kind === 'delegated') {
    return {
      delegate: true,
      cmd: `forge ${cmd.name}`,
      reason: `'${cmd.name}' launches another TUI or long-lived process — run it in your shell`,
    };
  }

  if (cmd.kind === 'writes-fs') {
    return {
      needsApply: true,
      cmd: `forge ${cmd.name}`,
      reason: `'${cmd.name}' writes to the filesystem — dry-run→apply is v2`,
    };
  }

  // kind === 'pure'
  try {
    const lines: string[] = [];

    switch (id) {
      case 'audit': {
        const runAudit = await importAudit();
        const report = runAudit(ctx.root);
        lines.push(`forge audit`);
        lines.push('');
        for (const issue of report.issues) {
          const mark = issue.level === 'ok' ? '✓' : issue.level === 'error' ? '✗' : issue.level === 'warn' ? '!' : 'i';
          lines.push(`  [${mark}] ${issue.check.padEnd(22)} ${issue.message}`);
        }
        lines.push('');
        lines.push(
          `Summary: ${report.summary.ok} OK  ${report.summary.info} info  ` +
          `${report.summary.warnings} warn  ${report.summary.errors} errors`,
        );
        return { ok: report.summary.errors === 0, lines };
      }

      case 'doctor': {
        const runDoctor = await importDoctor();
        const report = runDoctor(ctx.root);
        lines.push('forge doctor');
        lines.push('');
        lines.push(`  Node.js ${report.nodeVersion}  forge root: ${report.forgeRootOk ? 'ok' : 'MISSING'}  assets: ${report.assetsOk ? 'ok' : 'MISSING'}`);
        lines.push(`  Runtimes detected: ${report.runtimesDetected.join(', ') || '—'}`);
        lines.push('');
        for (const rt of report.runtimes) {
          const mark = rt.installed ? '✓' : '○';
          const active = rt.active ? '  ● active' : '';
          lines.push(`  [${mark}] ${rt.label.padEnd(16)}${active}`);
        }
        lines.push('');
        lines.push(report.ok ? '✓ All checks passed.' : '✗ Some checks failed.');
        return { ok: report.ok, lines };
      }

      case 'recommend': {
        const { recommend, groupRecommendations } = await importRecommend();
        const result = recommend(ctx.forgeRoot, ctx.root);
        lines.push('forge recommend');
        lines.push('');
        if (result.recommendations.length === 0) {
          lines.push('  No recommendations for this project.');
        } else {
          const groups = groupRecommendations(result.recommendations, 5);
          for (const [cat, recs] of Object.entries(groups)) {
            lines.push(`  ${cat}`);
            for (const r of recs) {
              lines.push(`    • ${r.item.label.padEnd(28)} ${r.why}`);
            }
          }
        }
        return { ok: true, lines };
      }

      case 'validate': {
        const runValidate = await importValidate();
        if (!runValidate) {
          lines.push('forge validate');
          lines.push('  (validate function not available in this build)');
          return { ok: false, lines };
        }
        const result = runValidate(ctx.root);
        lines.push('forge validate');
        lines.push('');
        if (result.ok) {
          lines.push('  ✓ project.yaml is valid.');
        } else {
          for (const e of result.errors) lines.push(`  ✗ ${e}`);
        }
        return { ok: result.ok, lines };
      }

      case 'skills': {
        const { searchSkills } = await import('./panel-data.js');
        const rows = searchSkills('', ctx.root);
        lines.push('forge skills');
        lines.push('');
        let lastCat = '';
        for (const r of rows) {
          if (r.category !== lastCat) {
            lines.push(`  ${r.category}`);
            lastCat = r.category;
          }
          const mark = r.active ? '✓' : '○';
          lines.push(`    [${mark}] ${r.command.padEnd(22)} ${r.purpose}`);
        }
        return { ok: true, lines };
      }

      case 'catalog':
      case 'aitmpl-search': {
        const { searchCatalog } = await import('./catalog-install.js');
        const results = searchCatalog(ctx.forgeRoot, ctx.root, '');
        lines.push(`forge ${id === 'aitmpl-search' ? 'aitmpl-search' : 'catalog'}`);
        lines.push('');
        for (const it of results.slice(0, 40)) {
          const mark = it.installed ? '✓' : '○';
          lines.push(`  [${mark}] ${it.label.padEnd(28)} [${it.type}]  ${it.description.slice(0, 50)}`);
        }
        if (results.length > 40) lines.push(`  … +${results.length - 40} more`);
        return { ok: true, lines };
      }

      case 'eval': {
        lines.push('forge eval');
        lines.push('');
        lines.push('  Usage: forge eval <path/to/SKILL.md>');
        lines.push('  Provide a SKILL.md path to evaluate its quality score.');
        return { ok: true, lines };
      }

      case 'version': {
        const { VERSION } = await import('../version.js');
        lines.push(`forge v${VERSION}`);
        return { ok: true, lines };
      }

      case 'help': {
        const { t } = await import('./i18n.js');
        const { VERSION } = await import('../version.js');
        const helpText = t('help.full', { version: VERSION });
        lines.push(...helpText.split('\n'));
        return { ok: true, lines };
      }

      default: {
        lines.push(`forge ${id}`);
        lines.push('  (no in-panel runner for this command yet)');
        return { ok: false, lines };
      }
    }
  } catch (err: unknown) {
    return {
      ok: false,
      lines: [
        `forge ${id}`,
        '',
        `  Error: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}
