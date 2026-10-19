import { Hub } from 'aws-amplify/utils';
import {
  confirmResetPassword,
  confirmSignIn,
  fetchAuthSession,
  getCurrentUser,
  resetPassword,
  signIn,
  signOut,
  updatePassword,
} from 'aws-amplify/auth';
import { create } from 'zustand';
import { SCHOOL_ID } from '../amplify';
import { IS_EXPO_GO } from '../runtime';
import type { Role } from '../data/client';
import { roleFromGroups } from './routing';

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

export type Session = {
  status: SessionStatus;
  userId: string | null;
  username: string | null;
  groups: string[];
  role: Role | null;
  email: string | null;
  schoolId: string;
};

const signedOut: Session = { status: 'signedOut', userId: null, username: null, groups: [], role: null, email: null, schoolId: SCHOOL_ID };

type SessionState = {
  session: Session;
  pendingUsername: string | null; // set between sign-in and the forced new-password step
  setSession: (s: Session) => void;
  setPendingUsername: (u: string | null) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  session: { ...signedOut, status: 'loading' },
  pendingUsername: null,
  setSession: (session) => set({ session }),
  setPendingUsername: (pendingUsername) => set({ pendingUsername }),
}));

export const useSession = () => useSessionStore((s) => s.session);

/** Read the current Cognito session and derive role/groups from the access token. */
export async function bootstrapSession(): Promise<Session> {
  try {
    const [auth, user] = await Promise.all([fetchAuthSession(), getCurrentUser()]);
    const token = auth.tokens?.accessToken;
    if (!token) throw new Error('no token');
    const payload = token.payload as Record<string, unknown>;
    const groups = Array.isArray(payload['cognito:groups']) ? (payload['cognito:groups'] as string[]) : [];
    const idPayload = (auth.tokens?.idToken?.payload ?? {}) as Record<string, unknown>;
    const session: Session = {
      status: 'signedIn',
      userId: user.userId,
      username: user.username,
      groups,
      role: roleFromGroups(groups),
      email: typeof idPayload.email === 'string' ? idPayload.email : null,
      schoolId: typeof idPayload['custom:schoolId'] === 'string' ? (idPayload['custom:schoolId'] as string) : SCHOOL_ID,
    };
    useSessionStore.getState().setSession(session);
    return session;
  } catch {
    useSessionStore.getState().setSession(signedOut);
    return signedOut;
  }
}

let hubStarted = false;
export function startAuthListener() {
  if (hubStarted) return;
  hubStarted = true;
  Hub.listen('auth', ({ payload }) => {
    switch (payload.event) {
      case 'signedIn':
      case 'tokenRefresh':
        void bootstrapSession();
        break;
      case 'signedOut':
      case 'tokenRefresh_failure':
        useSessionStore.getState().setSession(signedOut);
        break;
    }
  });
}

export type SignInResult = { step: 'DONE' } | { step: 'NEW_PASSWORD' } | { step: 'OTHER'; name: string };

export async function signInWithId(username: string, password: string): Promise<SignInResult> {
  // Expo Go lacks Amplify's native SRP module, so previews use the plain password flow (TLS-protected).
  const res = await signIn({ username: username.trim(), password, options: { authFlowType: IS_EXPO_GO ? 'USER_PASSWORD_AUTH' : 'USER_SRP_AUTH' } });
  if (res.isSignedIn) {
    await bootstrapSession();
    return { step: 'DONE' };
  }
  if (res.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
    useSessionStore.getState().setPendingUsername(username.trim());
    return { step: 'NEW_PASSWORD' };
  }
  return { step: 'OTHER', name: res.nextStep.signInStep };
}

export async function completeNewPassword(newPassword: string): Promise<void> {
  const res = await confirmSignIn({ challengeResponse: newPassword });
  if (res.isSignedIn) {
    useSessionStore.getState().setPendingUsername(null);
    await bootstrapSession();
    return;
  }
  throw new Error(`Unexpected sign-in step: ${res.nextStep.signInStep}`);
}

export async function requestPasswordReset(username: string): Promise<{ destination?: string }> {
  const res = await resetPassword({ username: username.trim() });
  const d = res.nextStep.resetPasswordStep === 'CONFIRM_RESET_PASSWORD_WITH_CODE' ? res.nextStep.codeDeliveryDetails?.destination : undefined;
  return { destination: d };
}

export async function confirmPasswordReset(username: string, code: string, newPassword: string): Promise<void> {
  await confirmResetPassword({ username: username.trim(), confirmationCode: code.trim(), newPassword });
}

export async function changeMyPassword(oldPassword: string, newPassword: string): Promise<void> {
  await updatePassword({ oldPassword, newPassword });
}

export async function signOutEverywhere(): Promise<void> {
  try {
    await signOut();
  } finally {
    useSessionStore.getState().setSession(signedOut);
  }
}

/** Map Cognito error names to i18n keys. */
export function authErrorKey(e: unknown): string {
  const name = (e as { name?: string })?.name ?? '';
  const message = (e as { message?: string })?.message ?? '';
  if (name === 'NotAuthorizedException') {
    if (/disabled/i.test(message)) return 'auth.errors.userDisabled';
    if (/expired/i.test(message)) return 'auth.errors.tempExpired';
    return 'auth.errors.invalidCredentials';
  }
  if (name === 'UserNotFoundException') return 'auth.errors.invalidCredentials';
  if (name === 'PasswordResetRequiredException') return 'auth.errors.resetRequired';
  if (name === 'InvalidPasswordException') return 'auth.errors.weakPassword';
  if (name === 'CodeMismatchException') return 'auth.errors.codeMismatch';
  if (name === 'ExpiredCodeException') return 'auth.errors.codeExpired';
  if (name === 'LimitExceededException' || name === 'TooManyRequestsException') return 'auth.errors.tooMany';
  if (name === 'UserAlreadyAuthenticatedException') return 'auth.errors.alreadySignedIn';
  if (/network/i.test(message)) return 'common.networkError';
  return 'common.somethingWentWrong';
}
