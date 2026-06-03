#!/usr/bin/env node
import { init } from './commands/init.js';
import { audit } from './commands/audit.js';
import { generate } from './commands/generate.js';
import { validate } from './commands/validate.js';
import { doctor } from './commands/doctor.js';
import { migrate } from './commands/migrate.js';
import { wiki } from './commands/wiki.js';
import { skills } from './commands/skills.js';
import { aitmplSearch } from './commands/aitmpl-search.js';
import { scaffold } from './commands/scaffold.js';
import { teardown } from './commands/teardown.js';

const VERSION = '2.8.0';

const HELP = `forge v${VERSION} — Agentic development framework

Usage: forge <command> [options]

Setup
  init           Initialize forge in a project (wizard + post-install dashboard)
  generate       Generate runtime config files from project.yaml
  migrate        Migrate project.yaml from the v1 schema to v2 (--dry-run, --backup)
  scaffold       Scaffold a new Tier 2 profile (profiles/<stack>/agents/<engineer>.md)
  teardown       Cleanly uninstall forge from a project (manifest-driven)

Inspect
  audit          Audit project against the forge standard
  validate       Validate project.yaml schema (exit 1 on error, CI-safe)
  doctor         Check environment, installed runtimes and project.yaml completeness
  skills         List available forge skills grouped by category
  aitmpl-search  Search the curated offline catalog (frameworks, MCP servers, profiles)

Knowledge
  wiki           Manage the project knowledge base (status | ingest | query | lint)

Options:
  -v, --version   Show version
  -h, --help      Show this help

Run forge <command> --help for command-specific options.

Examples:
  npx @cristiancorreau/forge init
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
  case 'audit':
    exitCode = await audit(rest);
    break;
  case 'generate':
    exitCode = await generate(rest);
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
  case '-v':
  case '--version':
    console.log(VERSION);
    break;
  case undefined:
  case '-h':
  case '--help':
    process.stdout.write(HELP);
    break;
  default:
    console.error(`Unknown command: ${cmd}\nRun forge --help for usage.\n`);
    exitCode = 1;
}

process.exit(exitCode);
