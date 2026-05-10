import * as vscode from 'vscode';
import type { DaemonClient } from '../ipc/client.js';

interface PlanStep {
  step: number;
  intent: string;
  status: 'pending' | 'running' | 'done' | 'failed';
}

const STATUS_ICON: Record<string, string> = {
  pending: '○',
  running: '●',
  done: '✓',
  failed: '✗',
};

export class PlanTreeItem extends vscode.TreeItem {
  constructor(public readonly planStep: PlanStep) {
    super(`${STATUS_ICON[planStep.status] ?? '?'} ${planStep.step}. ${planStep.intent}`);
    this.tooltip = planStep.intent;
    this.contextValue = 'planStep';
    if (planStep.status === 'running') this.iconPath = new vscode.ThemeIcon('loading~spin');
    else if (planStep.status === 'done') this.iconPath = new vscode.ThemeIcon('check');
    else if (planStep.status === 'failed') this.iconPath = new vscode.ThemeIcon('error');
    else this.iconPath = new vscode.ThemeIcon('circle-outline');
  }
}

export class PlanViewProvider implements vscode.TreeDataProvider<PlanTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PlanTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private steps: PlanStep[] = [];

  constructor(private readonly client: DaemonClient) {}

  async refresh(): Promise<void> {
    try {
      const plan = await this.client.call<PlanStep[]>('getPlan');
      this.steps = plan;
    } catch {
      this.steps = [];
    }
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(el: PlanTreeItem): vscode.TreeItem { return el; }

  getChildren(): PlanTreeItem[] {
    return this.steps.map(s => new PlanTreeItem(s));
  }
}
