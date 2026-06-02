#!/usr/bin/env node
import { init } from './commands/init.js';
import { audit } from './commands/audit.js';
import { generate } from './commands/generate.js';
import { validate } from './commands/validate.js';
import { doctor } from './commands/doctor.js';

const VERSION = '2.1.0';

const HELP = `forge v${VERSION} — Agentic development framework

Usage: forge <command> [options]

Commands:
  init        Initialize forge in a project (wizard + generates agent files)
  audit       Audit project against the forge standard
  generate    Generate runtime config files from project.yaml
  validate    Validate project.yaml schema (exit 1 on error, CI-safe)
  doctor      Check environment: Python, pyyaml, forge root, project.yaml

Options:
  -v, --version   Show version
  -h, --help      Show this help

Run forge <command> --help for command-specific options.

Examples:
  npx @cristiancorreau/forge init
  npx @cristiancorreau/forge audit --json
  npx @cristiancorreau/forge generate --runtime claude-code
  npx @cristiancorreau/forge validate
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
