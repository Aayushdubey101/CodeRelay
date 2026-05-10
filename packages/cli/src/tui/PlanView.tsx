import React from 'react';
import { Box, Text } from 'ink';
import type { TuiStep, StepStatus } from './types.js';

const STATUS_ICON: Record<StepStatus, string> = {
  pending: '○',
  running: '●',
  done: '✓',
  failed: '✗',
};

const STATUS_COLOR: Record<StepStatus, string> = {
  pending: 'gray',
  running: 'cyan',
  done: 'green',
  failed: 'red',
};

interface PlanViewProps {
  steps: TuiStep[];
  currentStep: number;
}

export function PlanView({ steps, currentStep }: PlanViewProps) {
  return (
    <Box flexDirection="column">
      <Text bold underline>Plan</Text>
      {steps.map((s) => {
        const isActive = s.step === currentStep;
        const icon = STATUS_ICON[s.status] ?? '○';
        const color = STATUS_COLOR[s.status] ?? 'gray';
        return (
          <Box key={s.step} marginLeft={1}>
            <Text color={color}>{icon} </Text>
            {isActive
              ? <Text bold color="cyan">{s.step}. {s.intent}</Text>
              : <Text>{s.step}. {s.intent}</Text>}
          </Box>
        );
      })}
    </Box>
  );
}
