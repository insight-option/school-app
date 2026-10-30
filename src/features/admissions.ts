import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client, listAll, unwrap, type Application, type ApplicationStatus, type School } from '../lib/data/client';
import { useSession } from '../lib/auth/session';
import { DIRECTORY_KEY, schoolKey } from './directory';
import type { BadgeTone } from '../ui/Badge';

export const applicationsKey = (schoolId: string) => ['applications', schoolId] as const;
export const myListingKey = (schoolId: string) => ['schoolListing', schoolId] as const;

/** Office: every application of the school, newest first (live: new ones appear without refresh). */
export function useApplications(enabled = true) {
  const session = useSession();
  const qc = useQueryClient();
  const schoolId = session.schoolId;
  const q = useQuery({
    queryKey: applicationsKey(schoolId),
    enabled: enabled && !!schoolId && session.role === 'ADMIN',
    staleTime: 20_000,
    queryFn: async () =>
      listAll((nextToken) => client.models.Application.listApplicationsBySchool({ schoolId }, { limit: 100, nextToken, sortDirection: 'DESC' }), 20),
  });
  useEffect(() => {
    if (!enabled || !schoolId || session.role !== 'ADMIN') return;
    const upsert = (a: Application) => {
      if (a.schoolId !== schoolId) return;
      qc.setQueryData<Application[]>(applicationsKey(schoolId), (old) => {
        const list = old ?? [];
        const i = list.findIndex((x) => x.id === a.id);
        const next = i >= 0 ? list.map((x) => (x.id === a.id ? a : x)) : [a, ...list];
        return next.sort((x, y) => y.submittedAt.localeCompare(x.submittedAt));
      });
    };
    // No filter: schoolId is the admin-group field, so AppSync already limits events to the
    // caller's school and does not accept it in subscription filters.
    const s1 = client.models.Application.onCreate().subscribe({ next: upsert, error: (e) => console.warn('applications sub', e) });
    const s2 = client.models.Application.onUpdate().subscribe({ next: upsert, error: (e) => console.warn('applications sub', e) });
    return () => {
      s1.unsubscribe();
      s2.unsubscribe();
    };
  }, [enabled, schoolId, session.role, qc]);
  return q;
}

export function useApplication(id: string | null | undefined) {
  const session = useSession();
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['application', id ?? ''],
    enabled: !!id,
    initialData: () => qc.getQueryData<Application[]>(applicationsKey(session.schoolId))?.find((a) => a.id === id),
    queryFn: async () => unwrap(await client.models.Application.get({ id: id! }), 'application'),
  });
}

export function useReviewApplication() {
  const qc = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationFn: async (input: { applicationId: string; status: ApplicationStatus; note?: string | null }) =>
      unwrap(await client.mutations.reviewApplication(input), 'application'),
    onSuccess: (a) => {
      if (!a) return;
      qc.setQueryData(['application', a.id], a);
      qc.setQueryData<Application[]>(applicationsKey(session.schoolId), (old) => old?.map((x) => (x.id === a.id ? a : x)));
    },
  });
}

/** Office: the school's own directory listing (may not exist yet for the first school). */
export function useMySchoolListing() {
  const session = useSession();
  return useQuery({
    queryKey: myListingKey(session.schoolId),
    enabled: !!session.schoolId && session.role === 'ADMIN',
    staleTime: 60_000,
    queryFn: async () => unwrap(await client.models.School.get({ schoolId: session.schoolId }), 'school'),
  });
}

export function useSaveSchoolProfile() {
  const qc = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationFn: async (profile: Record<string, unknown>) => unwrap(await client.mutations.saveSchoolProfile({ profile: JSON.stringify(profile) }), 'profile'),
    onSuccess: (school) => {
      if (!school) return;
      qc.setQueryData<School | null>(myListingKey(session.schoolId), school);
      qc.setQueryData(schoolKey(school.schoolId), school);
      void qc.invalidateQueries({ queryKey: DIRECTORY_KEY });
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

export const APPLICATION_STATUSES: ApplicationStatus[] = ['NEW', 'REVIEWING', 'ACCEPTED', 'WAITLISTED', 'REJECTED'];

export const STATUS_TONE: Record<ApplicationStatus, BadgeTone> = {
  NEW: 'primary',
  REVIEWING: 'info',
  ACCEPTED: 'success',
  WAITLISTED: 'warning',
  REJECTED: 'danger',
};
