import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { resolveForgeRoot } from '../lib/paths.js';
import { stripFrontmatter } from '../lib/unit-registry.js';
import { bold, dim, cyan } from '../ui/colors.js';
import { box } from '../ui/box.js';

type Phase = 'start' | 'close';

const META: Record<Phase, { id: string; command: string; title: string; blurb: string }> = {
  start: {
    id: 'session-start',
    command: '/session-start',
    title: 'forge session-start',
    blurb: 'Abre la sesión: detecta el estado del repo y enruta según el escenario.',
  },
  close: {
    id: 'session-close',
    command: '/session-close',
    title: 'forge session-close',
    blurb: 'Cierra la sesión: commit → changeset → daily note → sync → PR.',
  },
};

function help(phase: Phase): string {
  const m = META[phase];
  return `Usage: forge ${m.id} [options]

${m.blurb}

Estos comandos son guías para el agente: imprimen el skill central
core/skills/${m.id}/SKILL.md para que lo ejecutes en tu runtime (${m.command}).

Options:
  --json      Output the skill metadata and body as JSON
  -h, --help  Show this help
`;
}

/** Read the central SKILL.md body (sin frontmatter) for the given phase. */
function readSkillBody(phase: Phase): string | null {
  let root: string;
  try {
    root = resolveForgeRoot();
  } catch {
    return null;
  }
  const path = join(root, 'core', 'skills', META[phase].id, 'SKILL.md');
  if (!existsSync(path)) return null;
  return stripFrontmatter(readFileSync(path, 'utf-8'));
}

async function run(phase: Phase, args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(help(phase));
    return 0;
  }

  const m = META[phase];
  const body = readSkillBody(phase);

  if (args.includes('--json')) {
    console.log(JSON.stringify({ id: m.id, command: m.command, body }, null, 2));
    return body ? 0 : 1;
  }

  console.log(cyan(bold(m.title)) + '\n');
  console.log(dim(m.blurb) + '\n');

  if (!body) {
    console.log(dim(`No se encontró core/skills/${m.id}/SKILL.md en los assets de forge.`));
    console.log(box('Skill', [`${m.command} — ${m.blurb}`]));
    return 1;
  }

  console.log(body.trimEnd() + '\n');
  console.log(box('Skill central', [
    `${cyan(m.command)} — ejecutá estos pasos en tu runtime (Claude Code, OpenCode, Codex).`,
  ]));
  return 0;
}

export async function sessionStart(args: string[]): Promise<number> {
  return run('start', args);
}

export async function sessionClose(args: string[]): Promise<number> {
  return run('close', args);
}
