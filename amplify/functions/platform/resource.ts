import { defineFunction } from '@aws-amplify/backend';

/**
 * Platform operations: activity businesses (partners) and their venues, customer bookings with
 * slot locking, and the owner console (overview, users, suspend / delete tenants).
 */
export const platform = defineFunction({
  name: 'platform',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 900,
  memoryMB: 1024,
  resourceGroupName: 'data',
});
