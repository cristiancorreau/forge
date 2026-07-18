/**
 * Central runtime registry for forge.
 *
 * Each RuntimeDescriptor describes a supported AI coding runtime and knows how
 * to produce its configuration surfaces (files) from a ProjectYaml.
 *
 * - kind:'native'  — runtimes with rich, multi-file configuration (claude-code, kiro,
 *                    opencode, codex). Their descriptors expose at least the primary
 *                    surface so generate/adopt can use them generically. The full
 *                    installation (hooks, settings, etc.) is still handled by the
 *                    dedicated code paths in generate.ts / init.ts.
 * - kind:'rules'   — runtimes that accept a single Markdown rules file written to a
 *                    conventional path. The generic generateRulesDoc generator covers
 *                    all of them.
 */
import type { ProjectYaml } from '../yaml.js';
import { generateClaudeMd } from './claude-code.js';
import { generateAgentsMd, nestedAgentsSurfaces } from './opencode.js';
import { generateCodexAgentsMd } from './codex.js';
import { generateKiroProduct } from './kiro.js';
import { generateRulesDoc } from './rules-doc.js';
import { generateState, readSpecSummaries, STATE_FILES } from './state.js';

export interface RuntimeSurface {
  path: string;
  content: string;
  /** When true, the file should be written with chmod 0o755. */
  executable?: boolean;
}

export interface RuntimeDescriptor {
  /** Unique runtime identifier. Must match the enum in project.schema.json. */
  id: string;
  /** Human-readable label shown in CLI output. */
  label: string;
  /**
   * 'native' — rich multi-file runtime; descriptor provides primary surface only.
   * 'rules'  — single Markdown rules file at a conventional path.
   */
  kind: 'native' | 'rules';
  /**
   * Returns the surfaces (files) this runtime generates from the given config.
   * Native runtimes may return only their primary surface here; full installation
   * is handled by generate.ts / init.ts for backwards compatibility.
   */
  surfaces(config: ProjectYaml): RuntimeSurface[];
}

// ---------------------------------------------------------------------------
// Native runtime descriptors (wrap existing generators)
// ---------------------------------------------------------------------------

const claudeCodeDescriptor: RuntimeDescriptor = {
  id: 'claude-code',
  label: 'Claude Code',
  kind: 'native',
  surfaces(config) {
    return [{ path: 'CLAUDE.md', content: generateClaudeMd(config) }];
  },
};

const opencodeDescriptor: RuntimeDescriptor = {
  id: 'opencode',
  label: 'OpenCode',
  kind: 'native',
  surfaces(config) {
    return [
      { path: 'AGENTS.md', content: generateAgentsMd(config) },
      ...nestedAgentsSurfaces(config),
    ];
  },
};

const codexDescriptor: RuntimeDescriptor = {
  id: 'codex',
  label: 'Codex CLI',
  kind: 'native',
  surfaces(config) {
    return [
      { path: 'AGENTS.md', content: generateCodexAgentsMd(config) },
      ...nestedAgentsSurfaces(config),
    ];
  },
};

const kiroDescriptor: RuntimeDescriptor = {
  id: 'kiro',
  label: 'Kiro',
  kind: 'native',
  surfaces(config) {
    // Primary surface only. Full installation (all .kiro/steering/* and hooks)
    // is handled by generate.ts / init.ts because it requires mkdirSync for
    // multiple subdirectories and writes 7 separate files.
    return [{ path: '.kiro/steering/product.md', content: generateKiroProduct(config) }];
  },
};

// ---------------------------------------------------------------------------
// Rules-based runtime descriptors (use the generic generateRulesDoc generator)
// SPEC-056: paths sourced from official documentation or established conventions.
// ---------------------------------------------------------------------------

function rulesRuntime(id: string, label: string, path: string): RuntimeDescriptor {
  return {
    id,
    label,
    kind: 'rules',
    surfaces(config) {
      return [{ path, content: generateRulesDoc(config) }];
    },
  };
}

// Cursor: official convention (.cursor/rules/)
// https://docs.cursor.com/context/rules-for-ai
const cursorDescriptor = rulesRuntime('cursor', 'Cursor', '.cursor/rules/forge.md');

// Windsurf: official convention (.windsurf/rules/)
// https://docs.windsurf.com/windsurf/getting-started
const windsurfDescriptor = rulesRuntime('windsurf', 'Windsurf', '.windsurf/rules/forge.md');

// GitHub Copilot: official custom instructions path
// https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot
const copilotDescriptor = rulesRuntime('copilot', 'GitHub Copilot', '.github/copilot-instructions.md');

// Gemini CLI: de facto convention (GEMINI.md in repo root, mirrors CLAUDE.md pattern)
// https://github.com/google-gemini/gemini-cli — README refers to GEMINI.md
const geminiDescriptor = rulesRuntime('gemini', 'Gemini CLI', 'GEMINI.md');

// Zed: AI rules in .zed/ config dir
// https://zed.dev/docs/ai — .zed/rules.md is the established path
const zedDescriptor = rulesRuntime('zed', 'Zed', '.zed/rules.md');

// Cline: official .clinerules file in repo root
// https://github.com/cline/cline — CONTRIBUTING.md documents .clinerules
const clineDescriptor = rulesRuntime('cline', 'Cline', '.clinerules');

// Aider: CONVENTIONS.md is the primary conventions file
// https://aider.chat/docs/usage/conventions.html
const aiderDescriptor = rulesRuntime('aider', 'Aider', 'CONVENTIONS.md');

// Continue: .continue/rules/ directory convention
// https://docs.continue.dev/customize/context-providers
const continueDescriptor = rulesRuntime('continue', 'Continue', '.continue/rules/forge.md');

// Roo Code: .roo/rules/ — chosen by analogy with cursor/windsurf (.roo/ config dir).
// Roo official docs are not conclusive; this is the most documented community path.
// NOTE: If Roo updates their convention, update this path and SPEC-056.
const rooDescriptor = rulesRuntime('roo', 'Roo Code', '.roo/rules/forge.md');

// Amp: uses AGENTS.md as primary instruction file (similar to OpenAI Codex)
// https://ampcode.com — documented in Amp CLI getting started guide
const ampDescriptor = rulesRuntime('amp', 'Amp', 'AGENTS.md');

// Augment Code: .augment/rules/ — based on Augment Code internal documentation
// NOTE: If Augment updates their convention, update this path and SPEC-056.
const augmentDescriptor = rulesRuntime('augment', 'Augment Code', '.augment/rules/forge.md');

// Google Antigravity: agentic IDE; .antigravity/rules/ config dir convention.
// NOTE: niche/emerging runtime; if Antigravity publishes a convention, update SPEC-056.
const antigravityDescriptor = rulesRuntime('antigravity', 'Google Antigravity', '.antigravity/rules/forge.md');

// OpenClaw: .openclaw/rules/ — community convention (mirrors the .runtime/rules/ pattern).
// NOTE: niche runtime; update this path and SPEC-056 if an official convention lands.
const openclawDescriptor = rulesRuntime('openclaw', 'OpenClaw', '.openclaw/rules/forge.md');

// Pi: .pi/rules/ — config dir convention (asm uses ~/.pi for this runtime).
// NOTE: niche runtime; update this path and SPEC-056 if an official convention lands.
const piDescriptor = rulesRuntime('pi', 'Pi', '.pi/rules/forge.md');

// Hermes: .hermes/rules/ — config dir convention (asm uses ~/.hermes for this runtime).
// NOTE: niche runtime; update this path and SPEC-056 if an official convention lands.
const hermesDescriptor = rulesRuntime('hermes', 'Hermes', '.hermes/rules/forge.md');

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const RUNTIMES: RuntimeDescriptor[] = [
  // Native (rich multi-file installation)
  claudeCodeDescriptor,
  opencodeDescriptor,
  codexDescriptor,
  kiroDescriptor,
  // Rules-based (single Markdown file)
  cursorDescriptor,
  windsurfDescriptor,
  copilotDescriptor,
  geminiDescriptor,
  zedDescriptor,
  clineDescriptor,
  aiderDescriptor,
  continueDescriptor,
  rooDescriptor,
  ampDescriptor,
  augmentDescriptor,
  antigravityDescriptor,
  openclawDescriptor,
  piDescriptor,
  hermesDescriptor,
];

/** Returns the descriptor for a given runtime ID, or undefined if not found. */
export function getRuntime(id: string): RuntimeDescriptor | undefined {
  return RUNTIMES.find(r => r.id === id);
}

// ---------------------------------------------------------------------------
// State artifact surface (SPEC-062)
//
// The `.forge/state/` artifact is runtime-agnostic: it re-anchors context for
// any runtime, so it is not a RuntimeDescriptor. It needs the docs/specs/
// directory in addition to config, hence its own surface helper. generate.ts /
// init.ts / adopt.ts emit these surfaces alongside the per-runtime ones, and
// include them in the install manifest so `audit` detects drift.
// ---------------------------------------------------------------------------

/** Relative paths of the `.forge/state/` artifact files. */
export const STATE_SURFACE_FILES: readonly string[] = STATE_FILES;

/**
 * Returns the `.forge/state/` surfaces for the given config + specs directory.
 * Reading the specs directory is impure (filesystem); the generation itself is
 * pure and deterministic.
 */
export function stateSurfaces(config: ProjectYaml, specsDir: string): RuntimeSurface[] {
  const artifact = generateState(config, readSpecSummaries(specsDir));
  return [
    { path: '.forge/state/STATE.md', content: artifact['STATE.md'] },
    { path: '.forge/state/PLAN.md', content: artifact['PLAN.md'] },
    { path: '.forge/state/CONTEXT.md', content: artifact['CONTEXT.md'] },
  ];
}

/** Returns the list of all registered runtime IDs. */
export function runtimeIds(): string[] {
  return RUNTIMES.map(r => r.id);
}
