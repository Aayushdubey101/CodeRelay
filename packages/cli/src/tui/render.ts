import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import type { TuiState } from './types.js';

export interface TuiHandle {
  update(state: Partial<TuiState>): void;
  clear(): void;
}

export function renderTui(initial: TuiState): TuiHandle {
  let state: TuiState = { ...initial };
  const { rerender, unmount } = render(React.createElement(App, state));

  return {
    update(patch) {
      state = {
        steps: patch.steps ?? state.steps,
        currentStep: patch.currentStep ?? state.currentStep,
        tokenSpend: patch.tokenSpend ?? state.tokenSpend,
        recentActions: patch.recentActions ?? state.recentActions,
      };
      rerender(React.createElement(App, state));
    },
    clear() {
      unmount();
    },
  };
}
