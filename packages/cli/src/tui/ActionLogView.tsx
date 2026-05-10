import React from 'react';
import { Box, Text } from 'ink';

interface ActionLogViewProps {
  actions: string[];
}

export function ActionLogView({ actions }: ActionLogViewProps) {
  const tail = actions.slice(-5);
  return (
    <Box flexDirection="column">
      <Text bold underline>Action Log</Text>
      {tail.length === 0
        ? <Text color="gray" dimColor>  (no actions yet)</Text>
        : tail.map((a, i) => (
            <Text key={i} color="gray">  {a}</Text>
          ))}
    </Box>
  );
}
