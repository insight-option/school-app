import { defineFunction } from '@aws-amplify/backend';

/**
 * Messaging, feedback, broadcasts, notifications, profile self-service.
 */
export const comms = defineFunction({
  name: 'comms',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 300,
  memoryMB: 512,
  resourceGroupName: 'data',
});
