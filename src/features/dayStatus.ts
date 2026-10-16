import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client, listAll, unwrap, type DayStatus, type StudentDayStatus } from '../lib/data/client';
import { qk } from '../lib/query/client';
import { expandAbsenceRange } from '../lib/rules/dayStatus';

export { LOCKED_STOP_STATUSES, canChangeDayStatus, expandAbsenceRange } from '../lib/rules/dayStatus';

export function useMyDayStatus(studentId: string | null | undefined, date: string) {
  return useQuery({
    queryKey: qk.dayStatus(studentId ?? '', date),
    enabled: !!studentId,
    staleTime: 10_000,
    queryFn: async () => unwrap(await client.models.StudentDayStatus.get({ studentId: studentId!, date }), 'day status'),
  });
}

export function useBusDayStatuses(busId: string | null | undefined, date: string) {
  return useQuery({
    queryKey: qk.dayStatusByBus(busId ?? '', date),
    enabled: !!busId,
    staleTime: 10_000,
    queryFn: async () => listAll((nextToken) => client.models.StudentDayStatus.listDayStatusByBusAndDate({ busId: busId!, date: { eq: date } }, { limit: 200, nextToken })),
  });
}

/** Driver map: turn markers red the instant a student toggles "not going". */
export function useBusDayStatusSubscription(busId: string | null | undefined, date: string, enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!busId || !enabled) return;
    const upsert = (row: StudentDayStatus) => {
      if (row.date !== date) return;
      qc.setQueryData<StudentDayStatus[]>(qk.dayStatusByBus(busId, date), (old) => {
        const list = old ?? [];
        const idx = list.findIndex((r) => r.studentId === row.studentId);
        return idx >= 0 ? list.map((r) => (r.studentId === row.studentId ? row : r)) : [...list, row];
      });
    };
    const s1 = client.models.StudentDayStatus.onCreate({ filter: { busId: { eq: busId } } }).subscribe({ next: upsert, error: (e) => console.warn('dayStatus sub', e) });
    const s2 = client.models.StudentDayStatus.onUpdate({ filter: { busId: { eq: busId } } }).subscribe({ next: upsert, error: (e) => console.warn('dayStatus sub', e) });
    return () => {
      s1.unsubscribe();
      s2.unsubscribe();
    };
  }, [busId, date, enabled, qc]);
}

export function useAbsencesOnDate(date: string, enabled = true) {
  return useQuery({
    queryKey: qk.absencesByDate(date),
    enabled,
    staleTime: 30_000,
    queryFn: async () => listAll((nextToken) => client.models.StudentDayStatus.listDayStatusByDate({ date, status: { eq: 'NOT_GOING' } }, { limit: 200, nextToken })),
  });
}

export function useSetDayStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      studentId: string;
      studentName: string;
      busId: string;
      schoolId: string;
      date: string;
      status: DayStatus;
      note?: string | null;
      untilDate?: string | null;
      setBy: string;
      activeTripId?: string | null;
    }) => {
      const days = input.status === 'NOT_GOING' ? expandAbsenceRange(input.date, input.untilDate) : [input.date];
      const results: StudentDayStatus[] = [];
      for (const date of days) {
        const existing = await client.models.StudentDayStatus.get({ studentId: input.studentId, date });
        const base = { studentId: input.studentId, date, ownerId: input.studentId, busId: input.busId, schoolId: input.schoolId, studentName: input.studentName, status: input.status, note: input.note ?? null, setBy: input.setBy, untilDate: input.untilDate ?? null };
        const res = existing.data ? await client.models.StudentDayStatus.update(base) : await client.models.StudentDayStatus.create(base);
        const row = unwrap(res, 'day status');
        if (row) results.push(row);
      }
      if (input.activeTripId) {
        // Route is recomputed server-side (rate-limited); fire and forget.
        client.mutations.computeTripRoute({ tripId: input.activeTripId }).catch(() => undefined);
      }
      return results;
    },
    onSuccess: (rows, input) => {
      for (const r of rows) qc.setQueryData(qk.dayStatus(r.studentId, r.date), r);
      void qc.invalidateQueries({ queryKey: qk.dayStatusByBus(input.busId, input.date) });
    },
  });
}
