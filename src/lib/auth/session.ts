import { Hub } from 'aws-amplify/utils';
import {
  confirmResetPassword,
  confirmSignIn,
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  resendSignUpCode,
  resetPassword,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from 'aws-amplify/auth';
import { create } from 'zustand';
import { IS_EXPO_GO } from '../runtime';
import { client, type Role } from '../data/client';
import { roleFromGroups } from './routing';

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

export type Session = {
  status: SessionStatus;
  userId: string | null;
  username: string | null;
  groups: string[];
  role: Role | null;
  email: string | null;
  name: string | null;
  /** The user's school ('' for an account that has not created/joined a school yet). */
  schoolId: string;
};

const signedOut: Session = { status: 'signedOut', userId: null, username: null, groups: [], role: null, email: null, name: null, schoolId: '' };

/** Kept in memory between "Create my school" → e-mail code → automatic sign-in. */
export type SignupDraft = { email: string; password: string; name: string };

type SessionState = {
  session: Session;
  pendingUsername: string | null; // set between sign-in and the forced new-password step
  signup: SignupDraft | null;
  setSession: (s: Session) => void;
  setPendingUsername: (u: string | null) => void;
  setSignup: (d: SignupDraft | null) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  session: { ...signedOut, status: 'loading' },
  pendingUsername: null,
  signup: null,
  setSession: (session) => set({ session }),
  setPendingUsername: (pendingUsername) => set({ pendingUsername }),
  setSignup: (signup) => set({ signup }),
}));

export const useSession = () => useSessionStore((s) => s.session);

/** Read the current Cognito session and derive role/groups/school from the tokens. */
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
      name: typeof idPayload.name === 'string' ? idPayload.name : null,
      schoolId: typeof idPayload['custom:schoolId'] === 'string' ? (idPayload['custom:schoolId'] as string) : '',
    };
    useSessionStore.getState().setSession(session);
    void maybeSyncAccess(session);
    return session;
  } catch {
    useSessionStore.getState().setSession(signedOut);
    return signedOut;
  }
}

/** Force new tokens (e.g. after creating a school or after the backend changed the user's groups). */
export async function refreshSession(): Promise<Session> {
  try {
    await fetchAuthSession({ forceRefresh: true });
  } catch {
    // fall through – bootstrapSession reports the real state
  }
  return bootstrapSession();
}

let syncAttemptedFor: string | null = null;
/**
 * Accounts created before multi-school support (or whose admin group membership is missing) are
 * repaired once per app run by the backend; the tokens are then refreshed so the new claims apply.
 */
async function maybeSyncAccess(s: Session) {
  if (s.status !== 'signedIn' || !s.role || !s.userId) return;
  const needs = !s.schoolId || (s.role === 'ADMIN' && !s.groups.includes(s.schoolId));
  if (!needs || syncAttemptedFor === s.userId) return;
  syncAttemptedFor = s.userId;
  try {
    const res = await client.mutations.syncMyAccess({});
    if (res.data?.changed) await refreshSession();
  } catch (e) {
    console.warn('access sync failed', e);
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
        syncAttemptedFor = null;
        useSessionStore.getState().setSession(signedOut);
        break;
    }
  });
}

export type SignInResult = { step: 'DONE' } | { step: 'NEW_PASSWORD' } | { step: 'CONFIRM_SIGN_UP' } | { step: 'OTHER'; name: string };

export async function signInWithId(username: string, password: string): Promise<SignInResult> {
  // Expo Go lacks Amplify's native SRP module, so previews use the plain password flow (TLS-protected).
  const id = username.trim();
  let res;
  try {
    res = await signIn({ username: id, password, options: { authFlowType: IS_EXPO_GO ? 'USER_PASSWORD_AUTH' : 'USER_SRP_AUTH' } });
  } catch (e) {
    if ((e as { name?: string }).name === 'UserNotConfirmedException') return { step: 'CONFIRM_SIGN_UP' };
    throw e;
  }
  if (res.isSignedIn) {
    await bootstrapSession();
    return { step: 'DONE' };
  }
  if (res.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
    useSessionStore.getState().setPendingUsername(id);
    return { step: 'NEW_PASSWORD' };
  }
  if (res.nextStep.signInStep === 'CONFIRM_SIGN_UP') return { step: 'CONFIRM_SIGN_UP' };
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

/** School owners sign up with their e-mail address as the username. */
export const ownerUsername = (email: string) => email.trim().toLowerCase();

/** "Create my school" step 1: create the owner's account; Cognito e-mails a verification code. */
export async function signUpSchoolOwner(input: SignupDraft): Promise<'CONFIRM' | 'DONE'> {
  const username = ownerUsername(input.email);
  const res = await signUp({ username, password: input.password, options: { userAttributes: { email: username, name: input.name.trim() } } });
  useSessionStore.getState().setSignup({ email: username, password: input.password, name: input.name.trim() });
  return res.nextStep.signUpStep === 'DONE' ? 'DONE' : 'CONFIRM';
}

export async function confirmSchoolOwner(email: string, code: string): Promise<void> {
  await confirmSignUp({ username: ownerUsername(email), confirmationCode: code.trim() });
}

export async function resendOwnerCode(email: string): Promise<void> {
  await resendSignUpCode({ username: ownerUsername(email) });
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
    syncAttemptedFor = null;
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
  if (name === 'LimitExceededException' || name === 'TooManyRequestsException' || name === 'TooManyFailedAttemptsException') return 'auth.errors.tooMany';
  if (name === 'UserAlreadyAuthenticatedException') return 'auth.errors.alreadySignedIn';
  if (name === 'UsernameExistsException' || name === 'AliasExistsException') return 'auth.errors.accountExists';
  if (name === 'UserNotConfirmedException') return 'auth.errors.notConfirmed';
  if (name === 'InvalidParameterException' && /email/i.test(message)) return 'auth.errors.invalidEmail';
  if (/network/i.test(message)) return 'common.networkError';
  return 'common.somethingWentWrong';
}
