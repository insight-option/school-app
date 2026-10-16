import { defineFunction } from '@aws-amplify/backend';

/**
 * Admin-only user lifecycle: create students / teachers / buses, bulk CSV import,
 * reset passwords, enable/disable, delete, assignments (class/bus/teacher) that also
 * maintain the group conversations.
 */
export const adminUsers = defineFunction({
  name: 'admin-users',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 900,
  memoryMB: 512,
  resourceGroupName: 'data',
  environment: {
    SCHOOL_NAME: process.env.SCHOOL_NAME ?? 'Our School',
    SES_FROM_EMAIL: process.env.SES_FROM_EMAIL ?? '',
    SES_FROM_NAME: process.env.SES_FROM_NAME ?? 'School Office',
  },
});
