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
// ---------------------------------------------------------------------------

function parseSimpleYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const patterns: Record<string, RegExp> = {
    projectName: /^\s{2}name:\s*["']?(.+?)["']?\s*$/m,
    mode: /^mode:\s*["']?(.+?)["']?\s*$/m,
    stack: /^stack:\s*["']?(.+?)["']?\s*$/m,
    backend: /^backend:\s*["']?(.+?)["']?\s*$/m,
    frontend: /^frontend:\s*["']?(.+?)["']?\s*$/m,
    runtime: /^runtime:\s*["']?(.+?)["']?\s*$/m,
    language: /^language:\s*["']?(.+?)["']?\s*$/m,
    deploy: /^deploy:\s*["']?(.+?)["']?\s*$/m,
  };
  for (const [key, re] of Object.entries(patterns)) {
    const m = content.match(re);
    if (m) {
      result[key] = m[1].trim();
    }
  }
  const projectBlock = content.match(/^project:\s*\n((?:[ \t]+.+\n?)*)/m);
  if (projectBlock) {
    const nameInBlock = projectBlock[1].match(/^\s+name:\s*["']?(.+?)["']?\s*$/m);
    if (nameInBlock) {
      result['projectName'] = nameInBlock[1].trim();
    }
  }
  const profilesMatch = content.match(/^profiles:\s*\n((?:\s+-\s+.+\n?)+)/m);
  if (profilesMatch) {
    const items = profilesMatch[1].match(/^\s+-\s+(.+)$/gm) ?? [];
    result['profiles'] = items.map((l) => l.replace(/^\s+-\s+/, '').trim()).join(', ');
  }
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
      new ForgeActionItem('Setup Wizard',   'forge.openWizard',    'wand',   'create / update project.yaml'),
      new ForgeActionItem('Initialize',     'forge.init',          'tools',  'sync agents from project.yaml'),
      new ForgeActionItem('Run Audit',      'forge.audit',         'check',  'verify agent conformance'),
      new ForgeActionItem('Audit Agent…',   'forge.auditAgent',    'person', 'audit a single agent'),
      new ForgeActionItem('Search Catalog', 'forge.searchCatalog', 'search', 'MCP servers & profiles'),
      new ForgeActionItem('Show Status',    'forge.showStatus',    'info',   'audit summary'),
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

    if (data['projectName']) { items.push(new ForgeProjectItem('Name',     data['projectName'], 'tag')); }
    if (data['mode'])        { items.push(new ForgeProjectItem('Mode',     data['mode'],        'symbol-enum')); }
    if (data['runtime'])     { items.push(new ForgeProjectItem('Runtime',  data['runtime'],     'server')); }
    if (data['backend'])     { items.push(new ForgeProjectItem('Backend',  data['backend'],     'database')); }
    if (data['frontend'])    { items.push(new ForgeProjectItem('Frontend', data['frontend'],    'browser')); }
    if (data['deploy'])      { items.push(new ForgeProjectItem('Deploy',   data['deploy'],      'cloud')); }
    if (data['language'])    { items.push(new ForgeProjectItem('Language', data['language'],    'symbol-namespace')); }
    if (data['profiles'])    { items.push(new ForgeProjectItem('Profiles', data['profiles'],   'extensions')); }

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
  const isForgeProject = root ? (findProjectYaml(root) || findForgeDir(root) !== null) : false;

  if (isForgeProject) {
    updateStatusBar('idle');
    vscode.commands.executeCommand('setContext', 'forge.active', true);
  } else {
    updateStatusBar('idle');
    vscode.commands.executeCommand('setContext', 'forge.active', false);
  }

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

      // Parsear resumen y ofrecer acciones contextuales
      let parsed: { error?: string; error_code?: string; hint?: string; summary?: AuditSummary } = {};
      try {
        parsed = JSON.parse(jsonResult.stdout);
      } catch { /* sin JSON */ }

      await refreshStatusBar(workspaceRoot, forgeDir);
      agentsProvider.refresh();

      // Error estructurado del script
      if (parsed.error_code === 'NO_PROJECT_YAML') {
        const choice = await vscode.window.showWarningMessage(
          'forge: No hay project.yaml en este proyecto. Configura forge primero.',
          'Run Setup Wizard',
          'Ver output'
        );
        if (choice === 'Run Setup Wizard') { await vscode.commands.executeCommand('forge.openWizard'); }
        if (choice === 'Ver output')       { channel.show(false); }
        return;
      }

      const summary = parsed.summary;
      if (!summary) { return; }

      const { errors = 0, warnings = 0, orphans = 0, agents_total = 0 } = summary;

      // Sin agentes instalados → ofrecer inicializar
      if (agents_total === 0) {
        const choice = await vscode.window.showWarningMessage(
          'forge: No hay agentes instalados en este proyecto.',
          'Initialize Agents',
          'Run Setup Wizard'
        );
        if (choice === 'Initialize Agents') { await vscode.commands.executeCommand('forge.init'); }
        if (choice === 'Run Setup Wizard')  { await vscode.commands.executeCommand('forge.openWizard'); }
        return;
      }

      // Hay errores o warnings → ofrecer acciones concretas
      if (errors > 0 || warnings > 0 || orphans > 0) {
        const actions: string[] = [];
        if (errors > 0 || warnings > 0) { actions.push('Re-initialize Agents (fix drift)'); }
        if (orphans > 0)                { actions.push('Run Setup Wizard (add missing agents)'); }
        actions.push('Ver audit completo');

        const label = errors > 0
          ? `forge: ${errors} error(s) y ${warnings} warning(s) en los agentes.`
          : `forge: ${warnings} warning(s) en los agentes.`;

        const choice = await vscode.window.showWarningMessage(label, ...actions);
        if (choice === 'Re-initialize Agents (fix drift)')      { await vscode.commands.executeCommand('forge.init'); }
        if (choice === 'Run Setup Wizard (add missing agents)') { await vscode.commands.executeCommand('forge.openWizard'); }
        if (choice === 'Ver audit completo')                    { channel.show(false); }
      } else {
        vscode.window.showInformationMessage(`forge: Audit OK — todos los agentes conformes.`);
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
// Refresh status bar from JSON audit
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
