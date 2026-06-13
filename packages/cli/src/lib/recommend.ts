/**
 * `forge recommend` engine (SPEC-051 + SPEC-055) — the single pure function behind
 * the advisor. It combines the detection signal (`detectStack`) with the unified
 * catalog (`getUnifiedCatalog`) to produce read-only recommendations, each with a
 * WHY anchored in the detection signal that triggered it.
 *
 * Pure: no TTY, no writes, no network. The CLI command (and, later, adopt
 * --preview and the MCP skill) all delegate here — there is no second engine.
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { detectStack, type DetectedStack } from './detect.js';
import { getUnifiedCatalog, type CatalogItem, type CatalogInstallSpec } from './catalog-install.js';

export interface Recommendation {
  item: CatalogItem;
  /** Human WHY, anchored in the detection signal (never opinion). */
  why: string;
  /** The raw signal id that triggered it (e.g. "backend:django"). */
  signal: string;
  score: number;
}

export interface RecommendResult {
  stack: DetectedStack;
  recommendations: Recommendation[];
}

interface SignalMatch {
  signal: string;
  why: string;
  /** Catalog item id to recommend. */
  targetId: string;
  score: number;
}

// Detection signal → catalog item id. Every entry maps a concrete signal from
// detect.ts to an item that exists in the unified catalog.
const BACKEND_PROFILE: Record<string, string> = {
  django: 'django', fastapi: 'fastapi', flask: 'flask', hono: 'hono-drizzle',
  express: 'express', nestjs: 'nestjs', rails: 'rails', laravel: 'laravel',
  springboot: 'springboot', axum: 'rust', actix: 'rust', rocket: 'rust',
};
const FRONTEND_PROFILE: Record<string, string> = {
  nextjs: 'nextjs-admin', astro: 'astro', nuxt: 'vuenuxt', sveltekit: 'sveltekit',
};
const MOBILE_PROFILE: Record<string, string> = {
  flutter: 'flutter', expo: 'expo', 'react-native': 'expo',
};

/** Derive the detection signals → catalog targets for a stack. */
export function collectSignals(stack: DetectedStack, projectRoot: string): SignalMatch[] {
  const out: SignalMatch[] = [];
  const push = (signal: string, why: string, targetId: string, score = 2) =>
    out.push({ signal, why, targetId, score });

  if (stack.backend && BACKEND_PROFILE[stack.backend]) {
    push(`backend:${stack.backend}`, `detecte el backend ${stack.backend}`, BACKEND_PROFILE[stack.backend], 3);
  }
  if (!stack.backend && stack.language === 'go') {
    push('language:go', 'detecte un proyecto Go (go.mod)', 'go-gin', 2);
  }
  if (stack.frontend && FRONTEND_PROFILE[stack.frontend]) {
    push(`frontend:${stack.frontend}`, `detecte el frontend ${stack.frontend}`, FRONTEND_PROFILE[stack.frontend], 3);
  }
  if (stack.mobile && MOBILE_PROFILE[stack.mobile]) {
    push(`mobile:${stack.mobile}`, `detecte una app mobile ${stack.mobile}`, MOBILE_PROFILE[stack.mobile], 3);
  }
  if (stack.orm) {
    push(`orm:${stack.orm}`, `detecte el ORM ${stack.orm} (PostgreSQL)`, 'postgres', 2);
  } else if (stack.database === 'postgresql') {
    push('database:postgresql', 'detecte PostgreSQL', 'postgres', 2);
  }
  if (stack.hasDocker) {
    push('docker', 'detecte Docker (Dockerfile/compose)', 'docker', 2);
  }
  if (stack.testing.includes('playwright')) {
    push('testing:playwright', 'detecte Playwright en testing', 'playwright', 2);
  }
  if (stack.frontend && stack.testing.includes('playwright')) {
    push('e2e:gsd-browser', 'detecte frontend + testing E2E (Playwright)', 'gsd-browser', 3);
  }
  if (existsSync(join(projectRoot, '.git'))) {
    push('git', 'detecte un repositorio git', 'git', 1);
  }
  if (existsSync(join(projectRoot, '.github', 'workflows'))) {
    push('ci:github-actions', 'detecte GitHub Actions (.github/workflows)', 'claude-code-action', 2);
  }
  return out;
}

/**
 * Produce read-only recommendations for a project. Each recommendation points at
 * a real catalog item whose WHY cites the detection signal. Items that don't exist
 * in the catalog are skipped; duplicates (same type+id) are collapsed.
 */
export function recommend(forgeRoot: string | null, projectRoot: string): RecommendResult {
  const stack = detectStack(projectRoot);
  const catalog = getUnifiedCatalog(forgeRoot, projectRoot);
  const byId = new Map(catalog.map(i => [i.id, i]));

  const recommendations: Recommendation[] = [];
  const seen = new Set<string>();
  for (const s of collectSignals(stack, projectRoot)) {
    const item = byId.get(s.targetId);
    if (!item) continue;
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recommendations.push({ item, why: s.why, signal: s.signal, score: s.score });
  }
  recommendations.sort((a, b) => b.score - a.score);
  return { stack, recommendations };
}

/**
 * Group recommendations by catalog category, keeping the top `topN` per category
 * (highest score first). Optionally restrict to a single category.
 */
export function groupRecommendations(
  recs: Recommendation[],
  topN: number,
  category?: string,
): Record<string, Recommendation[]> {
  const groups: Record<string, Recommendation[]> = {};
  for (const r of recs) {
    const cat = r.item.category;
    if (category && cat !== category) continue;
    (groups[cat] ??= []).push(r);
  }
  for (const cat of Object.keys(groups)) {
    groups[cat] = groups[cat].sort((a, b) => b.score - a.score).slice(0, topN);
  }
  return groups;
}

/** A copy-pasteable manual install command for a non-installable item. */
export function manualInstallCommand(item: CatalogItem): string | null {
  if (!item.installSpec) return null;
  const { command, args } = item.installSpec;
  return `${command} ${args.join(' ')}`.trim();
}

// ─── SPEC-055: Bundle (plan declarativo exportable) ──────────────────────────

export interface RecommendBundleItem {
  id: string;
  type: string;
  category: string;
  installable: boolean;
  why: string;
  installSpec?: CatalogInstallSpec;
}

export interface RecommendBundle {
  createdFrom: {
    intent?: string;
    signals: string[];
  };
  items: RecommendBundleItem[];
}

/**
 * Build a declarative, exportable bundle from a RecommendResult (SPEC-055).
 * Pure: no writes, no TTY. The intent string (if provided) is recorded in
 * `createdFrom.intent` for human reference only — it never alters scoring.
 */
export function buildBundle(result: RecommendResult, intent?: string): RecommendBundle {
  const signals = [...new Set(result.recommendations.map(r => r.signal))];
  const items: RecommendBundleItem[] = result.recommendations.map(r => {
    const entry: RecommendBundleItem = {
      id: r.item.id,
      type: r.item.type,
      category: r.item.category,
      installable: r.item.installable,
      why: r.why,
    };
    if (r.item.installSpec) entry.installSpec = r.item.installSpec;
    return entry;
  });
  return {
    createdFrom: {
      ...(intent !== undefined && intent.length > 0 ? { intent } : {}),
      signals,
    },
    items,
  };
}
