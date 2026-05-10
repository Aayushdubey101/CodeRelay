import * as vscode from 'vscode';
import type { DaemonClient } from '../ipc/client.js';

interface ManifestEntry {
  file: string;
  symbol?: string;
  tokens: number;
  reason: string;
}

export function showContextPanel(client: DaemonClient, ctx: vscode.ExtensionContext): void {
  const panel = vscode.window.createWebviewPanel(
    'coderelayContext',
    'CodeRelay: Context Manifest',
    vscode.ViewColumn.Two,
    { enableScripts: false },
  );

  const refresh = async (): Promise<void> => {
    let entries: ManifestEntry[] = [];
    try {
      entries = await client.call<ManifestEntry[]>('getContextManifest');
    } catch {}
    panel.webview.html = renderHtml(entries);
  };

  void refresh();
  const interval = setInterval(() => void refresh(), 5000);
  panel.onDidDispose(() => clearInterval(interval), null, ctx.subscriptions);
}

function renderHtml(entries: ManifestEntry[]): string {
  const totalTokens = entries.reduce((s, e) => s + e.tokens, 0);
  const rows = entries
    .map(e => `<tr><td>${e.file}</td><td>${e.symbol ?? ''}</td><td>${e.tokens}</td><td>${e.reason}</td></tr>`)
    .join('');

  return `<!DOCTYPE html><html><head>
  <style>
    body { font-family: var(--vscode-font-family); font-size: 13px; padding: 8px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; border-bottom: 1px solid var(--vscode-panel-border); padding: 4px; }
    td { padding: 3px 4px; border-bottom: 1px solid var(--vscode-panel-border); word-break: break-all; }
    .total { margin-top: 8px; color: var(--vscode-descriptionForeground); }
  </style></head><body>
  <table><thead><tr><th>File</th><th>Symbol</th><th>Tokens</th><th>Reason</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="4">No context loaded</td></tr>'}</tbody></table>
  <p class="total">Total: ${totalTokens.toLocaleString()} tokens</p>
  </body></html>`;
}
