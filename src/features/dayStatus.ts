import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client, listAll, unwrap, type DayStatus, type StudentDayStatus } from '../lib/data/client';
import { qk } from '../lib/query/client';
import { useSession } from '../lib/auth/session';

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
  const session = useSession();
  const schoolId = session.schoolId;
  return useQuery({
    queryKey: [...qk.absencesByDate(date), schoolId],
    enabled: enabled && !!schoolId,
    staleTime: 30_000,
    queryFn: async () =>
      (await listAll((nextToken) => client.models.StudentDayStatus.listDayStatusBySchoolAndDate({ schoolId, date: { eq: date } }, { limit: 200, nextToken }))).filter(
        (s) => s.status === 'NOT_GOING',
      ),
  });
}

/**
 * "Not going today" (optionally until a later day) / "I'm going again". Written by the server, which
 * also takes the stop off – or back onto – a running trip, re-routes the bus and tells the driver.
 */
export function useSetDayStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { studentId: string; busId: string; date: string; status: DayStatus; note?: string | null; untilDate?: string | null }) => {
      const res = await client.mutations.setDayStatus({ date: input.date, status: input.status, note: input.note || undefined, untilDate: input.status === 'NOT_GOING' ? (input.untilDate ?? undefined) : undefined });
      return (unwrap(res, 'day status') ?? []).filter((r): r is StudentDayStatus => !!r);
    },
    onMutate: async (input) => {
      // Flip the button instantly; the server confirms (or the error rolls it back).
      const key = qk.dayStatus(input.studentId, input.date);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<StudentDayStatus | null>(key);
      qc.setQueryData(key, { ...(prev ?? {}), studentId: input.studentId, date: input.date, status: input.status, note: input.note ?? null, untilDate: input.untilDate ?? null } as StudentDayStatus);
      return { prev, key };
    },
    onError: (_e, _input, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev ?? null);
    },
    onSuccess: (rows, input) => {
      for (const r of rows) qc.setQueryData(qk.dayStatus(r.studentId, r.date), r);
      void qc.invalidateQueries({ queryKey: qk.dayStatusByBus(input.busId, input.date) });
      void qc.invalidateQueries({ queryKey: ['stops'] });
    },
  });
}
