import { defineFunction, secret } from '@aws-amplify/backend';

/**
 * Trip lifecycle + Google Routes API route optimisation.
 * The Routes/Places API key lives in an Amplify secret (never shipped to the client):
 *   npx ampx sandbox secret set GOOGLE_ROUTES_API_KEY
 */
export const trips = defineFunction({
  name: 'trips',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 28,
  memoryMB: 512,
  resourceGroupName: 'data',
  environment: {
    GOOGLE_ROUTES_API_KEY: secret('GOOGLE_ROUTES_API_KEY'),
  },
});
