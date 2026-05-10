export type StepStatus = 'pending' | 'running' | 'done' | 'failed';

export interface TuiStep {
  step: number;
  intent: string;
  status: StepStatus;
}

export interface TuiState {
  steps: TuiStep[];
  currentStep: number;
  tokenSpend: number;
  recentActions: string[];
}
