#!/usr/bin/env node
import { init } from './commands/init.js';
import { adopt } from './commands/adopt.js';
import { add } from './commands/add.js';
import { evalCmd } from './commands/eval.js';
import { specProbe } from './commands/spec-probe.js';
import { audit } from './commands/audit.js';
import { analyze } from './commands/analyze.js';
import { generate } from './commands/generate.js';
import { update } from './commands/update.js';
import { validate } from './commands/validate.js';
import { doctor } from './commands/doctor.js';
import { migrate } from './commands/migrate.js';
import { wiki } from './commands/wiki.js';
import { skills } from './commands/skills.js';
import { aitmplSearch } from './commands/aitmpl-search.js';
import { recommend } from './commands/recommend.js';
import { scaffold } from './commands/scaffold.js';
import { teardown } from './commands/teardown.js';
import { sessionStart, sessionClose } from './commands/session.js';
import { panel } from './commands/panel.js';
import { mcp } from './commands/mcp.js';
import { findProjectYaml } from './lib/yaml.js';

import { VERSION } from './version.js';
import { resolveLang, setLang, t } from './lib/i18n.js';

const lang = resolveLang(process.argv);
setLang(lang);
process.env.FORGE_LANG = lang; // a Bun relaunch of the TUI inherits the chosen language
const HELP = t('help.full', { version: VERSION });

// Strip --lang (and its value) from the args used for command dispatch.
const rawArgs = process.argv.slice(2).filter((a, i, arr) =>
  a !== '--lang' && arr[i - 1] !== '--lang' && !a.startsWith('--lang='));
const [cmd, ...rest] = rawArgs;

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
  case 'eval':
    exitCode = await evalCmd(rest);
    break;
  case 'spec-probe':
    exitCode = await specProbe(rest);
    break;
  case 'audit':
    exitCode = await audit(rest);
    break;
  case 'analyze':
    exitCode = await analyze(rest);
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
  case 'recommend':
    exitCode = await recommend(rest);
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
  case 'mcp':
    exitCode = await mcp(rest);
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
