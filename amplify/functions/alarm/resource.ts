import { defineFunction } from '@aws-amplify/backend';

/**
 * Driver → student alarm. Sends the high-priority push to every device of the student,
 * then starts a Step Functions "repeat until acknowledged" loop that re-invokes this
 * function every `alarmRepeatSeconds` up to `alarmMaxRepeats` times.
 */
export const alarm = defineFunction({
  name: 'alarm',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 28,
  memoryMB: 512,
  resourceGroupName: 'data',
});
