import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { ForgeConfigPanel } from './webview/panel';

// ---------------------------------------------------------------------------
// CLI invocation
//
// The extension drives the TypeScript CLI `@cristiancorreau/forge` (published on
// npm) instead of the deprecated Python/git-submodule flow. The command is
// configurable via the `forge.cliCommand` setting (default
// `npx @cristiancorreau/forge`) so users can point to a global `forge`, `pnpm
// dlx`, `bunx`, etc.
// ---------------------------------------------------------------------------

function getWorkspaceRoot(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return null;
  }
  return folders[0].uri.fsPath;
}

function findProjectYaml(workspaceRoot: string): boolean {
  return fs.existsSync(path.join(workspaceRoot, 'project.yaml'));
}

/**
 * The configured CLI command, split into argv tokens.
 * e.g. "npx @cristiancorreau/forge" → ["npx", "@cristiancorreau/forge"]
 *
 * Exported so the config webview (src/webview/panel.ts) reuses the exact same
 * resolution — the GUI must spawn the same CLI the rest of the extension does.
 */
export function getCliCommand(): string[] {
  const config = vscode.workspace.getConfiguration('forge');
  const raw = config.get<string>('cliCommand', 'npx @cristiancorreau/forge').trim();
  const tokens = raw.split(/\s+/).filter(Boolean);
  return tokens.length > 0 ? tokens : ['npx', '@cristiancorreau/forge'];
}

interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Run a forge subcommand non-interactively, capturing stdout/stderr.
 * `subArgs` are the arguments after the CLI command (e.g. ['audit', '--json']).
 */
function runForge(subArgs: string[], workspaceRoot: string): Promise<CliResult> {
  const cli = getCliCommand();
  const argv = [...cli.slice(1), ...subArgs];
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const proc = spawn(cli[0], argv, {
      cwd: workspaceRoot,
      env: process.env,
      shell: process.platform === 'win32',
    });
    proc.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    proc.on('close', (code: number | null) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    proc.on('error', (err: Error) => {
      resolve({ stdout: '', stderr: err.message, code: 1 });
    });
  });
}

/**
 * Run a forge subcommand interactively in a VS Code integrated terminal.
 * Used for the init wizard (TTY prompts).
 */
function runForgeInTerminal(subArgs: string[], workspaceRoot: string, name: string): void {
  const cli = getCliCommand();
  const terminal = vscode.window.createTerminal({ name, cwd: workspaceRoot });
  terminal.show();
  terminal.sendText([...cli, ...subArgs].join(' '));
}

async function requireWorkspace(): Promise<string | null> {
  const root = getWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage('forge: No workspace open.');
    return null;
  }
  return root;
}

async function requireProjectYaml(workspaceRoot: string): Promise<boolean> {
  if (findProjectYaml(workspaceRoot)) { return true; }
  const choice = await vscode.window.showWarningMessage(
    'forge: No hay project.yaml en este workspace. Ejecuta el wizard de inicialización primero.',
    'Run Init Wizard', 'Cancelar'
  );
  if (choice === 'Run Init Wizard') {
    await vscode.commands.executeCommand('forge.init');
  }
  return false;
}

// ---------------------------------------------------------------------------
// Simple YAML field extractor (no external dependencies)
// Handles nested structure: section.key, inline arrays, and block lists.
// ---------------------------------------------------------------------------

function parseSimpleYaml(content: string): Record<string, string> {
  // Build a flat map of "section.key" → "value" by walking lines
  const flat: Record<string, string> = {};
  const lines = content.split('\n');

  let section = '';
  let subsection = '';
  let listKey = '';
  let listItems: string[] = [];

  const flushList = () => {
    if (listKey && listItems.length > 0) {
      flat[listKey] = listItems.join(', ');
    }
    listKey = '';
    listItems = [];
  };

  const stripInlineComment = (s: string) => s.replace(/#.*$/, '').trim();
  const unquote = (s: string) => s.replace(/^["']|["']$/g, '').trim();

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line) { continue; }

    const trimmed = line.trimStart();
    if (trimmed.startsWith('#')) { continue; }

    const indent = line.length - trimmed.length;

    // List item
    if (trimmed.startsWith('- ')) {
      const val = unquote(stripInlineComment(trimmed.slice(2)));
      if (val) { listItems.push(val); }
      continue;
    }

    // Key line — flush any pending list first
    flushList();

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) { continue; }

    const key = trimmed.slice(0, colonIdx).trim();
    const rest = stripInlineComment(trimmed.slice(colonIdx + 1).trim());

    if (indent === 0) {
      section = key;
      subsection = '';
      // Top-level scalar (uncommon but possible)
      if (rest && rest !== 'null') { flat[section] = unquote(rest); }
    } else if (indent === 2) {
      subsection = key;
      const fullKey = `${section}.${key}`;
      if (rest) {
        // Inline array: [a, b, c]
        const arrMatch = rest.match(/^\[([^\]]*)\]/);
        if (arrMatch) {
          const items = arrMatch[1].split(',').map(s => unquote(s)).filter(Boolean);
          if (items.length > 0) { flat[fullKey] = items.join(', '); }
        } else if (rest !== 'null') {
          flat[fullKey] = unquote(rest);
        }
      } else {
        // Block content follows — set up list collection
        listKey = fullKey;
      }
    } else if (indent === 4) {
      const fullKey = `${section}.${subsection}.${key}`;
      if (rest) {
        const arrMatch = rest.match(/^\[([^\]]*)\]/);
        if (arrMatch) {
          const items = arrMatch[1].split(',').map(s => unquote(s)).filter(Boolean);
          if (items.length > 0) { flat[fullKey] = items.join(', '); }
        } else if (rest !== 'null') {
          flat[fullKey] = unquote(rest);
        }
      } else {
        listKey = fullKey;
      }
    }
  }

  flushList();

  // Map flat keys to the display keys expected by ForgeProjectProvider
  const get = (k: string) => flat[k] || '';
  const result: Record<string, string> = {};

  const name = get('project.name');
  if (name)               { result['projectName']  = name; }

  const mode = get('project.mode') || get('project.type');
  if (mode)               { result['mode']         = mode; }

  const language = get('project.language');
  if (language)           { result['language']     = language; }

  const status = get('project.status');
  if (status)             { result['status']       = status; }

  const description = get('project.description');
  if (description && description !== '""' && description !== "''") {
    result['description'] = description.length > 60 ? description.slice(0, 57) + '…' : description;
  }

  const frontend = get('stack.frontend');
  if (frontend)           { result['frontend']     = frontend; }

  const backend = get('stack.backend');
  if (backend)            { result['backend']      = backend; }

  const database = get('stack.database');
  if (database)           { result['database']     = database; }

  const deploy = get('stack.deploy') || get('deploy.provider');
  if (deploy)             { result['deploy']       = deploy; }

  const team = get('team.name');
  if (team)               { result['team']         = team; }

  const profiles = get('agents.profiles');
  if (profiles)           { result['profiles']     = profiles; }

  const runtimes = get('runtimes.active');
  if (runtimes)           { result['runtimes']     = runtimes; }

  return result;
}

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

let statusBarItem: vscode.StatusBarItem;

function updateStatusBar(state: 'idle' | 'ok' | 'warn' | 'error', count?: number): void {
  if (state === 'idle') {
    statusBarItem.text = '$(robot) forge';
    statusBarItem.tooltip = 'forge — click to show project status';
  } else if (state === 'ok') {
    statusBarItem.text = '$(robot) forge ✓';
    statusBarItem.tooltip = 'forge — no errors';
  } else if (state === 'warn') {
    statusBarItem.text = `$(robot) forge ⚠ ${count ?? ''}`;
    statusBarItem.tooltip = `forge — ${count} warning(s)`;
  } else {
    statusBarItem.text = `$(robot) forge ✗ ${count ?? ''}`;
    statusBarItem.tooltip = `forge — ${count} error(s)`;
  }
}

// ---------------------------------------------------------------------------
// Tree view: Quick Actions (always visible)
// ---------------------------------------------------------------------------

class ForgeActionItem extends vscode.TreeItem {
  constructor(
    label: string,
    commandId: string,
    icon: string,
    description?: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = { command: commandId, title: label };
    this.iconPath = new vscode.ThemeIcon(icon);
    if (description) {
      this.description = description;
    }
    this.contextValue = 'forgeAction';
  }
}

class ForgeActionsProvider implements vscode.TreeDataProvider<ForgeActionItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void { this._onDidChangeTreeData.fire(); }

  getTreeItem(el: ForgeActionItem): vscode.TreeItem { return el; }

  getChildren(): ForgeActionItem[] {
    return [
      new ForgeActionItem('Init Wizard',        'forge.init',          'wand',     'initialize forge in this project'),
      new ForgeActionItem('Recommend',          'forge.recommend',     'lightbulb', 'stack-aware advisor: best catalog items for this project'),
      new ForgeActionItem('Run Audit',          'forge.audit',         'check',    'audit project against the forge standard'),
      new ForgeActionItem('Doctor',             'forge.doctor',        'pulse',    'check environment and runtimes'),
      new ForgeActionItem('Generate',           'forge.generate',      'layers',   'generate runtime config files'),
      new ForgeActionItem('Validate project.yaml', 'forge.validate',   'pass',     'validate project.yaml schema'),
      new ForgeActionItem('Migrate to v2',      'forge.migrate',       'arrow-up', 'migrate project.yaml to v2'),
      new ForgeActionItem('Scaffold Agent',     'forge.scaffold',      'add',      'scaffold a Tier 2/3 agent'),
      new ForgeActionItem('Skills',             'forge.skills',        'extensions', 'list / search forge skills'),
      new ForgeActionItem('Wiki Status',        'forge.wikiStatus',    'book',     'show wiki structure'),
      new ForgeActionItem('Wiki Init',          'forge.wikiInit',      'new-folder', 'scaffold the wiki structure'),
      new ForgeActionItem('Search Catalog',     'forge.searchCatalog', 'search',   'frameworks, MCP servers, profiles'),
      new ForgeActionItem('Show Status',        'forge.showStatus',    'info',     'audit summary'),
    ];
  }
}

// ---------------------------------------------------------------------------
// Tree view: Project info
// ---------------------------------------------------------------------------

class ForgeProjectItem extends vscode.TreeItem {
  constructor(label: string, description?: string, icon?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    if (description) { this.description = description; }
    if (icon) { this.iconPath = new vscode.ThemeIcon(icon); }
  }
}

class ForgeProjectProvider implements vscode.TreeDataProvider<ForgeProjectItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void { this._onDidChangeTreeData.fire(); }

  getTreeItem(element: ForgeProjectItem): vscode.TreeItem { return element; }

  getChildren(): ForgeProjectItem[] {
    const root = getWorkspaceRoot();
    if (!root) {
      return [new ForgeProjectItem('No workspace open', undefined, 'warning')];
    }
    const yamlPath = path.join(root, 'project.yaml');
    if (!fs.existsSync(yamlPath)) {
      return [];   // viewsWelcome se encarga del estado vacío
    }
    const content = fs.readFileSync(yamlPath, 'utf8');
    const data = parseSimpleYaml(content);
    const items: ForgeProjectItem[] = [];

    if (data['projectName'])  { items.push(new ForgeProjectItem('Name',        data['projectName'],  'tag')); }
    if (data['description'])  { items.push(new ForgeProjectItem('Description', data['description'], 'info')); }
    if (data['mode'])         { items.push(new ForgeProjectItem('Mode',        data['mode'],         'symbol-enum')); }
    if (data['status'])       { items.push(new ForgeProjectItem('Status',      data['status'],       'circle-filled')); }
    if (data['language'])     { items.push(new ForgeProjectItem('Language',    data['language'],     'symbol-namespace')); }
    if (data['runtimes'])     { items.push(new ForgeProjectItem('Runtimes',    data['runtimes'],     'server-process')); }
    if (data['team'])         { items.push(new ForgeProjectItem('Team',        data['team'],         'organization')); }
    if (data['frontend'])     { items.push(new ForgeProjectItem('Frontend',    data['frontend'],     'browser')); }
    if (data['backend'])      { items.push(new ForgeProjectItem('Backend',     data['backend'],      'database')); }
    if (data['database'])     { items.push(new ForgeProjectItem('Database',    data['database'],     'database')); }
    if (data['deploy'])       { items.push(new ForgeProjectItem('Deploy',      data['deploy'],       'cloud')); }
    if (data['profiles'])     { items.push(new ForgeProjectItem('Profiles',    data['profiles'],     'extensions')); }

    if (items.length === 0) {
      items.push(new ForgeProjectItem('project.yaml loaded', undefined, 'check'));
    }
    return items;
  }
}

// ---------------------------------------------------------------------------
// Tree view: Agents
// ---------------------------------------------------------------------------

class ForgeAgentItem extends vscode.TreeItem {
  constructor(label: string, filePath: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.resourceUri = vscode.Uri.file(filePath);
    this.command = {
      command: 'vscode.open',
      title: 'Open Agent',
      arguments: [vscode.Uri.file(filePath)],
    };
    const tier = ForgeAgentItem.detectTier(filePath);
    this.iconPath = ForgeAgentItem.iconForTier(tier);
    this.tooltip = `Tier ${tier} — click to open`;
    this.description = `tier ${tier}`;
    this.contextValue = 'forgeAgent';
  }

  private static detectTier(filePath: string): number {
    try {
      const content = fs.readFileSync(filePath, 'utf8').slice(0, 1000);
      const m = content.match(/tier[:\s]+(\d)/i);
      if (m) { return parseInt(m[1], 10); }
    } catch { /* ignore */ }
    return 1;
  }

  private static iconForTier(tier: number): vscode.ThemeIcon {
    if (tier === 1) { return new vscode.ThemeIcon('account', new vscode.ThemeColor('charts.green')); }
    if (tier === 2) { return new vscode.ThemeIcon('account', new vscode.ThemeColor('charts.yellow')); }
    return new vscode.ThemeIcon('account', new vscode.ThemeColor('charts.red'));
  }
}

class ForgeAgentsProvider implements vscode.TreeDataProvider<ForgeAgentItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void { this._onDidChangeTreeData.fire(); }

  getTreeItem(element: ForgeAgentItem): vscode.TreeItem { return element; }

  getChildren(): ForgeAgentItem[] {
    const root = getWorkspaceRoot();
    if (!root) { return []; }
    const agentsDir = path.join(root, '.claude', 'agents');
    if (!fs.existsSync(agentsDir)) { return []; }
    const files = fs.readdirSync(agentsDir).filter((f: string) => f.endsWith('.md'));
    return files.map((f: string) => {
      const name = path.basename(f, '.md');
      return new ForgeAgentItem(name, path.join(agentsDir, f));
    });
  }
}

// ---------------------------------------------------------------------------
// Output channel
// ---------------------------------------------------------------------------

let forgeChannel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!forgeChannel) { forgeChannel = vscode.window.createOutputChannel('forge'); }
  return forgeChannel;
}

function reportResult(channel: vscode.OutputChannel, result: CliResult): void {
  if (result.stdout) { channel.appendLine(result.stdout); }
  if (result.stderr) {
    channel.appendLine('--- stderr ---');
    channel.appendLine(result.stderr);
  }
  if (result.code !== 0) {
    channel.appendLine(`\nProcess exited with code ${result.code}`);
  }
}

// ---------------------------------------------------------------------------
// Audit JSON shapes (from `forge audit --json`)
// ---------------------------------------------------------------------------

interface AuditSummary {
  errors: number;
  warnings: number;
  ok: number;
  info: number;
}

interface AuditIssue {
  level: 'error' | 'warn' | 'ok' | 'info';
  check: string;
  message: string;
}

interface AuditJson {
  summary?: AuditSummary;
  issues?: AuditIssue[];
}

async function refreshStatusBar(workspaceRoot: string): Promise<void> {
  const result = await runForge(['audit', '--json'], workspaceRoot);
  try {
    const parsed = JSON.parse(result.stdout) as AuditJson;
    const summary = parsed.summary;
    if (!summary) { updateStatusBar('idle'); return; }
    if (summary.errors > 0) {
      updateStatusBar('error', summary.errors);
    } else if (summary.warnings > 0) {
      updateStatusBar('warn', summary.warnings);
    } else {
      updateStatusBar('ok');
    }
  } catch {
    updateStatusBar('idle');
  }
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'forge.showStatus';
  context.subscriptions.push(statusBarItem);
  statusBarItem.show();

  // Status bar: open the config panel (SPEC-070)
  const panelStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  panelStatusItem.text = '$(settings-gear) forge config';
  panelStatusItem.tooltip = 'forge — abrir panel de configuración';
  panelStatusItem.command = 'forge.openConfigPanel';
  context.subscriptions.push(panelStatusItem);
  panelStatusItem.show();

  // Command: forge.openConfigPanel (SPEC-070)
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.openConfigPanel', () => {
      ForgeConfigPanel.createOrShow(context.extensionUri);
    })
  );

  const root = getWorkspaceRoot();
  const hasProjectYaml = root ? findProjectYaml(root) : false;

  updateStatusBar('idle');
  vscode.commands.executeCommand('setContext', 'forge.active', hasProjectYaml);

  // Providers
  const actionsProvider = new ForgeActionsProvider();
  const projectProvider = new ForgeProjectProvider();
  const agentsProvider  = new ForgeAgentsProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('forgeActionsView', actionsProvider),
    vscode.window.registerTreeDataProvider('forgeProjectView', projectProvider),
    vscode.window.registerTreeDataProvider('forgeAgentsView',  agentsProvider)
  );

  // Watch project.yaml for changes
  if (root) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(root, 'project.yaml')
    );
    const onYaml = () => {
      projectProvider.refresh();
      agentsProvider.refresh();
      vscode.commands.executeCommand('setContext', 'forge.active', true);
      void refreshStatusBar(root);
      statusBarItem.show();
    };
    watcher.onDidChange(onYaml);
    watcher.onDidCreate(onYaml);
    context.subscriptions.push(watcher);

    if (hasProjectYaml) {
      void refreshStatusBar(root);
    }
  }

  // -------------------------------------------------------------------------
  // Command: forge.init  (interactive wizard in an integrated terminal)
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.init', async () => {
      const workspaceRoot = await requireWorkspace();
      if (!workspaceRoot) { return; }
      runForgeInTerminal(['init'], workspaceRoot, 'forge init');
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.audit
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.audit', async () => {
      const workspaceRoot = await requireWorkspace();
      if (!workspaceRoot) { return; }

      const channel = getChannel();
      channel.clear();
      channel.show(true);
      channel.appendLine('Running forge audit...\n');

      const [textResult, jsonResult] = await Promise.all([
        runForge(['audit'], workspaceRoot),
        runForge(['audit', '--json'], workspaceRoot),
      ]);

      channel.appendLine(textResult.stdout);
      if (textResult.stderr) {
        channel.appendLine('--- stderr ---');
        channel.appendLine(textResult.stderr);
      }

      let parsed: AuditJson = {};
      try { parsed = JSON.parse(jsonResult.stdout) as AuditJson; } catch { /* sin JSON */ }

      await refreshStatusBar(workspaceRoot);
      agentsProvider.refresh();

      const summary = parsed.summary;
      if (!summary) {
        vscode.window.showWarningMessage('forge: No se pudo parsear el resultado de la auditoría. Ver output channel.');
        return;
      }

      const { errors, warnings } = summary;

      if (errors > 0 || warnings > 0) {
        const label = errors > 0
          ? `forge: ${errors} error(es) y ${warnings} warning(s).`
          : `forge: ${warnings} warning(s) en la auditoría.`;
        const choice = await vscode.window.showWarningMessage(label, 'Ver output', 'Run Doctor');
        if (choice === 'Ver output') { channel.show(false); }
        if (choice === 'Run Doctor') { await vscode.commands.executeCommand('forge.doctor'); }
        return;
      }

      vscode.window.showInformationMessage('forge: Audit OK — todo conforme.');
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.doctor
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.doctor', async () => {
      const workspaceRoot = await requireWorkspace();
      if (!workspaceRoot) { return; }

      const channel = getChannel();
      channel.clear();
      channel.show(true);
      channel.appendLine('Running forge doctor...\n');

      const result = await runForge(['doctor'], workspaceRoot);
      reportResult(channel, result);

      if (result.code === 0) {
        vscode.window.showInformationMessage('forge: Doctor OK.');
      } else {
        vscode.window.showWarningMessage('forge: Doctor encontró problemas. Ver output channel.');
      }
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.generate  (runtime selection)
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.generate', async () => {
      const workspaceRoot = await requireWorkspace();
      if (!workspaceRoot) { return; }
      if (!(await requireProjectYaml(workspaceRoot))) { return; }

      const picks: vscode.QuickPickItem[] = [
        { label: 'auto-detect', description: 'detectar runtimes activos' },
        { label: 'claude-code' },
        { label: 'opencode' },
        { label: 'codex' },
        { label: 'kiro' },
        { label: 'all', description: 'todos los runtimes' },
      ];
      const selected = await vscode.window.showQuickPick(picks, {
        title: 'forge generate — selecciona runtime',
        placeHolder: 'Runtime para generar la config',
      });
      if (!selected) { return; }

      const channel = getChannel();
      channel.clear();
      channel.show(true);
      channel.appendLine(`Generating runtime config (${selected.label})...\n`);

      const args = selected.label === 'auto-detect'
        ? ['generate']
        : ['generate', '--runtime', selected.label];
      const result = await runForge(args, workspaceRoot);
      reportResult(channel, result);

      if (result.code === 0) {
        vscode.window.showInformationMessage(`forge: Config generada (${selected.label}).`);
        projectProvider.refresh();
        agentsProvider.refresh();
      } else {
        vscode.window.showErrorMessage('forge: Generate falló. Ver output channel.');
      }
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.validate
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.validate', async () => {
      const workspaceRoot = await requireWorkspace();
      if (!workspaceRoot) { return; }

      const channel = getChannel();
      channel.clear();
      channel.appendLine('Validating project.yaml...\n');

      const result = await runForge(['validate'], workspaceRoot);

      if (result.code === 0) {
        vscode.window.showInformationMessage('forge: project.yaml es válido.');
      } else {
        reportResult(channel, result);
        channel.show(true);
        vscode.window.showErrorMessage('forge: Validación de project.yaml falló. Ver output channel.');
      }
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.migrate
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.migrate', async () => {
      const workspaceRoot = await requireWorkspace();
      if (!workspaceRoot) { return; }
      if (!(await requireProjectYaml(workspaceRoot))) { return; }

      const confirm = await vscode.window.showWarningMessage(
        'forge: ¿Migrar project.yaml al esquema v2? Se creará un backup (project.yaml.bak).',
        'Migrar', 'Dry run', 'Cancelar'
      );
      if (confirm !== 'Migrar' && confirm !== 'Dry run') { return; }

      const channel = getChannel();
      channel.clear();
      channel.show(true);
      channel.appendLine(confirm === 'Dry run'
        ? 'Migrate (dry run)...\n'
        : 'Migrating project.yaml to v2...\n');

      const args = confirm === 'Dry run'
        ? ['migrate', '--dry-run']
        : ['migrate', '--backup'];
      const result = await runForge(args, workspaceRoot);
      reportResult(channel, result);

      if (result.code === 0) {
        if (confirm === 'Migrar') {
          vscode.window.showInformationMessage('forge: project.yaml migrado a v2.');
          projectProvider.refresh();
        }
      } else {
        vscode.window.showErrorMessage('forge: Migración falló. Ver output channel.');
      }
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.scaffold  (interactive prompts → terminal)
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.scaffold', async () => {
      const workspaceRoot = await requireWorkspace();
      if (!workspaceRoot) { return; }

      const tierPick = await vscode.window.showQuickPick(
        [
          { label: 'Tier 2', description: 'profile de stack', tier: '2' },
          { label: 'Tier 3', description: 'agente de dominio', tier: '3' },
        ],
        { title: 'forge scaffold — tier del agente', placeHolder: 'Selecciona el tier' }
      );
      if (!tierPick) { return; }

      const name = await vscode.window.showInputBox({
        prompt: tierPick.tier === '2' ? 'Slug del profile (ej: django)' : 'Nombre del agente (ej: dsar-specialist)',
        placeHolder: tierPick.tier === '2' ? 'django' : 'dsar-specialist',
      });
      if (!name) { return; }

      const args = ['scaffold', '--tier', tierPick.tier, '--name', name];

      if (tierPick.tier === '2') {
        const engineer = await vscode.window.showInputBox({
          prompt: 'Engineer agent (ej: api-engineer)',
          placeHolder: 'api-engineer',
        });
        if (!engineer) { return; }
        args.push('--engineer', engineer);
      } else {
        const scopeDir = await vscode.window.showInputBox({
          prompt: 'Directorio de scope (opcional)',
          placeHolder: 'src/dsar',
        });
        if (scopeDir) { args.push('--scope-dir', scopeDir); }
      }

      const description = await vscode.window.showInputBox({
        prompt: 'Descripción (opcional)',
      });
      if (description) { args.push('--description', description); }

      // Scaffold prints to stdout / writes files; run captured.
      const channel = getChannel();
      channel.clear();
      channel.show(true);
      channel.appendLine(`Scaffolding agent "${name}" (Tier ${tierPick.tier})...\n`);

      const result = await runForge(args, workspaceRoot);
      reportResult(channel, result);

      if (result.code === 0) {
        vscode.window.showInformationMessage(`forge: Agente "${name}" scaffolded.`);
        agentsProvider.refresh();
      } else {
        vscode.window.showErrorMessage('forge: Scaffold falló. Ver output channel.');
      }
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.skills  (list / search)
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.skills', async () => {
      const workspaceRoot = await requireWorkspace();
      if (!workspaceRoot) { return; }

      const result = await runForge(['skills', '--json'], workspaceRoot);
      let parsed: { skills?: SkillRow[]; total?: number; active?: number } = {};
      try { parsed = JSON.parse(result.stdout); } catch { /* sin JSON */ }

      const rows = parsed.skills ?? [];
      if (rows.length === 0) {
        const channel = getChannel();
        channel.clear();
        channel.show(true);
        reportResult(channel, result);
        vscode.window.showWarningMessage('forge: No se pudieron listar las skills. Ver output channel.');
        return;
      }

      const items: vscode.QuickPickItem[] = rows.map((s) => ({
        label: `${s.active ? '$(check) ' : ''}${s.command}`,
        description: s.category,
        detail: `${s.purpose}${s.trigger ? ' — ' + s.trigger : ''}`,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        title: `forge skills (${parsed.active ?? 0}/${parsed.total ?? rows.length} activas)`,
        placeHolder: 'Buscar skills por nombre, categoría o trigger',
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (picked) {
        const slug = picked.label.replace('$(check) ', '').trim();
        vscode.env.clipboard.writeText(slug);
        vscode.window.showInformationMessage(`forge: "${slug}" copiado al portapapeles.`);
      }
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.wikiStatus
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.wikiStatus', async () => {
      const workspaceRoot = await requireWorkspace();
      if (!workspaceRoot) { return; }

      const channel = getChannel();
      channel.clear();
      channel.show(true);
      channel.appendLine('forge wiki status...\n');

      const result = await runForge(['wiki', 'status'], workspaceRoot);
      reportResult(channel, result);
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.wikiInit
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.wikiInit', async () => {
      const workspaceRoot = await requireWorkspace();
      if (!workspaceRoot) { return; }

      const channel = getChannel();
      channel.clear();
      channel.show(true);
      channel.appendLine('forge wiki init...\n');

      const result = await runForge(['wiki', 'init'], workspaceRoot);
      reportResult(channel, result);

      if (result.code === 0) {
        vscode.window.showInformationMessage('forge: Estructura de wiki creada.');
      } else {
        vscode.window.showErrorMessage('forge: wiki init falló. Ver output channel.');
      }
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.searchCatalog  (aitmpl-search --json)
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.searchCatalog', async () => {
      const workspaceRoot = await requireWorkspace();
      if (!workspaceRoot) { return; }

      const query = await vscode.window.showInputBox({
        prompt: 'Buscar en el catálogo forge (frameworks, MCP servers, profiles, tools)',
        placeHolder: 'ej: postgres, nextjs, laravel, playwright…',
      });
      if (query === undefined) { return; }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'forge: buscando…', cancellable: false },
        async () => {
          const args = query.trim()
            ? ['aitmpl-search', query.trim(), '--json']
            : ['aitmpl-search', '--list-categories', '--json'];
          const result = await runForge(args, workspaceRoot);

          let parsed: unknown;
          try { parsed = JSON.parse(result.stdout); } catch { parsed = null; }

          const results = extractCatalogResults(parsed);
          if (results.length === 0) {
            vscode.window.showWarningMessage(`forge: Sin resultados para "${query}".`);
            return;
          }

          const items: vscode.QuickPickItem[] = results.map((r) => ({
            label: r.name,
            description: r.category,
            detail: r.description,
          }));

          const picked = await vscode.window.showQuickPick(items, {
            title: `forge catalog — "${query}" (${items.length} resultados)`,
            placeHolder: 'Selecciona para ver detalle / abrir URL',
            matchOnDetail: true,
            matchOnDescription: true,
          });

          if (!picked) { return; }
          const match = results.find(r => r.name === picked.label);
          if (!match?.url) {
            vscode.window.showInformationMessage(picked.label);
            return;
          }
          const openChoice = await vscode.window.showInformationMessage(
            picked.label, { modal: false }, 'Abrir URL', 'Copiar URL'
          );
          if (openChoice === 'Abrir URL') {
            vscode.env.openExternal(vscode.Uri.parse(match.url));
          } else if (openChoice === 'Copiar URL') {
            vscode.env.clipboard.writeText(match.url);
            vscode.window.showInformationMessage('URL copiada al portapapeles.');
          }
        }
      );
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.recommend  (stack-aware advisor, read-only, in a terminal)
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.recommend', async () => {
      const workspaceRoot = await requireWorkspace();
      if (!workspaceRoot) { return; }
      // Read-only by default; the user can re-run with --apply from the terminal.
      runForgeInTerminal(['recommend'], workspaceRoot, 'forge recommend');
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.showStatus
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.showStatus', async () => {
      const workspaceRoot = await requireWorkspace();
      if (!workspaceRoot) { return; }

      if (!findProjectYaml(workspaceRoot)) {
        const choice = await vscode.window.showInformationMessage(
          'forge: No hay project.yaml en este workspace.',
          'Init Wizard'
        );
        if (choice === 'Init Wizard') { await vscode.commands.executeCommand('forge.init'); }
        return;
      }

      const result = await runForge(['audit', '--json'], workspaceRoot);
      let summary: AuditSummary | null = null;
      try {
        const parsed = JSON.parse(result.stdout) as AuditJson;
        summary = parsed.summary ?? null;
      } catch {
        vscode.window.showErrorMessage(
          `forge: Error al parsear la auditoría. ${result.stderr || result.stdout}`
        );
        return;
      }

      const errors   = summary?.errors ?? 0;
      const warnings = summary?.warnings ?? 0;
      const ok       = summary?.ok ?? 0;

      const items: vscode.QuickPickItem[] = [
        { label: `$(check) ${ok} check(s) OK`,          kind: vscode.QuickPickItemKind.Default },
        { label: `$(warning) ${warnings} advertencia(s)`, kind: vscode.QuickPickItemKind.Default },
        { label: `$(error) ${errors} error(es)`,        kind: vscode.QuickPickItemKind.Default },
        { label: '', kind: vscode.QuickPickItemKind.Separator },
        { label: '$(output) Ver audit completo',        kind: vscode.QuickPickItemKind.Default },
        { label: '$(pulse) Run Doctor',                 kind: vscode.QuickPickItemKind.Default },
      ];

      const pick = await vscode.window.showQuickPick(items, {
        title: 'forge — status',
        placeHolder: 'Selecciona una acción',
      });

      if (pick?.label.includes('Ver audit')) { await vscode.commands.executeCommand('forge.audit'); }
      if (pick?.label.includes('Doctor'))    { await vscode.commands.executeCommand('forge.doctor'); }
    })
  );

  // -------------------------------------------------------------------------
  // Auto-audit on save
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      const config = vscode.workspace.getConfiguration('forge');
      if (!config.get<boolean>('autoAuditOnSave', false)) { return; }
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) { return; }
      const agentsDir = path.join(workspaceRoot, '.claude', 'agents');
      const docPath = doc.uri.fsPath;
      const isAgent = docPath.startsWith(agentsDir) && docPath.endsWith('.md');
      const isProjectYaml = docPath === path.join(workspaceRoot, 'project.yaml');
      if (!isAgent && !isProjectYaml) { return; }
      await refreshStatusBar(workspaceRoot);
      agentsProvider.refresh();
    })
  );
}

// ---------------------------------------------------------------------------
// Skill row shape (from `forge skills --json`)
// ---------------------------------------------------------------------------

interface SkillRow {
  id: string;
  command: string;
  category: string;
  purpose: string;
  trigger: string;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Catalog result extraction (from `forge aitmpl-search --json`)
//
// The JSON shape is tolerant: we accept an array of entries or an object whose
// values/`results` field contain entries. Each entry contributes name +
// optional category/description/url.
// ---------------------------------------------------------------------------

interface CatalogResult {
  name: string;
  category: string;
  description: string;
  url: string;
}

function extractCatalogResults(parsed: unknown): CatalogResult[] {
  if (!parsed) { return []; }

  const rawEntries: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { results?: unknown[] }).results)
      ? (parsed as { results: unknown[] }).results
      : typeof parsed === 'object'
        ? Object.values(parsed as Record<string, unknown>).flatMap(v => Array.isArray(v) ? v : [])
        : [];

  const out: CatalogResult[] = [];
  for (const e of rawEntries) {
    if (!e || typeof e !== 'object') { continue; }
    const obj = e as Record<string, unknown>;
    // The unified catalog (SPEC-050) exposes `label`/`id`; older output used `name`.
    const name = String(obj.label ?? obj.name ?? obj.title ?? obj.slug ?? obj.id ?? '').trim();
    if (!name) { continue; }
    out.push({
      name,
      category: String(obj.category ?? obj.type ?? '').trim(),
      description: String(obj.description ?? obj.detail ?? '').trim(),
      url: String(obj.url ?? obj.repository ?? '').trim(),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------

export function deactivate(): void {
  forgeChannel?.dispose();
}
