import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client, listAll, parseJson, unwrap, type BusLocation, type StopStatus, type Trip, type TripStop, type TripType } from '../lib/data/client';
import { qk } from '../lib/query/client';
import { useSession } from '../lib/auth/session';
import { addDays } from '../lib/util/format';

export type RouteMeta = {
  distanceMeters?: number;
  durationSeconds?: number;
  computedAt?: string;
  source?: 'GOOGLE' | 'FALLBACK';
  chunks?: number;
  optimized?: boolean;
  manualOrder?: boolean;
  optimizedOrder?: string[];
  stopCount?: number;
  warnings?: string[];
  origin?: { lat: number; lng: number };
  /** Live traffic along the route polyline: [startIndex, endIndex, level] with 1 = slow, 2 = jam. */
  traffic?: [number, number, number][];
};

export const routeMetaOf = (trip: Trip | null | undefined): RouteMeta => parseJson<RouteMeta>(trip?.routeMeta) ?? {};

export function useTripsForBusOnDate(busId: string | null | undefined, date: string, opts?: { poll?: number | false }) {
  return useQuery({
    queryKey: qk.tripsByBusDate(busId ?? '', date),
    enabled: !!busId,
    staleTime: 10_000,
    // Safety net under the live subscription (a socket can drop while the phone sleeps).
    refetchInterval: opts?.poll ?? false,
    queryFn: async () => listAll((nextToken) => client.models.Trip.listTripsByBusAndDate({ busId: busId!, date: { eq: date } }, { limit: 20, nextToken })),
  });
}

export function useActiveTrip(busId: string | null | undefined, date: string, opts?: { poll?: number | false }) {
  const q = useTripsForBusOnDate(busId, date, opts);
  const active = q.data?.find((t) => t.status === 'ACTIVE') ?? null;
  const latest = q.data?.slice().sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))[0] ?? null;
  return { ...q, active, latest };
}

export function useTripsOnDate(date: string, enabled = true) {
  const session = useSession();
  const schoolId = session.schoolId;
  return useQuery({
    queryKey: [...qk.tripsByDate(date), schoolId],
    enabled: enabled && !!schoolId,
    staleTime: 10_000,
    queryFn: async () => listAll((nextToken) => client.models.Trip.listTripsBySchoolAndDate({ schoolId, date: { eq: date } }, { limit: 100, nextToken })),
  });
}

/** Trip history for a bus (last N days). */
export function useTripHistory(busId: string | null | undefined, days = 30) {
  const today = new Date().toISOString().slice(0, 10);
  const from = addDays(today, -days);
  return useQuery({
    queryKey: [...qk.tripHistory(busId ?? ''), from],
    enabled: !!busId,
    staleTime: 60_000,
    queryFn: async () => listAll((nextToken) => client.models.Trip.listTripsByBusAndDate({ busId: busId!, date: { between: [from, today] } }, { limit: 100, nextToken, sortDirection: 'DESC' })),
  });
}

export function useTrip(tripId: string | null | undefined) {
  return useQuery({
    queryKey: qk.trip(tripId ?? ''),
    enabled: !!tripId,
    queryFn: async () => unwrap(await client.models.Trip.get({ id: tripId! }), 'trip'),
  });
}

export function useTripStops(tripId: string | null | undefined) {
  return useQuery({
    queryKey: qk.stops(tripId ?? ''),
    enabled: !!tripId,
    staleTime: 5_000,
    queryFn: async () => listAll((nextToken) => client.models.TripStop.listStopsByTrip({ tripId: tripId! }, { limit: 200, nextToken })),
  });
}

/** Stops of a student over the last 30 days (trip history on the Bus tab). */
export function useStudentStops(studentId: string | null | undefined, days = 30) {
  const today = new Date().toISOString().slice(0, 10);
  const from = addDays(today, -days);
  return useQuery({
    queryKey: [...qk.stopsByStudent(studentId ?? ''), from],
    enabled: !!studentId,
    staleTime: 30_000,
    queryFn: async () => listAll((nextToken) => client.models.TripStop.listStopsByStudentAndDate({ studentId: studentId!, date: { between: [from, today] } }, { limit: 100, nextToken, sortDirection: 'DESC' })),
  });
}

export function useBusLocation(busId: string | null | undefined, opts?: { poll?: number | false }) {
  return useQuery({
    queryKey: qk.busLocation(busId ?? ''),
    enabled: !!busId,
    staleTime: 4_000,
    refetchInterval: opts?.poll ?? false,
    queryFn: async () => unwrap(await client.models.BusLocation.get({ busId: busId! }), 'bus location'),
  });
}

/** Live subscription to one bus' location; only active while the calling screen is mounted. */
export function useBusLocationSubscription(busId: string | null | undefined, enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!busId || !enabled) return;
    const sub = client.models.BusLocation.onUpdate({ filter: { busId: { eq: busId } } }).subscribe({
      next: (loc) => qc.setQueryData<BusLocation | null>(qk.busLocation(busId), loc),
      error: (e) => console.warn('busLocation sub', e),
    });
    return () => sub.unsubscribe();
  }, [busId, enabled, qc]);
}

/**
 * Rider side: know the moment the driver starts (or ends) a trip, without waiting for a refresh.
 * New trips arrive through onCreate; status / route changes through onUpdate.
 */
export function useBusTripsSubscription(busId: string | null | undefined, date: string, enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!busId || !enabled) return;
    const upsert = (trip: Trip) => {
      if (trip.busId !== busId) return;
      qc.setQueryData<Trip[]>(qk.tripsByBusDate(busId, trip.date), (old) => {
        const list = old ?? [];
        return list.some((t) => t.id === trip.id) ? list.map((t) => (t.id === trip.id ? { ...t, ...trip } : t)) : [...list, trip];
      });
      qc.setQueryData<Trip | null>(qk.trip(trip.id), (old) => ({ ...(old ?? {}), ...trip }) as Trip);
      // Stops are written right after the trip; re-read them whenever the trip (count, route) changes.
      void qc.invalidateQueries({ queryKey: qk.stops(trip.id) });
    };
    const s1 = client.models.Trip.onCreate({ filter: { busId: { eq: busId } } }).subscribe({ next: upsert, error: (e) => console.warn('trip create sub', e) });
    const s2 = client.models.Trip.onUpdate({ filter: { busId: { eq: busId } } }).subscribe({ next: upsert, error: (e) => console.warn('trip update sub', e) });
    return () => {
      s1.unsubscribe();
      s2.unsubscribe();
    };
  }, [busId, date, enabled, qc]);
}

/** Rider side: the student's own stop (alarm, boarded, ETA, moved pickup) the instant it changes. */
export function useMyStopSubscription(studentId: string | null | undefined, enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!studentId || !enabled) return;
    const upsert = (stop: TripStop) => {
      if (stop.studentId !== studentId) return;
      qc.setQueryData<TripStop[]>(qk.stops(stop.tripId), (old) => {
        if (!old) return old;
        const next = old.some((s) => s.id === stop.id) ? old.map((s) => (s.id === stop.id ? { ...s, ...stop } : s)) : [...old, stop];
        return next.sort((a, b) => a.order - b.order);
      });
    };
    const s1 = client.models.TripStop.onCreate({ filter: { studentId: { eq: studentId } } }).subscribe({ next: upsert, error: (e) => console.warn('my stop create sub', e) });
    const s2 = client.models.TripStop.onUpdate({ filter: { studentId: { eq: studentId } } }).subscribe({ next: upsert, error: (e) => console.warn('my stop update sub', e) });
    return () => {
      s1.unsubscribe();
      s2.unsubscribe();
    };
  }, [studentId, enabled, qc]);
}

/** Live trip + stops updates for a trip (driver map, parent Bus tab). */
export function useTripSubscriptions(tripId: string | null | undefined, enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!tripId || !enabled) return;
    const stopSub = client.models.TripStop.onUpdate({ filter: { tripId: { eq: tripId } } }).subscribe({
      next: (stop) =>
        qc.setQueryData<TripStop[]>(qk.stops(tripId), (old) => {
          if (!old) return old;
          const idx = old.findIndex((s) => s.id === stop.id);
          const next = idx >= 0 ? old.map((s) => (s.id === stop.id ? { ...s, ...stop } : s)) : [...old, stop];
          return next.sort((a, b) => a.order - b.order);
        }),
      error: (e) => console.warn('stop sub', e),
    });
    const tripSub = client.models.Trip.onUpdate({ filter: { id: { eq: tripId } } }).subscribe({
      next: (trip) => {
        qc.setQueryData<Trip | null>(qk.trip(tripId), trip);
        qc.setQueryData<Trip[]>(qk.tripsByBusDate(trip.busId, trip.date), (old) => old?.map((t) => (t.id === trip.id ? trip : t)) ?? old);
      },
      error: (e) => console.warn('trip sub', e),
    });
    return () => {
      stopSub.unsubscribe();
      tripSub.unsubscribe();
    };
  }, [tripId, enabled, qc]);
}

export function useStartTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { busId: string; type: TripType; lat?: number | null; lng?: number | null }) => unwrap(await client.mutations.startTrip(input), 'start trip'),
    onSuccess: (trip) => {
      if (!trip) return;
      qc.setQueryData(qk.trip(trip.id), trip);
      void qc.invalidateQueries({ queryKey: qk.tripsByBusDate(trip.busId, trip.date) });
      void qc.invalidateQueries({ queryKey: qk.stops(trip.id) });
    },
  });
}

export function useEndTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tripId: string) => unwrap(await client.mutations.endTrip({ tripId }), 'end trip'),
    onSuccess: (trip) => {
      if (!trip) return;
      qc.setQueryData(qk.trip(trip.id), trip);
      void qc.invalidateQueries({ queryKey: qk.tripsByBusDate(trip.busId, trip.date) });
      void qc.invalidateQueries({ queryKey: qk.stops(trip.id) });
    },
  });
}

export function useComputeRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tripId: string; force?: boolean; lat?: number | null; lng?: number | null }) => unwrap(await client.mutations.computeTripRoute(input), 'route'),
    onSuccess: (trip) => {
      if (!trip) return;
      qc.setQueryData(qk.trip(trip.id), trip);
      void qc.invalidateQueries({ queryKey: qk.stops(trip.id) });
    },
  });
}

export function useUpdateStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tripStopId: string; status: StopStatus; reason?: string }) => unwrap(await client.mutations.setStopStatus(input), 'stop'),
    onMutate: async (input) => {
      // optimistic status flip on the cached stops list
      const all = qc.getQueriesData<TripStop[]>({ queryKey: ['stops'] });
      for (const [key, stops] of all) {
        if (stops?.some((s) => s.id === input.tripStopId)) {
          qc.setQueryData<TripStop[]>(key, stops.map((s) => (s.id === input.tripStopId ? { ...s, status: input.status } : s)));
        }
      }
    },
    onSuccess: (stop) => {
      if (stop) void qc.invalidateQueries({ queryKey: qk.stops(stop.tripId) });
    },
    onError: () => void qc.invalidateQueries({ queryKey: ['stops'] }),
  });
}

export function useReorderStops() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tripId: string; stopIds: string[] }) => unwrap(await client.mutations.reorderTripStops(input), 'reorder'),
    onSuccess: (trip) => {
      if (!trip) return;
      qc.setQueryData(qk.trip(trip.id), trip);
      void qc.invalidateQueries({ queryKey: qk.stops(trip.id) });
    },
  });
}

export function useNotifyBusNear() {
  return useMutation({ mutationFn: async (tripStopId: string) => unwrap(await client.mutations.notifyBusNear({ tripStopId }), 'near') });
}

export function useAlarmStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tripStopId: string) => unwrap(await client.mutations.alarmStudent({ tripStopId }), 'alarm'),
    onSuccess: (stop) => {
      if (stop) void qc.invalidateQueries({ queryKey: qk.stops(stop.tripId) });
    },
  });
}

export function useAcknowledgeAlarm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tripStopId: string) => unwrap(await client.mutations.acknowledgeAlarm({ tripStopId }), 'acknowledge'),
    onSuccess: (stop) => {
      if (stop) {
        void qc.invalidateQueries({ queryKey: qk.stops(stop.tripId) });
        void qc.invalidateQueries({ queryKey: ['stops', 'student'] });
      }
    },
  });
}

export function useTestAlarm() {
  return useMutation({ mutationFn: async () => unwrap(await client.mutations.testAlarm({}), 'test alarm') });
}

/** Publish the bus position (driver device). Called by the location task with throttling applied upstream. */
export async function publishBusLocation(input: {
  busId: string;
  schoolId?: string | null;
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  tripId?: string | null;
}) {
  const res = await client.models.BusLocation.update({
    busId: input.busId,
    ...(input.schoolId ? { schoolId: input.schoolId } : {}),
    lat: input.lat,
    lng: input.lng,
    heading: input.heading ?? undefined,
    speed: input.speed ?? undefined,
    accuracy: input.accuracy ?? undefined,
    updatedAt: new Date().toISOString(),
    ...(input.tripId !== undefined ? { tripId: input.tripId } : {}),
  });
  return unwrap(res, 'bus location');
}
