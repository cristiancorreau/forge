import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FORGE_MARKER = path.join('scripts', 'forge-wizard.py');

function isForgeRoot(dir: string): boolean {
  return fs.existsSync(path.join(dir, FORGE_MARKER));
}

function findForgeDir(workspaceRoot: string): string | null {
  // El workspace mismo es el repo de forge
  if (isForgeRoot(workspaceRoot)) {
    return workspaceRoot;
  }
  // Submodule como .agentic/ o forge/
  for (const candidate of ['.agentic', 'forge']) {
    const full = path.join(workspaceRoot, candidate);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory() && isForgeRoot(full)) {
      return full;
    }
  }
  return null;
}

function findProjectYaml(workspaceRoot: string): boolean {
  return fs.existsSync(path.join(workspaceRoot, 'project.yaml'));
}

function resolveForgeDir(workspaceRoot: string): string | null {
  const config = vscode.workspace.getConfiguration('forge');
  const forgePath = config.get<string>('forgePath', '.agentic');

  // Ruta explícita en settings (puede ser absoluta o relativa)
  const explicit = path.isAbsolute(forgePath)
    ? forgePath
    : path.join(workspaceRoot, forgePath);
  if (fs.existsSync(explicit) && isForgeRoot(explicit)) {
    return explicit;
  }

  return findForgeDir(workspaceRoot);
}

async function requireForgeDir(workspaceRoot: string): Promise<string | null> {
  const forgeDir = resolveForgeDir(workspaceRoot);
  if (forgeDir) { return forgeDir; }

  const choice = await vscode.window.showErrorMessage(
    'forge no está instalado en este proyecto. Instálalo como git submodule en .agentic/',
    'Ver instrucciones',
    'Seleccionar carpeta forge…'
  );

  if (choice === 'Ver instrucciones') {
    vscode.env.openExternal(vscode.Uri.parse('https://github.com/socialwebcl/forge#instalaci%C3%B3n'));
  } else if (choice === 'Seleccionar carpeta forge…') {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Seleccionar carpeta de forge',
    });
    if (picked && picked[0]) {
      const selected = picked[0].fsPath;
      if (isForgeRoot(selected)) {
        // Guardar en settings para la próxima vez
        const rel = path.relative(workspaceRoot, selected);
        await vscode.workspace.getConfiguration('forge').update(
          'forgePath', rel, vscode.ConfigurationTarget.Workspace
        );
        return selected;
      } else {
        vscode.window.showErrorMessage('La carpeta seleccionada no parece ser una instalación de forge (falta scripts/forge-wizard.py).');
      }
    }
  }
  return null;
}

function getWorkspaceRoot(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return null;
  }
  return folders[0].uri.fsPath;
}

function runForgeCommand(
  command: string[],
  workspaceRoot: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const proc = spawn(command[0], command.slice(1), {
      cwd: workspaceRoot,
      env: process.env,
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
  private installed: boolean;

  constructor(installed: boolean) {
    this.installed = installed;
  }

  setInstalled(val: boolean): void {
    this.installed = val;
    this.refresh();
  }

  refresh(): void { this._onDidChangeTreeData.fire(); }

  getTreeItem(el: ForgeActionItem): vscode.TreeItem { return el; }

  getChildren(): ForgeActionItem[] {
    if (!this.installed) { return []; }
    return [
      new ForgeActionItem('Setup Wizard',     'forge.openWizard',       'wand',         'create / update project.yaml'),
      new ForgeActionItem('Initialize',       'forge.init',             'tools',         'agents + CLAUDE.md + settings.json'),
      new ForgeActionItem('Regenerate CLAUDE.md', 'forge.generateClaudeMd', 'file-text', 'refresh CLAUDE.md from project.yaml'),
      new ForgeActionItem('Run Audit',        'forge.audit',            'check',        'verify agent conformance'),
      new ForgeActionItem('Audit Agent…',     'forge.auditAgent',       'person',       'audit a single agent'),
      new ForgeActionItem('Search Catalog',   'forge.searchCatalog',    'search',       'MCP servers & profiles'),
      new ForgeActionItem('Show Status',      'forge.showStatus',       'info',         'audit summary'),
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
// Output channels
// ---------------------------------------------------------------------------

let auditChannel: vscode.OutputChannel | undefined;
let initChannel: vscode.OutputChannel | undefined;

function getAuditChannel(): vscode.OutputChannel {
  if (!auditChannel) { auditChannel = vscode.window.createOutputChannel('forge Audit'); }
  return auditChannel;
}

function getInitChannel(): vscode.OutputChannel {
  if (!initChannel) { initChannel = vscode.window.createOutputChannel('forge Init'); }
  return initChannel;
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

  const root = getWorkspaceRoot();
  const forgeInstalled = root ? resolveForgeDir(root) !== null : false;
  const hasProjectYaml = root ? findProjectYaml(root) : false;

  updateStatusBar('idle');
  vscode.commands.executeCommand('setContext', 'forge.installed', forgeInstalled);
  vscode.commands.executeCommand('setContext', 'forge.active', hasProjectYaml);

  // Providers
  const actionsProvider = new ForgeActionsProvider(forgeInstalled);
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
    watcher.onDidChange(() => {
      projectProvider.refresh();
      vscode.commands.executeCommand('setContext', 'forge.active', true);
      updateStatusBar('idle');
      statusBarItem.show();
    });
    watcher.onDidCreate(() => {
      projectProvider.refresh();
      vscode.commands.executeCommand('setContext', 'forge.active', true);
      updateStatusBar('idle');
      statusBarItem.show();
    });
    context.subscriptions.push(watcher);

    // Watch for forge installation (submodule add)
    const forgeMarkerWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(root, '.agentic/scripts/forge-wizard.py')
    );
    forgeMarkerWatcher.onDidCreate(async () => {
      vscode.commands.executeCommand('setContext', 'forge.installed', true);
      actionsProvider.setInstalled(true);
      const choice = await vscode.window.showInformationMessage(
        'forge instalado correctamente. Ejecuta Setup Wizard para configurar el proyecto.',
        'Setup Wizard'
      );
      if (choice === 'Setup Wizard') {
        vscode.commands.executeCommand('forge.openWizard');
      }
    });
    context.subscriptions.push(forgeMarkerWatcher);
  }

  // -------------------------------------------------------------------------
  // Command: forge.openWizard
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.openWizard', async () => {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('forge: No workspace open.');
        return;
      }
      const forgeDir = await requireForgeDir(workspaceRoot);
      if (!forgeDir) { return; }

      const wizardScript = path.join(forgeDir, 'scripts', 'forge-wizard.py');
      const terminal = vscode.window.createTerminal({
        name: 'forge wizard',
        cwd: workspaceRoot,
      });
      terminal.show();
      terminal.sendText(`python3 "${wizardScript}"`);
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.init
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.init', async () => {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('forge: No workspace open.');
        return;
      }
      const forgeDir = await requireForgeDir(workspaceRoot);
      if (!forgeDir) { return; }

      if (!findProjectYaml(workspaceRoot)) {
        const choice = await vscode.window.showWarningMessage(
          'forge: No hay project.yaml. ¿Quieres ejecutar el wizard primero?',
          'Run Wizard', 'Cancelar'
        );
        if (choice === 'Run Wizard') {
          await vscode.commands.executeCommand('forge.openWizard');
        }
        return;
      }

      const config = vscode.workspace.getConfiguration('forge');
      const tool = config.get<string>('tool', 'claude-code');

      const channel = getInitChannel();
      channel.clear();
      channel.show(true);
      channel.appendLine(`Initializing forge project for tool: ${tool}\n`);

      const initScript = path.join(forgeDir, 'scripts', 'forge-init.py');
      const result = await runForgeCommand(
        ['python3', initScript, '--tool', tool, '--forge', forgeDir],
        workspaceRoot
      );

      channel.appendLine(result.stdout);
      if (result.stderr) {
        channel.appendLine('--- stderr ---');
        channel.appendLine(result.stderr);
      }
      if (result.code !== 0) {
        channel.appendLine(`\nProcess exited with code ${result.code}`);
        vscode.window.showErrorMessage(`forge init failed. Check the 'forge Init' output channel.`);
      } else {
        vscode.window.showInformationMessage('forge: Project initialized successfully.');
        projectProvider.refresh();
        agentsProvider.refresh();
        vscode.commands.executeCommand('setContext', 'forge.active', true);
        await refreshStatusBar(workspaceRoot, forgeDir);
      }
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.audit
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.audit', async () => {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('forge: No workspace open.');
        return;
      }
      const forgeDir = await requireForgeDir(workspaceRoot);
      if (!forgeDir) { return; }

      const channel = getAuditChannel();
      channel.clear();
      channel.show(true);
      channel.appendLine('Running forge audit...\n');

      const auditScript = path.join(forgeDir, 'scripts', 'forge-audit.py');

      // Ejecutar audit normal (output legible) y JSON (para parsear acciones)
      const [textResult, jsonResult] = await Promise.all([
        runForgeCommand(['python3', auditScript, '--forge', forgeDir], workspaceRoot),
        runForgeCommand(['python3', auditScript, '--json', '--forge', forgeDir], workspaceRoot),
      ]);

      channel.appendLine(textResult.stdout);
      if (textResult.stderr) {
        channel.appendLine('--- stderr ---');
        channel.appendLine(textResult.stderr);
      }

      // Parsear resumen y oportunidades del JSON
      let parsed: {
        error?: string; error_code?: string; hint?: string;
        summary?: AuditSummary;
        opportunities?: AuditOpportunity[];
      } = {};
      try { parsed = JSON.parse(jsonResult.stdout); } catch { /* sin JSON */ }

      await refreshStatusBar(workspaceRoot, forgeDir);
      agentsProvider.refresh();

      // Error estructurado del script
      if (parsed.error_code === 'NO_PROJECT_YAML') {
        const choice = await vscode.window.showWarningMessage(
          'forge: No hay project.yaml en este proyecto. Configura forge primero.',
          'Run Setup Wizard', 'Ver output'
        );
        if (choice === 'Run Setup Wizard') { await vscode.commands.executeCommand('forge.openWizard'); }
        if (choice === 'Ver output')       { channel.show(false); }
        return;
      }

      const summary = parsed.summary;
      if (!summary) { return; }

      const { errors = 0, warnings = 0, orphans = 0, agents_total = 0 } = summary;
      const opportunities = (parsed.opportunities ?? []).filter(
        (o: AuditOpportunity) => (o.type === 'profile' || o.type === 'skill') && o.slug
      );

      // Sin agentes instalados → ofrecer inicializar
      if (agents_total === 0) {
        const choice = await vscode.window.showWarningMessage(
          'forge: No hay agentes instalados en este proyecto.',
          'Initialize Agents', 'Run Setup Wizard'
        );
        if (choice === 'Initialize Agents') { await vscode.commands.executeCommand('forge.init'); }
        if (choice === 'Run Setup Wizard')  { await vscode.commands.executeCommand('forge.openWizard'); }
        return;
      }

      // Hay errores/warnings → ofrecer fix
      if (errors > 0 || warnings > 0 || orphans > 0) {
        const actions: string[] = [];
        if (errors > 0 || warnings > 0) { actions.push('Re-initialize Agents'); }
        if (orphans > 0)                { actions.push('Run Setup Wizard'); }
        if (opportunities.length > 0)  { actions.push('Agregar profiles/skills…'); }
        actions.push('Ver output');

        const label = errors > 0
          ? `forge: ${errors} error(s) y ${warnings} warning(s).`
          : `forge: ${warnings} warning(s) en los agentes.`;

        const choice = await vscode.window.showWarningMessage(label, ...actions);
        if (choice === 'Re-initialize Agents')  { await vscode.commands.executeCommand('forge.init'); }
        if (choice === 'Run Setup Wizard')       { await vscode.commands.executeCommand('forge.openWizard'); }
        if (choice === 'Ver output')             { channel.show(false); }
        if (choice === 'Agregar profiles/skills…') {
          await showOpportunitiesPicker(opportunities, workspaceRoot, forgeDir);
        }
        return;
      }

      // Todo OK — si hay oportunidades, ofrecer seleccionarlas
      if (opportunities.length > 0) {
        const choice = await vscode.window.showInformationMessage(
          `forge: Audit OK — ${opportunities.length} oportunidad(es) disponible(s).`,
          'Ver y agregar…', 'Cerrar'
        );
        if (choice === 'Ver y agregar…') {
          await showOpportunitiesPicker(opportunities, workspaceRoot, forgeDir);
        }
      } else {
        vscode.window.showInformationMessage('forge: Audit OK — todo conforme.');
      }
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.auditAgent
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.auditAgent', async () => {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('forge: No workspace open.');
        return;
      }
      const forgeDir = await requireForgeDir(workspaceRoot);
      if (!forgeDir) { return; }

      const agentsDir = path.join(workspaceRoot, '.claude', 'agents');
      if (!fs.existsSync(agentsDir)) {
        vscode.window.showErrorMessage('forge: No hay agentes en .claude/agents/.');
        return;
      }

      const agentFiles = fs.readdirSync(agentsDir).filter((f: string) => f.endsWith('.md'));
      if (agentFiles.length === 0) {
        vscode.window.showInformationMessage('forge: No se encontraron agentes.');
        return;
      }

      const picks = agentFiles.map((f: string) => ({
        label: path.basename(f, '.md'),
        description: f,
      }));
      const selected = await vscode.window.showQuickPick(picks, {
        placeHolder: 'Selecciona un agente para auditar',
        matchOnDescription: true,
      });
      if (!selected) { return; }

      const channel = getAuditChannel();
      channel.clear();
      channel.show(true);
      channel.appendLine(`Auditing agent: ${selected.label}\n`);

      const auditScript = path.join(forgeDir, 'scripts', 'forge-audit.py');
      const result = await runForgeCommand(
        ['python3', auditScript, `--only=${selected.label}`, '--forge', forgeDir],
        workspaceRoot
      );

      channel.appendLine(result.stdout);
      if (result.stderr) {
        channel.appendLine('--- stderr ---');
        channel.appendLine(result.stderr);
      }
      if (result.code !== 0) {
        channel.appendLine(`\nProcess exited with code ${result.code}`);
      }
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.showStatus
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.showStatus', async () => {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('forge: No workspace open.');
        return;
      }
      const forgeDir = await requireForgeDir(workspaceRoot);
      if (!forgeDir) { return; }

      const auditScript = path.join(forgeDir, 'scripts', 'forge-audit.py');
      const result = await runForgeCommand(['python3', auditScript, '--json'], workspaceRoot);

      let summary: AuditSummary | null = null;
      try {
        const parsed = JSON.parse(result.stdout);
        summary = parsed.summary as AuditSummary;
      } catch {
        vscode.window.showErrorMessage(
          `forge: Error al parsear la auditoría. ${result.stderr || result.stdout}`
        );
        return;
      }

      const errors    = summary?.errors ?? 0;
      const warnings  = summary?.warnings ?? 0;
      const conforming = summary?.conforming ?? 0;

      const items: vscode.QuickPickItem[] = [
        { label: `$(check) ${conforming} agente(s) conformes`,    kind: vscode.QuickPickItemKind.Default },
        { label: `$(warning) ${warnings} advertencia(s)`,         kind: vscode.QuickPickItemKind.Default },
        { label: `$(error) ${errors} error(es)`,                  kind: vscode.QuickPickItemKind.Default },
        { label: '', kind: vscode.QuickPickItemKind.Separator },
        { label: '$(output) Ver audit completo',                  kind: vscode.QuickPickItemKind.Default },
        { label: '$(wand) Abrir Setup Wizard',                    kind: vscode.QuickPickItemKind.Default },
      ];

      const pick = await vscode.window.showQuickPick(items, {
        title: `forge — ${summary?.project_name ?? 'status'}`,
        placeHolder: 'Selecciona una acción',
      });

      if (pick?.label.includes('Ver audit'))   { await vscode.commands.executeCommand('forge.audit'); }
      if (pick?.label.includes('Setup Wizard')) { await vscode.commands.executeCommand('forge.openWizard'); }
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.searchCatalog
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.searchCatalog', async () => {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('forge: No workspace open.');
        return;
      }
      const forgeDir = await requireForgeDir(workspaceRoot);
      if (!forgeDir) { return; }

      // Pedir query al usuario
      const query = await vscode.window.showInputBox({
        prompt: 'Buscar en el catálogo forge (MCP servers, profiles, frameworks, tools)',
        placeHolder: 'ej: postgres, nextjs, laravel, playwright…',
      });
      if (query === undefined) { return; }

      const searchScript = path.join(forgeDir, 'scripts', 'aitmpl-search.py');

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'forge: buscando…', cancellable: false },
        async () => {
          const args = query.trim() ? ['python3', searchScript, query.trim()]
                                    : ['python3', searchScript, '--list-categories'];
          const result = await runForgeCommand(args, workspaceRoot);

          if (result.code !== 0 || !result.stdout.trim()) {
            vscode.window.showWarningMessage(`forge: Sin resultados para "${query}".`);
            return;
          }

          // Parsear resultados de texto → QuickPick items
          const lines = result.stdout.split('\n');
          const items: vscode.QuickPickItem[] = [];
          let current: { label: string; detail: string; url: string } | null = null;

          for (const line of lines) {
            // Línea de título: " 1. nombre del item"
            const titleMatch = line.match(/^\s+\d+\.\s+(.+)$/);
            if (titleMatch) {
              if (current) { items.push({ label: current.label, detail: current.detail, description: current.url }); }
              current = { label: titleMatch[1].trim(), detail: '', url: '' };
              continue;
            }
            if (!current) { continue; }
            // URL
            if (line.trim().startsWith('http')) { current.url = line.trim(); continue; }
            // Descripción / tags (acumular en detail)
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('[') && !trimmed.startsWith('#')) {
              current.detail += (current.detail ? ' ' : '') + trimmed;
            }
          }
          if (current) { items.push({ label: current.label, detail: current.detail, description: current.url }); }

          if (items.length === 0) {
            vscode.window.showInformationMessage(`forge: Sin resultados para "${query}".`);
            return;
          }

          const picked = await vscode.window.showQuickPick(items, {
            title: `forge catalog — "${query}" (${items.length} resultados)`,
            placeHolder: 'Selecciona para abrir la URL',
            matchOnDetail: true,
            matchOnDescription: true,
          });

          if (picked?.description) {
            const openChoice = await vscode.window.showInformationMessage(
              `${picked.label}`,
              { modal: false },
              'Abrir URL',
              'Copiar URL'
            );
            if (openChoice === 'Abrir URL') {
              vscode.env.openExternal(vscode.Uri.parse(picked.description));
            } else if (openChoice === 'Copiar URL') {
              vscode.env.clipboard.writeText(picked.description);
              vscode.window.showInformationMessage('URL copiada al portapapeles.');
            }
          }
        }
      );
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.install
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.install', async () => {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('forge: No workspace open.');
        return;
      }

      const gitDir = path.join(workspaceRoot, '.git');
      if (!fs.existsSync(gitDir)) {
        const choice = await vscode.window.showErrorMessage(
          'forge: Este directorio no es un repositorio git. forge se instala como git submodule.',
          'Inicializar git repo primero'
        );
        if (choice === 'Inicializar git repo primero') {
          const terminal = vscode.window.createTerminal({ name: 'forge install', cwd: workspaceRoot });
          terminal.show();
          terminal.sendText('git init && git submodule add https://github.com/socialwebcl/forge .agentic && git submodule update --init --recursive');
        }
        return;
      }

      const terminal = vscode.window.createTerminal({ name: 'forge install', cwd: workspaceRoot });
      terminal.show();
      terminal.sendText('git submodule add https://github.com/socialwebcl/forge .agentic && git submodule update --init --recursive');
      vscode.window.showInformationMessage(
        'forge: Instalando en .agentic/ — el panel se actualizará automáticamente al terminar.'
      );
    })
  );

  // -------------------------------------------------------------------------
  // Command: forge.generateClaudeMd
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.generateClaudeMd', async () => {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('forge: No workspace open.');
        return;
      }
      const forgeDir = await requireForgeDir(workspaceRoot);
      if (!forgeDir) { return; }

      if (!findProjectYaml(workspaceRoot)) {
        const choice = await vscode.window.showWarningMessage(
          'forge: No hay project.yaml. ¿Quieres ejecutar el wizard primero?',
          'Run Wizard', 'Cancelar'
        );
        if (choice === 'Run Wizard') {
          await vscode.commands.executeCommand('forge.openWizard');
        }
        return;
      }

      const channel = getInitChannel();
      channel.clear();
      channel.show(true);
      channel.appendLine('Generating CLAUDE.md from project.yaml...\n');

      const generatorScript = path.join(forgeDir, 'adapters', 'claude-code', 'generate-claude-md.py');
      const result = await runForgeCommand(
        ['python3', generatorScript, '--force'],
        workspaceRoot
      );

      channel.appendLine(result.stdout);
      if (result.stderr) {
        channel.appendLine('--- stderr ---');
        channel.appendLine(result.stderr);
      }

      if (result.code !== 0) {
        vscode.window.showErrorMessage('forge: Error al generar CLAUDE.md. Ver output channel.');
      } else {
        vscode.window.showInformationMessage('forge: CLAUDE.md generado correctamente.');
        projectProvider.refresh();
      }
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
      if (!docPath.startsWith(agentsDir) || !docPath.endsWith('.md')) { return; }
      const forgeDir = resolveForgeDir(workspaceRoot);
      if (!forgeDir) { return; }
      await refreshStatusBar(workspaceRoot, forgeDir);
      agentsProvider.refresh();
    })
  );
}

// ---------------------------------------------------------------------------
// Opportunities picker (multi-select QuickPick → apply to project.yaml)
// ---------------------------------------------------------------------------

interface AuditSummary {
  project_name?: string;
  agents_total: number;
  agents_declared: number;
  ok: number;
  errors: number;
  warnings: number;
  conforming: number;
  orphans: number;
}

interface AuditOpportunity {
  type: 'profile' | 'skill' | 'integration' | 'config' | 'wiki';
  slug?: string;
  msg: string;
  fix?: string;
}

async function showOpportunitiesPicker(
  opportunities: AuditOpportunity[],
  workspaceRoot: string,
  forgeDir: string
): Promise<void> {
  const profileOpps = opportunities.filter(o => o.type === 'profile');
  const skillOpps   = opportunities.filter(o => o.type === 'skill');

  const items: (vscode.QuickPickItem & { opp: AuditOpportunity })[] = [];

  if (profileOpps.length > 0) {
    items.push({ label: 'Profiles de stack', kind: vscode.QuickPickItemKind.Separator, opp: null! });
    for (const o of profileOpps) {
      const detail = o.msg.includes('→ provee:') ? o.msg.split('→ provee:')[1].trim() : o.msg;
      items.push({ label: o.slug!, description: 'profile', detail, opp: o, picked: false });
    }
  }

  if (skillOpps.length > 0) {
    items.push({ label: 'Skills disponibles', kind: vscode.QuickPickItemKind.Separator, opp: null! });
    for (const o of skillOpps) {
      items.push({ label: o.slug!, description: 'skill', detail: o.msg, opp: o, picked: false });
    }
  }

  const selected = await vscode.window.showQuickPick(
    items.filter(i => i.kind !== vscode.QuickPickItemKind.Separator),
    {
      title: `forge — Oportunidades disponibles (${opportunities.length})`,
      placeHolder: 'Seleccioná los profiles/skills a agregar a project.yaml',
      canPickMany: true,
      matchOnDescription: true,
      matchOnDetail: true,
    }
  );

  if (!selected || selected.length === 0) { return; }

  const profilesToAdd = selected.filter(i => i.opp.type === 'profile').map(i => i.opp.slug!);
  const skillsToAdd   = selected.filter(i => i.opp.type === 'skill').map(i => i.opp.slug!);

  // Aplicar cambios a project.yaml via script Python auxiliar
  const applyScript = path.join(forgeDir, 'scripts', 'forge-add-opportunities.py');
  const args = ['python3', applyScript];
  if (profilesToAdd.length > 0) { args.push('--profiles', ...profilesToAdd); }
  if (skillsToAdd.length > 0)   { args.push('--skills',   ...skillsToAdd); }

  const result = await runForgeCommand(args, workspaceRoot);

  if (result.code !== 0) {
    vscode.window.showErrorMessage(`forge: Error al actualizar project.yaml.\n${result.stderr}`);
    return;
  }

  const added = [...profilesToAdd, ...skillsToAdd].join(', ');
  const choice = await vscode.window.showInformationMessage(
    `forge: Agregado a project.yaml: ${added}`,
    'Initialize Agents', 'Cerrar'
  );
  if (choice === 'Initialize Agents') {
    await vscode.commands.executeCommand('forge.init');
  }
}

// ---------------------------------------------------------------------------
// Refresh status bar from JSON audit
// ---------------------------------------------------------------------------

async function refreshStatusBar(workspaceRoot: string, forgeDir: string): Promise<void> {
  const auditScript = path.join(forgeDir, 'scripts', 'forge-audit.py');
  const result = await runForgeCommand(['python3', auditScript, '--json', '--forge', forgeDir], workspaceRoot);
  try {
    const parsed = JSON.parse(result.stdout);
    const summary = parsed.summary as AuditSummary;
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

export function deactivate(): void {
  auditChannel?.dispose();
  initChannel?.dispose();
}
