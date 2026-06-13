// ---------------------------------------------------------------------------
// SPEC-070 — forge configuration WebviewPanel.
//
// Hosts media/index.html with a strict CSP + nonce. Routes postMessage requests
// from the webview: maps {action, payload} through the pure `toArgs` (src/ipc.ts)
// and spawns the SAME forge CLI the rest of the extension uses (getCliCommand
// from extension.ts). Sends 'result'/'error' back to the webview.
//
// The host is a thin transport: it does NOT decide subcommands or flags. The
// only logic here is writing a temporary answers.json on request (the init form
// collects answers in the webview, the host persists them so the CLI can read
// the file via `init --from`).
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { getCliCommand } from '../extension';
import {
  toArgs,
  type ForgeAction,
  type HostBoundMessage,
  type RunMessage,
  type WriteAnswersMessage,
  type WebviewBoundMessage,
} from '../ipc';

function getWorkspaceRoot(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return null;
  }
  return folders[0].uri.fsPath;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Spawn the configured forge CLI with `subArgs`, capturing output. */
function runCli(subArgs: string[], cwd: string): Promise<CliResult> {
  const cli = getCliCommand();
  const argv = [...cli.slice(1), ...subArgs];
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const proc = spawn(cli[0], argv, {
      cwd,
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

export class ForgeConfigPanel {
  public static current: ForgeConfigPanel | undefined;
  private static readonly viewType = 'forgeConfigPanel';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (ForgeConfigPanel.current) {
      ForgeConfigPanel.current.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ForgeConfigPanel.viewType,
      'forge — configuración',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      }
    );

    ForgeConfigPanel.current = new ForgeConfigPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (msg: HostBoundMessage) => this.handleMessage(msg),
      null,
      this.disposables
    );
  }

  private post(msg: WebviewBoundMessage): void {
    void this.panel.webview.postMessage(msg);
  }

  private async handleMessage(msg: HostBoundMessage): Promise<void> {
    if (!msg || typeof msg !== 'object') {
      return;
    }
    if (msg.type === 'writeAnswers') {
      await this.handleWriteAnswers(msg);
      return;
    }
    if (msg.type === 'run') {
      await this.handleRun(msg);
      return;
    }
  }

  private async handleWriteAnswers(msg: WriteAnswersMessage): Promise<void> {
    try {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-answers-'));
      const file = path.join(dir, 'answers.json');
      fs.writeFileSync(file, JSON.stringify(msg.answers, null, 2), 'utf-8');
      this.post({ type: 'answersWritten', path: file, requestId: msg.requestId });
    } catch (err) {
      this.post({
        type: 'error',
        action: 'writeAnswers',
        message: err instanceof Error ? err.message : String(err),
        requestId: msg.requestId,
      });
    }
  }

  private async handleRun(msg: RunMessage): Promise<void> {
    const root = getWorkspaceRoot();
    if (!root) {
      this.post({
        type: 'error',
        action: msg.action,
        message: 'No hay ningún workspace abierto.',
        requestId: msg.requestId,
      });
      return;
    }

    let args: string[];
    try {
      args = toArgs(msg.action as ForgeAction, msg.payload as never);
    } catch (err) {
      this.post({
        type: 'error',
        action: msg.action,
        message: err instanceof Error ? err.message : String(err),
        requestId: msg.requestId,
      });
      return;
    }

    const result = await runCli(args, root);
    this.post({
      type: 'result',
      action: msg.action,
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code,
      requestId: msg.requestId,
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const mediaUri = vscode.Uri.joinPath(this.extensionUri, 'media');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'style.css'));
    const htmlPath = vscode.Uri.joinPath(mediaUri, 'index.html').fsPath;
    const nonce = getNonce();

    let html = fs.readFileSync(htmlPath, 'utf-8');
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
    ].join('; ');

    html = html
      .replace(/%%CSP%%/g, csp)
      .replace(/%%NONCE%%/g, nonce)
      .replace(/%%SCRIPT_URI%%/g, scriptUri.toString())
      .replace(/%%STYLE_URI%%/g, styleUri.toString());
    return html;
  }

  public dispose(): void {
    ForgeConfigPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
