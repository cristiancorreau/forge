#!/usr/bin/env node
import { init } from './commands/init.js';
import { adopt } from './commands/adopt.js';
import { add } from './commands/add.js';
import { audit } from './commands/audit.js';
import { generate } from './commands/generate.js';
import { update } from './commands/update.js';
import { validate } from './commands/validate.js';
import { doctor } from './commands/doctor.js';
import { migrate } from './commands/migrate.js';
import { wiki } from './commands/wiki.js';
import { skills } from './commands/skills.js';
import { aitmplSearch } from './commands/aitmpl-search.js';
import { scaffold } from './commands/scaffold.js';
import { teardown } from './commands/teardown.js';
import { sessionStart, sessionClose } from './commands/session.js';
import { panel } from './commands/panel.js';
import { findProjectYaml } from './lib/yaml.js';

import { VERSION } from './version.js';

const HELP = `forge v${VERSION} — Agentic development framework

Usage: forge <command> [options]

Setup
  panel          Open the interactive panel (config, monitor, skills, hooks, templates)
  init           Initialize forge in a project (wizard + post-install dashboard)
  adopt          Onboard forge into an EXISTING codebase (analyze + auto-wiki)
  add            Install a skill from an external source (security pipeline, opt-in network)
  generate       Generate runtime config files from project.yaml
  update         Update managed files to the bundled catalog (--dry-run, --force)
  migrate        Migrate project.yaml from the v1 schema to v2 (--dry-run, --backup)
  scaffold       Scaffold a new agent: Tier 2 profile, or Tier 3 domain agent (--tier 3)
  teardown       Cleanly uninstall forge from a project (manifest-driven)

Inspect
  audit          Audit project against the forge standard
  validate       Validate project.yaml schema (exit 1 on error, CI-safe)
  doctor         Check environment, installed runtimes and project.yaml completeness
  skills         List available forge skills grouped by category
  aitmpl-search  Search the curated offline catalog (frameworks, MCP servers, profiles)

Workflow
  session-start  Open a work session (prints the /session-start skill steps)
  session-close  Close a work session (prints the /session-close skill steps)

Knowledge
  wiki           Manage the project knowledge base (status | ingest | query | lint)

Options:
  -v, --version   Show version
  -h, --help      Show this help

Run forge <command> --help for command-specific options.

Examples:
  npx @cristiancorreau/forge init
  npx @cristiancorreau/forge adopt ./my-existing-repo --yes
  npx @cristiancorreau/forge panel
  npx @cristiancorreau/forge skills
  npx @cristiancorreau/forge migrate --dry-run
  npx @cristiancorreau/forge wiki status
  npx @cristiancorreau/forge doctor
`;

const [, , cmd, ...rest] = process.argv;

let exitCode = 0;

switch (cmd) {
  case 'init':
    exitCode = await init(rest);
    break;
  case 'adopt':
    exitCode = await adopt(rest);
    break;
  case 'add':
    exitCode = await add(rest);
    break;
  case 'audit':
    exitCode = await audit(rest);
    break;
  case 'generate':
    exitCode = await generate(rest);
    break;
  case 'update':
    exitCode = await update(rest);
    break;
  case 'validate':
    exitCode = await validate(rest);
    break;
  case 'doctor':
    exitCode = await doctor(rest);
    break;
  case 'migrate':
    exitCode = await migrate(rest);
    break;
  case 'wiki':
    exitCode = await wiki(rest);
    break;
  case 'skills':
    exitCode = await skills(rest);
    break;
  case 'aitmpl-search':
    exitCode = await aitmplSearch(rest);
    break;
  case 'scaffold':
    exitCode = await scaffold(rest);
    break;
  case 'teardown':
    exitCode = await teardown(rest);
    break;
  case 'session-start':
    exitCode = await sessionStart(rest);
    break;
  case 'session-close':
    exitCode = await sessionClose(rest);
    break;
  case 'panel':
    exitCode = await panel(rest);
    break;
  case '-v':
  case '--version':
    console.log(VERSION);
    break;
  case undefined:
    // A bare `forge` opens the interactive panel inside a configured project
    // (project.yaml present); otherwise it keeps the help / quick-start output.
    if (findProjectYaml(process.cwd())) {
      exitCode = await panel(rest);
    } else {
      process.stdout.write(HELP);
    }
    break;
  case '-h':
  case '--help':
    process.stdout.write(HELP);
    break;
  default:
    console.error(`Unknown command: ${cmd}\nRun forge --help for usage.\n`);
    exitCode = 1;
}

process.exit(exitCode);
