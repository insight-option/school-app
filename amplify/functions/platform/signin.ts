import { AdminListGroupsForUserCommand, ListUsersCommand, type UserType } from '@aws-sdk/client-cognito-identity-provider';
import type { Deps } from './business';

/**
 * The user pool has free-form usernames (school IDs), so an account created by hand in the Cognito
 * console – the platform owner, or staff an office created – cannot sign in with its e-mail address.
 * The sign-in screen asks this (guest) query when an e-mail address fails and retries with the
 * returned username; the password is still checked by Cognito.
 *
 * Only owner and staff accounts are resolved (never students or drivers), only enabled ones, and
 * only when exactly one such account carries the address.
 */
const RESOLVABLE_GROUPS = ['OWNER', 'ADMIN', 'TEACHER', 'PARTNER'];
const EMAIL = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export async function signInName(deps: Pick<Deps, 'cognito' | 'userPoolId'>, args: { email?: string | null }): Promise<string | null> {
  const typed = (args.email ?? '').trim();
  if (typed.length > 254 || !EMAIL.test(typed)) return null;
  // Attribute filters are exact matches; console-created users keep the case they were typed in.
  const variants = [...new Set([typed, typed.toLowerCase()])];
  const found = new Map<string, UserType>();
  for (const v of variants) {
    const res = await deps.cognito.send(new ListUsersCommand({ UserPoolId: deps.userPoolId, Limit: 10, Filter: `email = "${v}"` }));
    for (const u of res.Users ?? []) if (u.Username && u.Enabled !== false) found.set(u.Username, u);
  }
  const lower = typed.toLowerCase();
  const matches: string[] = [];
  for (const name of found.keys()) {
    // an account whose username is the address itself was just tried by the app
    if (name.toLowerCase() === lower) continue;
    const groups = await deps.cognito
      .send(new AdminListGroupsForUserCommand({ UserPoolId: deps.userPoolId, Username: name, Limit: 30 }))
      .then((g) => (g.Groups ?? []).map((x) => x.GroupName ?? ''))
      .catch(() => [] as string[]);
    if (groups.some((g) => RESOLVABLE_GROUPS.includes(g))) matches.push(name);
  }
  return matches.length === 1 ? matches[0] : null;
}
