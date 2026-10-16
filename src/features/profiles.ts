import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client, listAll, unwrap, type Profile, type Role } from '../lib/data/client';
import { qk } from '../lib/query/client';
import { useSession } from '../lib/auth/session';

const PROFILE_SELECTION = [
  'userId',
  'username',
  'role',
  'schoolId',
  'fullName',
  'email',
  'phone',
  'avatarKey',
  'classId',
  'className',
  'busId',
  'busName',
  'parentEmail',
  'parentPhone',
  'homeLocation.*',
  'homeAddress',
  'isActive',
  'language',
  'grade',
  'classIds',
  'createdAt',
  'updatedAt',
] as const;

/** The signed-in user's own profile (admins may have none → null). */
export function useMyProfile() {
  const session = useSession();
  const userId = session.userId ?? '';
  return useQuery({
    queryKey: qk.profile(userId),
    enabled: session.status === 'signedIn' && !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await client.models.Profile.get({ userId });
      return unwrap(res, 'profile');
    },
  });
}

export function useProfile(userId: string | null | undefined) {
  return useQuery({
    queryKey: qk.profile(userId ?? ''),
    enabled: !!userId,
    queryFn: async () => unwrap(await client.models.Profile.get({ userId: userId! }), 'profile'),
  });
}

export function useProfilesByClass(classId: string | null | undefined) {
  return useQuery({
    queryKey: qk.profilesByClass(classId ?? ''),
    enabled: !!classId,
    queryFn: async () => {
      const rows = await listAll((nextToken) => client.models.Profile.listProfilesByClass({ classId: classId! }, { limit: 100, nextToken, selectionSet: [...PROFILE_SELECTION] }));
      return rows as unknown as Profile[];
    },
  });
}

export function useProfilesByBus(busId: string | null | undefined) {
  return useQuery({
    queryKey: qk.profilesByBus(busId ?? ''),
    enabled: !!busId,
    queryFn: async () => {
      const rows = await listAll((nextToken) => client.models.Profile.listProfilesByBus({ busId: busId! }, { limit: 100, nextToken, selectionSet: [...PROFILE_SELECTION] }));
      return (rows as unknown as Profile[]).filter((p) => p.role === 'STUDENT');
    },
  });
}

/** Paginated list of all profiles with a role (admin lists). */
export function useProfilesByRole(role: Role, enabled = true) {
  return useInfiniteQuery({
    queryKey: qk.profilesByRole(role),
    enabled,
    initialPageParam: undefined as string | null | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await client.models.Profile.listProfilesByRole({ role }, { limit: 50, nextToken: pageParam ?? undefined, selectionSet: [...PROFILE_SELECTION] });
      unwrap(res, 'profiles');
      return { items: res.data as unknown as Profile[], nextToken: res.nextToken ?? null };
    },
    getNextPageParam: (last) => last.nextToken ?? undefined,
  });
}

export function flattenPages<T>(pages: { items: T[] }[] | undefined): T[] {
  return pages?.flatMap((p) => p.items) ?? [];
}

export function useProfileByUsername(username: string | null | undefined) {
  return useQuery({
    queryKey: ['profile', 'username', username ?? ''],
    enabled: !!username,
    queryFn: async () => {
      const res = await client.models.Profile.listProfilesByUsername({ username: username! }, { limit: 1 });
      unwrap(res);
      return res.data[0] ?? null;
    },
  });
}

/** Admin: direct Profile updates (names, contacts, grade). Cognito-backed fields go through Lambdas. */
export function useAdminUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Profile> & { userId: string }) => {
      const { createdAt: _c, updatedAt: _u, ...rest } = patch as Profile;
      return unwrap(await client.models.Profile.update(rest), 'profile');
    },
    onSuccess: (data) => {
      if (!data) return;
      qc.setQueryData(qk.profile(data.userId), data);
      void qc.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}

export function useUpdateMyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { avatarKey?: string | null; language?: string; phone?: string; parentPhone?: string }) => unwrap(await client.mutations.updateMyProfile(input), 'profile'),
    onSuccess: (data) => {
      if (data) qc.setQueryData(qk.profile(data.userId), data);
    },
  });
}

export function useUpdateHomeLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { lat: number; lng: number; address?: string; userId?: string }) => unwrap(await client.mutations.updateHomeLocation(input), 'home location'),
    onSuccess: (data) => {
      if (data) {
        qc.setQueryData(qk.profile(data.userId), data);
        void qc.invalidateQueries({ queryKey: ['profiles'] });
      }
    },
  });
}

export function useInvalidateProfiles() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['profiles'] });
}
