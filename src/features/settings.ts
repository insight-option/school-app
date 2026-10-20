import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client, unwrap, type SchoolSettings } from '../lib/data/client';
import { qk } from '../lib/query/client';
import { useSession } from '../lib/auth/session';

export const DEFAULT_SETTINGS: Omit<SchoolSettings, 'createdAt' | 'updatedAt'> = {
  schoolId: 'default',
  name: 'School',
  logoKey: null,
  primaryColor: null,
  address: null,
  schoolLocation: null,
  timezone: 'Asia/Riyadh',
  defaultLanguage: 'en',
  morningTripStart: '06:30',
  afternoonTripStart: '13:30',
  studentChatEnabled: true,
  alarmRepeatSeconds: 20,
  alarmMaxRepeats: 5,
  senderEmail: null,
};

export function useSettings() {
  const session = useSession();
  const schoolId = session.schoolId;
  return useQuery({
    queryKey: qk.settings(schoolId),
    enabled: session.status === 'signedIn',
    staleTime: 60_000,
    queryFn: async () => {
      const res = await client.models.SchoolSettings.get({ schoolId });
      return unwrap(res, 'settings') ?? ({ ...DEFAULT_SETTINGS, schoolId } as SchoolSettings);
    },
  });
}

/**
 * Keeps every workspace in sync with the office: when the school location, name, colours or alarm
 * settings change, drivers and parents see it immediately instead of after the cache expires.
 * Mounted once in the root layout.
 */
export function useSettingsSubscription() {
  const qc = useQueryClient();
  const session = useSession();
  const schoolId = session.schoolId;
  const enabled = session.status === 'signedIn';
  useEffect(() => {
    if (!enabled) return;
    const sub = client.models.SchoolSettings.onUpdate({ filter: { schoolId: { eq: schoolId } } }).subscribe({
      next: (s) => qc.setQueryData(qk.settings(schoolId), s),
      error: (e) => console.warn('settings subscription', e),
    });
    return () => sub.unsubscribe();
  }, [enabled, schoolId, qc]);
}

export function useSaveSettings() {
  const qc = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationFn: async (patch: Partial<SchoolSettings>) => {
      const schoolId = session.schoolId;
      const existing = await client.models.SchoolSettings.get({ schoolId });
      const { createdAt: _c, updatedAt: _u, ...rest } = patch as SchoolSettings;
      const input = { ...rest, schoolId };
      const res = existing.data ? await client.models.SchoolSettings.update(input) : await client.models.SchoolSettings.create({ ...DEFAULT_SETTINGS, ...input, name: input.name ?? DEFAULT_SETTINGS.name });
      return unwrap(res, 'settings');
    },
    onSuccess: (data) => {
      if (data) qc.setQueryData(qk.settings(data.schoolId), data);
    },
  });
}
