import React from 'react';
import { Box, Text } from 'ink';
import { PlanView } from './PlanView.js';
import { ActionLogView } from './ActionLogView.js';
import type { TuiState } from './types.js';

export function App({ steps, currentStep, tokenSpend, recentActions }: TuiState) {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Box marginBottom={1}>
        <Text bold color="cyan">CodeRelay</Text>
        <Text color="gray">  tokens: </Text>
        <Text color="yellow">{tokenSpend.toLocaleString()}</Text>
        {currentStep > 0 && (
          <>
            <Text color="gray">  step: </Text>
            <Text color="cyan">{currentStep}/{steps.length}</Text>
          </>
        )}
      </Box>
      <PlanView steps={steps} currentStep={currentStep} />
      <Box marginTop={1}>
        <ActionLogView actions={recentActions} />
      </Box>
    </Box>
  );
}
