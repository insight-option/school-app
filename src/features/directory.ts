import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clientFor, listAll, unwrap, type ApplicationStatus, type School } from '../lib/data/client';
import { useSession } from '../lib/auth/session';
import { DIRECTORY_PUBLIC } from '../../amplify/functions/shared/tenancy';

export const DIRECTORY_KEY = ['directory', 'schools'] as const;
export const schoolKey = (schoolId: string) => ['directory', 'school', schoolId] as const;

/**
 * Every school listed in the public directory. Cached and persisted (MMKV) so the landing screen
 * renders instantly on the next launch; refreshed in the background.
 */
export function useDirectorySchools() {
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  return useQuery({
    queryKey: DIRECTORY_KEY,
    enabled: session.status !== 'loading',
    staleTime: 2 * 60_000,
    gcTime: 7 * 24 * 3600_000,
    queryFn: async (): Promise<School[]> => {
      const c = clientFor(signedIn);
      return listAll((nextToken) => c.models.School.listDirectorySchools({ directory: DIRECTORY_PUBLIC }, { limit: 100, nextToken }), 50);
    },
  });
}

/** One school's public profile (seeded from the directory list so the page opens instantly). */
export function useSchool(schoolId: string | null | undefined) {
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  const qc = useQueryClient();
  return useQuery({
    queryKey: schoolKey(schoolId ?? ''),
    enabled: !!schoolId && session.status !== 'loading',
    staleTime: 60_000,
    initialData: () => qc.getQueryData<School[]>(DIRECTORY_KEY)?.find((s) => s.schoolId === schoolId),
    initialDataUpdatedAt: () => qc.getQueryState(DIRECTORY_KEY)?.dataUpdatedAt,
    queryFn: async () => unwrap(await clientFor(signedIn).models.School.get({ schoolId: schoolId! }), 'school'),
  });
}

export type ApplicationForm = {
  studentName: string;
  dateOfBirth?: string;
  gender?: 'MALE' | 'FEMALE' | '';
  gradeApplying?: string;
  parentName: string;
  relationship?: string;
  parentEmail: string;
  parentPhone: string;
  address?: string;
  currentSchool?: string;
  needsTransport?: boolean;
  notes?: string;
  language?: 'en' | 'ar';
};

export function useSubmitApplication() {
  const session = useSession();
  return useMutation({
    mutationFn: async (input: { schoolId: string; application: ApplicationForm }) =>
      unwrap(await clientFor(session.status === 'signedIn').mutations.submitApplication({ schoolId: input.schoolId, application: JSON.stringify(input.application) }), 'application'),
  });
}

export type ApplicationLookup = {
  reference: string;
  schoolId: string;
  schoolName: string;
  studentName: string;
  status: ApplicationStatus;
  submittedAt: string;
  reviewedAt?: string | null;
  message?: string | null;
};

export function useCheckApplication() {
  const session = useSession();
  return useMutation({
    mutationFn: async (input: { reference: string; email: string }): Promise<ApplicationLookup | null> => {
      const res = unwrap(await clientFor(session.status === 'signedIn').queries.checkApplication(input), 'application');
      return res ? ({ ...res, status: res.status as ApplicationStatus } as ApplicationLookup) : null;
    },
  });
}

/** Typed view of `School.facilities` etc. (lists can contain nulls from the API). */
export function cleanList(list: (string | null)[] | null | undefined): string[] {
  return (list ?? []).filter((x): x is string => !!x && !!x.trim());
}

