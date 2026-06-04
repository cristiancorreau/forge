// Spec gate tests (issue #28) for core/hooks/pre-edit-check.js.
//
// Exercises the spec-first gate added to the pure-JS pre-edit hook:
//   - feature branch + no APPROVED spec, default mode  -> WARN (exit 0)
//   - feature branch + APPROVED spec present           -> OK   (exit 0, no gate msg)
//   - feature branch + no spec, enterprise + opt-in    -> BLOCK (exit 2)
//   - documentation file on a feature branch           -> no gate
//
// The hook reads the Claude Code hooks API from stdin:
//   {"tool_name":"Edit","tool_input":{"file_path":"...","new_string":"..."}}
// Exit 0 = allowed (or warning only), exit 2 = blocked.
//
//     node --test test/hook-spec-gate.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/cli/test -> repo root is three levels up.
const REPO_ROOT = join(__dirname, '..', '..', '..');
const HOOK = join(REPO_ROOT, 'core', 'hooks', 'pre-edit-check.js');

const APPROVED_SPEC = [
  '# SPEC-001 Demo',
  '',
  '> Estado: APPROVED',
  '',
  '## Decisión',
  'algo',
  '',
].join('\n');

const TEMPLATE_SPEC = [
  '# [ID] Título',
  '',
  '> Estado: DRAFT | REVIEW | APPROVED | IMPLEMENTED',
  '',
].join('\n');

/** Create a throwaway git repo on a feature branch. Returns its path. */
function makeRepo({ projectYaml = null, spec = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'forge-specgate-'));
  const git = (args) =>
    execFileSync('git', args, { cwd: dir, stdio: 'pipe', encoding: 'utf-8' });
  git(['init', '-q']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'test']);
  git(['checkout', '-q', '-b', 'feat/demo']);
  if (projectYaml !== null) writeFileSync(join(dir, 'project.yaml'), projectYaml);
  mkdirSync(join(dir, 'docs', 'specs'), { recursive: true });
  // The template must never satisfy the gate.
  writeFileSync(join(dir, 'docs', 'specs', '_template.md'), TEMPLATE_SPEC);
  if (spec) writeFileSync(join(dir, 'docs', 'specs', 'SPEC-001-demo.md'), spec);
  return dir;
}

/** Run the JS hook with the given tool input from a working directory. */
function runHook({ cwd, filePath = 'src/app.js', newString = 'const x = 1;\n' }) {
  const payload = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: filePath, new_string: newString },
  });
  const res = spawnSync(process.execPath, [HOOK], {
    cwd,
    input: payload,
    encoding: 'utf-8',
    env: { ...process.env, DEBUG: '' },
  });
  return { status: res.status ?? 0, out: (res.stdout ?? '') + (res.stderr ?? '') };
}

describe('pre-edit-check.js — spec gate (issue #28)', () => {
  test('feature branch + no APPROVED spec (default mode) → warns, does not block', () => {
    const dir = makeRepo({ projectYaml: 'project:\n  mode: "standard"\n' });
    try {
      const { status, out } = runHook({ cwd: dir });
      assert.equal(status, 0, `should not block by default; got exit ${status}`);
      assert.match(out, /spec gate/i, 'expected a spec-gate warning');
      assert.match(out, /docs\/specs/, 'warning should mention docs/specs');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('feature branch + APPROVED spec present → no spec-gate message, allowed', () => {
    const dir = makeRepo({
      projectYaml: 'project:\n  mode: "enterprise"\nrules:\n  require_spec_before_implementation: true\n',
      spec: APPROVED_SPEC,
    });
    try {
      const { status, out } = runHook({ cwd: dir });
      assert.equal(status, 0, 'edit with APPROVED spec must be allowed');
      assert.doesNotMatch(out, /spec gate/i, 'no spec-gate message expected');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('enterprise + require_spec + no APPROVED spec → BLOCKS (exit 2)', () => {
    const dir = makeRepo({
      projectYaml: 'project:\n  mode: "enterprise"\nrules:\n  require_spec_before_implementation: true\n',
    });
    try {
      const { status, out } = runHook({ cwd: dir });
      assert.equal(status, 2, 'enterprise + opt-in must block when no spec');
      assert.match(out, /spec APPROVED/i, 'block message should mention APPROVED spec');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the template alone does not satisfy the gate', () => {
    // No real spec, only _template.md present (added by makeRepo).
    const dir = makeRepo({
      projectYaml: 'project:\n  mode: "enterprise"\nrules:\n  require_spec_before_implementation: true\n',
    });
    try {
      const { status } = runHook({ cwd: dir });
      assert.equal(status, 2, 'template-only must still block in enterprise');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('editing a documentation file is exempt from the spec gate', () => {
    const dir = makeRepo({
      projectYaml: 'project:\n  mode: "enterprise"\nrules:\n  require_spec_before_implementation: true\n',
    });
    try {
      const { status, out } = runHook({
        cwd: dir,
        filePath: 'docs/notes.md',
        newString: '# notes\n',
      });
      assert.equal(status, 0, 'doc edits must never be blocked by the spec gate');
      assert.doesNotMatch(out, /spec gate/i, 'no spec-gate message for docs');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
