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
import { client, humanizeError, publicClient, type Role } from '../data/client';
import { isSchoolRole, roleFromGroups } from './routing';

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
/** What a new account is for (chosen on the sign-up screen). */
export type SignupKind = 'customer' | 'business' | 'school';
export type SignupDraft = { email: string; password: string; name: string; kind?: SignupKind; phone?: string; returnTo?: string };

type SessionState = {
  session: Session;
  pendingUsername: string | null; // set between sign-in and the forced new-password step
  signup: SignupDraft | null;
  /** Public page to reopen after sign-in / sign-up (e.g. the booking a guest started). */
  returnTo: string | null;
  setSession: (s: Session) => void;
  setPendingUsername: (u: string | null) => void;
  setSignup: (d: SignupDraft | null) => void;
  setReturnTo: (path: string | null) => void;
};

/** Only in-app public paths may be resumed (never an external URL). */
export const safeReturnPath = (p: string | null | undefined): string | null => (p && /^\/(venues|businesses|explore|schools)\/[A-Za-z0-9_\-/]+$/.test(p) ? p : null);

export const useSessionStore = create<SessionState>((set) => ({
  session: { ...signedOut, status: 'loading' },
  pendingUsername: null,
  signup: null,
  returnTo: null,
  setSession: (session) => set({ session }),
  setPendingUsername: (pendingUsername) => set({ pendingUsername }),
  setSignup: (signup) => set({ signup }),
  setReturnTo: (returnTo) => set({ returnTo: safeReturnPath(returnTo) }),
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
  if (s.status !== 'signedIn' || !s.role || !s.userId || !isSchoolRole(s.role)) return;
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

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/**
 * Owner and staff accounts created in the Cognito console (or by a school office) have a username
 * that is not their e-mail address; the backend resolves it (see amplify/functions/platform/signin.ts).
 */
async function usernameForEmail(email: string): Promise<string | null> {
  try {
    const res = await publicClient.queries.signInName({ email });
    return typeof res.data === 'string' && res.data ? res.data : null;
  } catch {
    return null;
  }
}

/** Wrong username or password (as opposed to a disabled account, an expired temporary password …). */
const isBadCredentials = (e: unknown) => {
  const name = (e as { name?: string })?.name;
  return name === 'UserNotFoundException' || (name === 'NotAuthorizedException' && !/disabled|expired|attempts/i.test((e as Error)?.message ?? ''));
};

export async function signInWithId(username: string, password: string): Promise<SignInResult> {
  const id = username.trim();
  try {
    return await attemptSignIn(id, password);
  } catch (e) {
    if (!looksLikeEmail(id) || !isBadCredentials(e)) throw e;
    const name = await usernameForEmail(id);
    if (!name) throw e;
    return attemptSignIn(name, password);
  }
}

async function attemptSignIn(id: string, password: string): Promise<SignInResult> {
  // Expo Go lacks Amplify's native SRP module, so previews use the plain password flow (TLS-protected).
  const start = () => signIn({ username: id, password, options: { authFlowType: IS_EXPO_GO ? 'USER_PASSWORD_AUTH' : 'USER_SRP_AUTH' } });
  let res;
  try {
    res = await start();
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === 'UserNotConfirmedException') return { step: 'CONFIRM_SIGN_UP' };
    if (name !== 'UserAlreadyAuthenticatedException') throw e;
    // Tokens left from an earlier session (e.g. a refresh that failed offline): end it and retry once.
    await signOut().catch(() => undefined);
    res = await start();
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
  useSessionStore.getState().setSignup({ ...input, email: username, password: input.password, name: input.name.trim() });
  return res.nextStep.signUpStep === 'DONE' ? 'DONE' : 'CONFIRM';
}

/** A verified, signed-in account without a workspace becomes a customer (books activities). */
export async function registerCustomerAccount(input: { name: string; phone?: string; language?: string }): Promise<void> {
  const res = await client.mutations.registerCustomer({ name: input.name.trim(), phone: input.phone?.trim() || undefined, language: input.language });
  if (res.errors?.length) throw new Error(humanizeError(res.errors.map((e) => e.message).join('; ')));
  await refreshSession();
}

/** Where a freshly verified account continues (by the kind chosen at sign-up). */
export function nextRouteAfterSignup(kind: SignupKind | undefined): string {
  if (kind === 'business') return '/onboarding/business';
  if (kind === 'school') return '/onboarding/school';
  return '/onboarding';
}

export async function confirmSchoolOwner(email: string, code: string): Promise<void> {
  await confirmSignUp({ username: ownerUsername(email), confirmationCode: code.trim() });
}

export async function resendOwnerCode(email: string): Promise<void> {
  await resendSignUpCode({ username: ownerUsername(email) });
}

/** Returns the username the code was sent for – pass it to confirmPasswordReset. */
export async function requestPasswordReset(username: string): Promise<{ destination?: string; username: string }> {
  const id = username.trim();
  // Cognito pretends to send a code for unknown usernames, so an owner/staff e-mail is resolved first.
  const resolved = (looksLikeEmail(id) && (await usernameForEmail(id))) || id;
  const res = await resetPassword({ username: resolved });
  const d = res.nextStep.resetPasswordStep === 'CONFIRM_RESET_PASSWORD_WITH_CODE' ? res.nextStep.codeDeliveryDetails?.destination : undefined;
  return { destination: d, username: resolved };
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
    if (/attempts exceeded/i.test(message)) return 'auth.errors.tooMany';
    if (/current state/i.test(message)) return 'auth.errors.tempPasswordFirst';
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
