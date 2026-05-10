import * as vscode from 'vscode';
import { SocketTransport } from './ipc/transport.js';
import { DaemonClient } from './ipc/client.js';
import { PlanViewProvider } from './panels/planView.js';
import { showContextPanel } from './panels/contextPanel.js';

let client: DaemonClient | null = null;

export function activate(ctx: vscode.ExtensionContext): void {
  const transport = new SocketTransport();
  client = new DaemonClient(transport);

  const planProvider = new PlanViewProvider(client);
  ctx.subscriptions.push(
    vscode.window.registerTreeDataProvider('coderelay.planView', planProvider),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('coderelay.showContext', () => {
      if (!client) return;
      showContextPanel(client, ctx);
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('coderelay.showPlan', () => {
      void planProvider.refresh();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('coderelay.startDaemon', () => {
      vscode.window.showInformationMessage('Run: coderelay daemon in your terminal to start the daemon.');
    }),
  );

  // Attempt connection; fail silently if daemon not running
  client.connect().catch(() => {});
}

export function deactivate(): void {
  client?.disconnect();
}
