import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findForgeDir(workspaceRoot: string): string | null {
  for (const candidate of ['.agentic', 'forge']) {
    const full = path.join(workspaceRoot, candidate);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
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
  const override = path.join(workspaceRoot, forgePath);
  if (fs.existsSync(override)) {
    return override;
  }
  return findForgeDir(workspaceRoot);
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
  };
  for (const [key, re] of Object.entries(patterns)) {
    const m = content.match(re);
    if (m) {
      result[key] = m[1].trim();
    }
  }
  // Extract project.name (nested under 'project:')
  const projectBlock = content.match(/^project:\s*\n((?:[ \t]+.+\n?)*)/m);
  if (projectBlock) {
    const nameInBlock = projectBlock[1].match(/^\s+name:\s*["']?(.+?)["']?\s*$/m);
    if (nameInBlock) {
      result['projectName'] = nameInBlock[1].trim();
    }
  }
  // Extract profiles list (simple: profiles:\n  - foo)
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
// Tree view: Project
// ---------------------------------------------------------------------------

class ForgeProjectItem extends vscode.TreeItem {
  constructor(label: string, description?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    if (description) {
      this.description = description;
    }
  }
}

class ForgeProjectProvider implements vscode.TreeDataProvider<ForgeProjectItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ForgeProjectItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ForgeProjectItem): vscode.TreeItem {
    return element;
  }

  getChildren(): ForgeProjectItem[] {
    const root = getWorkspaceRoot();
    if (!root) {
      return [new ForgeProjectItem('No workspace open')];
    }
    const yamlPath = path.join(root, 'project.yaml');
    if (!fs.existsSync(yamlPath)) {
      return [new ForgeProjectItem('project.yaml not found')];
    }
    const content = fs.readFileSync(yamlPath, 'utf8');
    const data = parseSimpleYaml(content);
    const items: ForgeProjectItem[] = [];
    if (data['projectName']) {
      items.push(new ForgeProjectItem('Name', data['projectName']));
    }
    if (data['mode']) {
      items.push(new ForgeProjectItem('Mode', data['mode']));
    }
    if (data['stack']) {
      items.push(new ForgeProjectItem('Stack', data['stack']));
    }
    if (data['profiles']) {
      items.push(new ForgeProjectItem('Profiles', data['profiles']));
    }
    if (items.length === 0) {
      items.push(new ForgeProjectItem('project.yaml loaded'));
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
    // Derive tier from filename prefix or content (best-effort)
    const tier = ForgeAgentItem.detectTier(filePath);
    this.iconPath = ForgeAgentItem.iconForTier(tier);
    this.tooltip = `Agent: ${label} (tier ${tier})`;
  }

  private static detectTier(filePath: string): number {
    try {
      const content = fs.readFileSync(filePath, 'utf8').slice(0, 1000);
      const m = content.match(/tier[:\s]+(\d)/i);
      if (m) {
        return parseInt(m[1], 10);
      }
    } catch {
      // ignore
    }
    return 1;
  }

  private static iconForTier(tier: number): vscode.ThemeIcon {
    if (tier === 1) {
      return new vscode.ThemeIcon('account', new vscode.ThemeColor('charts.green'));
    } else if (tier === 2) {
      return new vscode.ThemeIcon('account', new vscode.ThemeColor('charts.yellow'));
    } else {
      return new vscode.ThemeIcon('account', new vscode.ThemeColor('charts.red'));
    }
  }
}

class ForgeAgentsProvider implements vscode.TreeDataProvider<ForgeAgentItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ForgeAgentItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ForgeAgentItem): vscode.TreeItem {
    return element;
  }

  getChildren(): ForgeAgentItem[] {
    const root = getWorkspaceRoot();
    if (!root) {
      return [];
    }
    const agentsDir = path.join(root, '.claude', 'agents');
    if (!fs.existsSync(agentsDir)) {
      return [];
    }
    const files = fs.readdirSync(agentsDir).filter((f: string) => f.endsWith('.md'));
    return files.map((f: string) => {
      const name = path.basename(f, '.md');
      return new ForgeAgentItem(name, path.join(agentsDir, f));
    });
  }
}

// ---------------------------------------------------------------------------
// Audit output channel (shared)
// ---------------------------------------------------------------------------

let auditChannel: vscode.OutputChannel | undefined;
let initChannel: vscode.OutputChannel | undefined;

function getAuditChannel(): vscode.OutputChannel {
  if (!auditChannel) {
    auditChannel = vscode.window.createOutputChannel('forge Audit');
  }
  return auditChannel;
}

function getInitChannel(): vscode.OutputChannel {
  if (!initChannel) {
    initChannel = vscode.window.createOutputChannel('forge Init');
  }
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

  const root = getWorkspaceRoot();
  const isForgeProject = root ? (findProjectYaml(root) || findForgeDir(root) !== null) : false;

  if (isForgeProject) {
    updateStatusBar('idle');
    statusBarItem.show();
    vscode.commands.executeCommand('setContext', 'forge.active', true);
  }

  // Tree view providers
  const projectProvider = new ForgeProjectProvider();
  const agentsProvider = new ForgeAgentsProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('forgeProjectView', projectProvider),
    vscode.window.registerTreeDataProvider('forgeAgentsView', agentsProvider)
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
      const forgeDir = resolveForgeDir(workspaceRoot);
      if (!forgeDir) {
        vscode.window.showErrorMessage('forge: Could not find forge installation (.agentic/ or forge/).');
        return;
      }
      const channel = getAuditChannel();
      channel.clear();
      channel.show(true);
      channel.appendLine('Running forge audit...\n');

      const auditScript = path.join(forgeDir, 'scripts', 'forge-audit.py');
      const result = await runForgeCommand(['python3', auditScript], workspaceRoot);

      channel.appendLine(result.stdout);
      if (result.stderr) {
        channel.appendLine('--- stderr ---');
        channel.appendLine(result.stderr);
      }

      if (result.code !== 0) {
        channel.appendLine(`\nProcess exited with code ${result.code}`);
      }

      // Update status bar from JSON result
      await refreshStatusBar(workspaceRoot, forgeDir);
      agentsProvider.refresh();
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
      const forgeDir = resolveForgeDir(workspaceRoot);
      if (!forgeDir) {
        vscode.window.showErrorMessage('forge: Could not find forge installation.');
        return;
      }

      const agentsDir = path.join(workspaceRoot, '.claude', 'agents');
      if (!fs.existsSync(agentsDir)) {
        vscode.window.showErrorMessage('forge: No agents directory found at .claude/agents/.');
        return;
      }

      const agentFiles = fs.readdirSync(agentsDir).filter((f: string) => f.endsWith('.md'));
      if (agentFiles.length === 0) {
        vscode.window.showInformationMessage('forge: No agent files found.');
        return;
      }

      const picks = agentFiles.map((f: string) => path.basename(f, '.md'));
      const selected = await vscode.window.showQuickPick(picks, {
        placeHolder: 'Select an agent to audit',
      });
      if (!selected) {
        return;
      }

      const channel = getAuditChannel();
      channel.clear();
      channel.show(true);
      channel.appendLine(`Running audit for agent: ${selected}\n`);

      const auditScript = path.join(forgeDir, 'scripts', 'forge-audit.py');
      const result = await runForgeCommand(
        ['python3', auditScript, `--only=${selected}`],
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
  // Command: forge.init
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.init', async () => {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('forge: No workspace open.');
        return;
      }
      const forgeDir = resolveForgeDir(workspaceRoot);
      if (!forgeDir) {
        vscode.window.showErrorMessage('forge: Could not find forge installation.');
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
        ['python3', initScript, '--tool', tool],
        workspaceRoot
      );

      channel.appendLine(result.stdout);
      if (result.stderr) {
        channel.appendLine('--- stderr ---');
        channel.appendLine(result.stderr);
      }
      if (result.code !== 0) {
        channel.appendLine(`\nProcess exited with code ${result.code}`);
        vscode.window.showErrorMessage(`forge init failed (exit code ${result.code}). Check the 'forge Init' output channel.`);
      } else {
        vscode.window.showInformationMessage('forge: Project initialized successfully.');
        projectProvider.refresh();
        agentsProvider.refresh();
      }
    })
  );

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
      const forgeDir = resolveForgeDir(workspaceRoot);
      if (!forgeDir) {
        vscode.window.showErrorMessage('forge: Could not find forge installation.');
        return;
      }

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
  // Command: forge.showStatus
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.showStatus', async () => {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('forge: No workspace open.');
        return;
      }
      const forgeDir = resolveForgeDir(workspaceRoot);
      if (!forgeDir) {
        vscode.window.showErrorMessage('forge: Could not find forge installation.');
        return;
      }

      const auditScript = path.join(forgeDir, 'scripts', 'forge-audit.py');
      const result = await runForgeCommand(
        ['python3', auditScript, '--json'],
        workspaceRoot
      );

      let summary: AuditSummary | null = null;
      try {
        const parsed = JSON.parse(result.stdout);
        summary = parsed.summary as AuditSummary;
      } catch {
        // JSON parse failed — show raw error
        vscode.window.showErrorMessage(
          `forge: Failed to parse audit output. ${result.stderr || result.stdout}`
        );
        return;
      }

      const projectName = summary?.project_name ?? 'forge project';
      const errors = summary?.errors ?? 0;
      const warnings = summary?.warnings ?? 0;
      const conforming = summary?.conforming ?? 0;

      const items: vscode.QuickPickItem[] = [
        { label: `✓ ${conforming} agent(s) conforming`, kind: vscode.QuickPickItemKind.Default },
        { label: `⚠ ${warnings} warning(s)`, kind: vscode.QuickPickItemKind.Default },
        { label: `✗ ${errors} error(s)`, kind: vscode.QuickPickItemKind.Default },
      ];

      if (errors > 0) {
        items.push(
          { label: '', kind: vscode.QuickPickItemKind.Separator },
          { label: 'Ver detalles completos', kind: vscode.QuickPickItemKind.Default }
        );
      }

      const pick = await vscode.window.showQuickPick(items, {
        title: projectName,
        placeHolder: 'forge audit summary',
      });

      if (pick?.label === 'Ver detalles completos') {
        await vscode.commands.executeCommand('forge.audit');
      }
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
      const forgeDir = resolveForgeDir(workspaceRoot);
      if (!forgeDir) {
        vscode.window.showErrorMessage('forge: Could not find forge installation.');
        return;
      }

      const forgePy = path.join(forgeDir, 'forge.py');
      const terminal = vscode.window.createTerminal({
        name: 'forge catalog',
        cwd: workspaceRoot,
      });
      terminal.show();
      terminal.sendText(`python3 "${forgePy}"`);
    })
  );

  // -------------------------------------------------------------------------
  // Auto-audit on save
  // -------------------------------------------------------------------------
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      const config = vscode.workspace.getConfiguration('forge');
      if (!config.get<boolean>('autoAuditOnSave', false)) {
        return;
      }
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) {
        return;
      }
      const agentsDir = path.join(workspaceRoot, '.claude', 'agents');
      const docPath = doc.uri.fsPath;
      if (!docPath.startsWith(agentsDir) || !docPath.endsWith('.md')) {
        return;
      }
      const forgeDir = resolveForgeDir(workspaceRoot);
      if (!forgeDir) {
        return;
      }
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
  errors: number;
  warnings: number;
  conforming: number;
}

async function refreshStatusBar(workspaceRoot: string, forgeDir: string): Promise<void> {
  const auditScript = path.join(forgeDir, 'scripts', 'forge-audit.py');
  const result = await runForgeCommand(
    ['python3', auditScript, '--json'],
    workspaceRoot
  );
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
