/* eslint-disable no-console */
/**
 * Shared helpers for the Node scripts (seed / create-admin / smoke).
 * They use the deployer's AWS credentials for Cognito admin calls and the real Amplify JS client
 * (signed in as the demo admin) for everything else – so the scripts exercise the same Lambdas
 * and auth rules as the app.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Amplify } from 'aws-amplify';
import { confirmSignIn, fetchAuthSession, signIn, signOut } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import type { Schema } from '../amplify/data/resource';

export type Outputs = {
  auth: { user_pool_id: string; aws_region: string; user_pool_client_id: string };
  custom?: { schoolId?: string; schoolName?: string };
} & Record<string, unknown>;

export function loadOutputs(): Outputs {
  const path = resolve(process.cwd(), 'amplify_outputs.json');
  if (!existsSync(path)) {
    console.error('amplify_outputs.json not found. Run `npx ampx sandbox` first.');
    process.exit(1);
  }
  const outputs = JSON.parse(readFileSync(path, 'utf8')) as Outputs;
  Amplify.configure(outputs as never);
  return outputs;
}

export const cognito = (region: string) => new CognitoIdentityProviderClient({ region });

/** Create (or reuse) a Cognito user with a permanent password and group. Returns the sub. */
export async function ensureCognitoUser(
  outputs: Outputs,
  input: { username: string; password: string; email: string; name: string; group: 'ADMIN' | 'TEACHER' | 'DRIVER' | 'STUDENT'; schoolId: string },
): Promise<{ sub: string; created: boolean }> {
  const client = cognito(outputs.auth.aws_region);
  const UserPoolId = outputs.auth.user_pool_id;
  try {
    const existing = await client.send(new AdminGetUserCommand({ UserPoolId, Username: input.username }));
    const sub = existing.UserAttributes?.find((a) => a.Name === 'sub')?.Value ?? '';
    return { sub, created: false };
  } catch (e) {
    if ((e as { name?: string }).name !== 'UserNotFoundException') throw e;
  }
  const res = await client.send(
    new AdminCreateUserCommand({
      UserPoolId,
      Username: input.username,
      TemporaryPassword: input.password,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: input.email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'name', Value: input.name },
        { Name: 'custom:role', Value: input.group },
        { Name: 'custom:schoolId', Value: input.schoolId },
      ],
    }),
  );
  await client.send(new AdminSetUserPasswordCommand({ UserPoolId, Username: input.username, Password: input.password, Permanent: true }));
  await client.send(new AdminAddUserToGroupCommand({ UserPoolId, Username: input.username, GroupName: input.group }));
  return { sub: res.User?.Attributes?.find((a) => a.Name === 'sub')?.Value ?? '', created: true };
}

/** Sign in with Amplify JS (handles the forced new-password step by setting `newPassword`). */
export async function signInAs(username: string, password: string, newPassword?: string) {
  await signOut().catch(() => undefined);
  const res = await signIn({ username, password });
  if (res.isSignedIn) return { ok: true as const, step: 'DONE' as const };
  if (res.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
    if (!newPassword) return { ok: false as const, step: 'NEW_PASSWORD' as const };
    const c = await confirmSignIn({ challengeResponse: newPassword });
    return { ok: c.isSignedIn, step: 'NEW_PASSWORD_SET' as const };
  }
  return { ok: false as const, step: res.nextStep.signInStep };
}

export async function currentGroups(): Promise<string[]> {
  const session = await fetchAuthSession();
  const payload = (session.tokens?.accessToken?.payload ?? {}) as Record<string, unknown>;
  return Array.isArray(payload['cognito:groups']) ? (payload['cognito:groups'] as string[]) : [];
}

export const dataClient = () => generateClient<Schema>({ authMode: 'userPool' });

export function must<T>(res: { data: T | null | undefined; errors?: { message: string }[] | null }, what: string): T {
  if (res.errors?.length) throw new Error(`${what}: ${res.errors.map((e) => e.message).join('; ')}`);
  if (res.data === null || res.data === undefined) throw new Error(`${what}: empty result`);
  return res.data;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function log(step: string, detail?: unknown) {
  console.log(`▸ ${step}${detail !== undefined ? ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}
