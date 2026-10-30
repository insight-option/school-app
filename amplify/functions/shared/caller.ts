import type { Schema } from '../../data/resource';
import type { DataClient } from './data';
import { HandlerError, type Caller } from './types';

type Profile = Schema['Profile']['type'];

/** A signed-in caller whose school comes from their profile (the source of truth). */
export type SchoolCaller = Caller & { profile: Profile; schoolId: string };

/**
 * Loads the caller's profile and pins `schoolId` to it. Throws when the account has no school yet
 * (e.g. a school owner who has not finished "Create my school") or is disabled.
 */
export async function resolveCaller(client: DataClient, caller: Caller): Promise<SchoolCaller> {
  const res = await client.models.Profile.get({ userId: caller.sub });
  const profile = res.data;
  if (!profile) throw new HandlerError('Your account is not linked to a school yet.', 'FORBIDDEN');
  if (profile.isActive === false) throw new HandlerError('Account disabled', 'FORBIDDEN');
  return { ...caller, schoolId: profile.schoolId, profile };
}

/** Office admin of their own school (ADMIN group + ADMIN profile). */
export async function resolveAdmin(client: DataClient, caller: Caller): Promise<SchoolCaller> {
  if (!caller.isAdmin) throw new HandlerError('Admin only', 'FORBIDDEN');
  const c = await resolveCaller(client, caller);
  if (c.profile.role !== 'ADMIN') throw new HandlerError('Admin only', 'FORBIDDEN');
  return c;
}

/** Records of other schools are reported as missing – never reveal that they exist. */
export function assertSameSchool(caller: { schoolId: string }, recordSchoolId: string | null | undefined, what = 'Record'): void {
  if (!recordSchoolId || recordSchoolId !== caller.schoolId) throw new HandlerError(`${what} not found`, 'NOT_FOUND');
}
