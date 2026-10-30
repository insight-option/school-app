import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from 'aws-amplify/auth';
import outputs from '../../amplify_outputs.json';

/**
 * Configure Amplify exactly once, as early as possible (imported first by the root layout and by
 * the background location task so headless JS also has a configured client).
 *
 * GraphQL requests of signed-in users carry the Cognito **ID token** instead of the access token:
 * the API's school-isolation rules read the `custom:schoolId` claim, which only the ID token has
 * (amplify/data/resource.ts). Guests (no tokens) send nothing extra and use identity-pool auth.
 */
let configured = false;
export function configureAmplify() {
  if (configured) return;
  Amplify.configure(outputs, {
    API: {
      GraphQL: {
        headers: async () => {
          try {
            const idToken = (await fetchAuthSession()).tokens?.idToken?.toString();
            return idToken ? { Authorization: idToken } : {};
          } catch {
            return {};
          }
        },
      },
    },
  });
  configured = true;
}
configureAmplify();

type Outputs = typeof outputs & { custom?: { schoolId?: string; schoolName?: string; sesFromEmail?: string } };
const typed = outputs as Outputs;

/** Product name shown before a school is known (sign-in, directory). */
export const APP_NAME = 'School Bus';
export const SES_FROM_EMAIL: string = typed.custom?.sesFromEmail ?? '';
