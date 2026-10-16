import { Amplify } from 'aws-amplify';
import outputs from '../../amplify_outputs.json';

/**
 * Configure Amplify exactly once, as early as possible (imported first by the root layout and by
 * the background location task so headless JS also has a configured client).
 */
let configured = false;
export function configureAmplify() {
  if (configured) return;
  Amplify.configure(outputs);
  configured = true;
}
configureAmplify();

type Outputs = typeof outputs & { custom?: { schoolId?: string; schoolName?: string; sesFromEmail?: string } };
const typed = outputs as Outputs;

export const SCHOOL_ID: string = typed.custom?.schoolId ?? process.env.EXPO_PUBLIC_SCHOOL_ID ?? 'default';
export const SCHOOL_NAME_FALLBACK: string = typed.custom?.schoolName ?? 'School';
export const SES_FROM_EMAIL: string = typed.custom?.sesFromEmail ?? '';
