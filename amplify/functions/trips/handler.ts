import { audit, getDataClient, getSettings, listAll, mapLimit, nowIso, todayInTimezone, type DataClient, unwrap } from '../shared/data';
import { haversineMeters } from '../shared/geo';
import { formatTime, t } from '../shared/i18n';
import { notifyEach, notifyUsers, type PersonalNotice } from '../shared/notify';
import { HandlerError, opName, requireIdentity, type AppSyncEvent, type Caller } from '../shared/types';
import {
  NO_HOME_REASON,
  ROUTED_STATUSES,
  env,
  getCallerProfile,
  googleKey,
  loadStops,
  recompute,
  requireDriverOfBus,
  upsertBusLocation,
  validLatLng,
  type Profile,
  type StopStatus,
  type Trip,
  type TripStop,
  type TripType,
} from './core';
import { notifyDriverOfDayChanges, reverseGeocode, setDayStatus, syncStopsWithDayStatus, updateHomeLocation } from './pickup';

// ────────────────────────────── operations ──────────────────────────────
/** "Your bus is on the way" to every rider of the trip, in their language and with their own ETA. */
async function announceTripStart(client: DataClient, trip: Trip, riders: Profile[]) {
  const stops = await loadStops(client, trip.id);
  const byStudent = new Map(stops.map((s) => [s.studentId, s]));
  const notices: PersonalNotice[] = [];
  for (const r of riders) {
    const stop = byStudent.get(r.userId);
    if (!stop || stop.status === 'ABSENT') continue;
    const s = t(r.language);
    const data = {
      tripId: trip.id,
      tripStopId: stop.id,
      busId: trip.busId,
      kind: 'TRIP_STARTED',
    };
    if (stop.status === 'SKIPPED') {
      notices.push({
        userId: r.userId,
        title: s.tripNoHomeTitle,
        body: s.tripNoHomeBody,
        data: { ...data, kind: 'TRIP_NO_HOME' },
      });
      continue;
    }
    const min = stop.etaSeconds != null ? Math.max(1, Math.round(stop.etaSeconds / 60)) : null;
    const driver = trip.driverName ?? '';
    notices.push(
      trip.type === 'MORNING_PICKUP'
        ? {
            userId: r.userId,
            title: s.tripStartedMorningTitle,
            body: s.tripStartedMorningBody(driver, min),
            data: { ...data, etaSeconds: stop.etaSeconds ?? null },
          }
        : {
            userId: r.userId,
            title: s.tripStartedAfternoonTitle,
            body: s.tripStartedAfternoonBody(driver),
            data,
          },
    );
  }
  await notifyEach(client, { schoolId: trip.schoolId, type: 'TRIP', notices });
}

async function startTrip(
  client: DataClient,
  caller: Caller,
  args: {
    busId: string;
    type: TripType;
    lat?: number | null;
    lng?: number | null;
  },
): Promise<Trip> {
  const { profile, bus } = await requireDriverOfBus(client, caller, args.busId);
  const settings = await getSettings(client, bus.schoolId);
  const date = todayInTimezone(settings?.timezone);
  const here = validLatLng(args.lat, args.lng);

  const [todays, loc] = await Promise.all([
    listAll((nextToken) => client.models.Trip.listTripsByBusAndDate({ busId: args.busId, date: { eq: date } }, { limit: 20, nextToken })),
    client.models.BusLocation.get({ busId: args.busId }),
  ]);
  const active = todays.find((x) => x.status === 'ACTIVE');
  if (active) {
    if (active.type === args.type) {
      // Idempotent re-start (e.g. the app was reopened): still re-anchor the route to where the driver is now.
      return here
        ? recompute(client, active, {
            force: true,
            reason: 'restart',
            origin: here,
          })
        : active;
    }
    throw new HandlerError('End the current trip before starting another one', 'CONFLICT');
  }

  // The trip starts where the driver is: the live fix from the device, else the bus's last published
  // position, else the school. The live fix is also written to BusLocation so parents see the bus there.
  const startLocation =
    here ?? (loc.data && (loc.data.lat || loc.data.lng) ? { lat: loc.data.lat, lng: loc.data.lng } : (settings?.schoolLocation ?? undefined));
  const trip = unwrap(
    await client.models.Trip.create({
      busId: args.busId,
      schoolId: bus.schoolId,
      date,
      type: args.type,
      status: 'ACTIVE',
      driverUserId: caller.isAdmin ? (bus.driverUserId ?? caller.sub) : caller.sub,
      driverName: bus.driverName ?? profile?.fullName,
      busPlate: bus.plate,
      startedAt: nowIso(),
      startLocation,
      stopCount: 0,
      boardedCount: 0,
    }),
    'Trip.create',
  );
  // Publish the bus position first so riders opening the push see the bus immediately.
  const publish = here
    ? upsertBusLocation(client, args.busId, bus.schoolId, bus.driverUserId ?? caller.sub, here, trip.id)
    : loc.data
      ? client.models.BusLocation.update({
          busId: args.busId,
          tripId: trip.id,
          schoolId: bus.schoolId,
        })
      : Promise.resolve();

  const [students, dayStatuses] = await Promise.all([
    listAll((nextToken) => client.models.Profile.listProfilesByBus({ busId: args.busId }, { limit: 200, nextToken })),
    listAll((nextToken) => client.models.StudentDayStatus.listDayStatusByBusAndDate({ busId: args.busId, date: { eq: date } }, { limit: 200, nextToken })),
    publish,
  ]);
  const notGoing = new Set(dayStatuses.filter((d) => d.status === 'NOT_GOING').map((d) => d.studentId));
  const riders = students.filter((s) => s.role === 'STUDENT' && s.isActive !== false);
  await mapLimit(riders, 8, async (s, i) => {
    const absent = notGoing.has(s.userId);
    const noHome = !absent && !s.homeLocation;
    await client.models.TripStop.create({
      tripId: trip.id,
      busId: args.busId,
      schoolId: bus.schoolId,
      date,
      studentId: s.userId,
      studentName: s.fullName,
      parentPhone: s.parentPhone ?? undefined,
      homeAddress: s.homeAddress ?? undefined,
      location: s.homeLocation ?? undefined,
      pickupLabel: s.homeLabel ?? undefined,
      pickupNote: s.homeNote ?? undefined,
      order: absent || noHome ? 900 + i : i + 1,
      status: absent ? 'ABSENT' : noHome ? 'SKIPPED' : 'PENDING',
      skipReason: noHome ? NO_HOME_REASON : undefined,
      skippedAt: noHome ? nowIso() : undefined,
      alarmCount: 0,
    });
  });
  const counted = unwrap(await client.models.Trip.update({ id: trip.id, stopCount: riders.length }), 'Trip.update');
  const routed = await recompute(client, counted, {
    force: true,
    reason: 'start',
    origin: here,
  });
  await Promise.all([
    announceTripStart(client, routed, riders).catch((e) => console.error('trip start notifications failed', e)),
    audit(client, {
      schoolId: bus.schoolId,
      actorId: caller.sub,
      actorName: caller.username,
      action: 'START_TRIP',
      entityType: 'Trip',
      entityId: trip.id,
      after: { type: args.type, date },
    }),
  ]);
  return routed;
}

async function endTrip(client: DataClient, caller: Caller, args: { tripId: string }): Promise<Trip> {
  const trip = unwrap(await client.models.Trip.get({ id: args.tripId }), 'Trip.get');
  await requireDriverOfBus(client, caller, trip.busId);
  if (trip.status !== 'ACTIVE') return trip;
  const stops = await loadStops(client, trip.id);
  await mapLimit(
    stops.filter((s) => ROUTED_STATUSES.includes(s.status)),
    8,
    (s) =>
      client.models.TripStop.update({
        id: s.id,
        status: 'SKIPPED',
        skippedAt: nowIso(),
        skipReason: 'Trip ended',
      }),
  );
  const endedAt = nowIso();
  const updated = unwrap(
    await client.models.Trip.update({
      id: trip.id,
      status: 'COMPLETED',
      endedAt,
    }),
    'Trip.update',
  );
  const loc = await client.models.BusLocation.get({ busId: trip.busId });
  if (loc.data) await client.models.BusLocation.update({ busId: trip.busId, tripId: null });
  // Morning trip: the riders who boarded are now at school.
  const arrived = trip.type === 'MORNING_PICKUP' ? stops.filter((s) => s.status === 'BOARDED') : [];
  if (arrived.length) {
    const [settings, profiles] = await Promise.all([
      getSettings(client, trip.schoolId),
      mapLimit(arrived, 8, (s) => client.models.Profile.get({ userId: s.studentId }).then((r) => r.data)),
    ]);
    const notices: PersonalNotice[] = arrived.map((s, i) => {
      const lang = profiles[i]?.language;
      const str = t(lang);
      return {
        userId: s.studentId,
        title: str.arrivedSchoolTitle,
        body: str.arrivedSchoolBody(s.studentName, formatTime(endedAt, settings?.timezone, lang)),
        data: { tripId: trip.id, tripStopId: s.id, kind: 'ARRIVED_SCHOOL' },
      };
    });
    await notifyEach(client, {
      schoolId: trip.schoolId,
      type: 'TRIP',
      notices,
    }).catch((e) => console.error('arrival notifications failed', e));
  }
  await audit(client, {
    schoolId: trip.schoolId,
    actorId: caller.sub,
    actorName: caller.username,
    action: 'END_TRIP',
    entityType: 'Trip',
    entityId: trip.id,
  });
  return updated;
}

async function computeTripRoute(
  client: DataClient,
  caller: Caller,
  args: {
    tripId: string;
    force?: boolean | null;
    lat?: number | null;
    lng?: number | null;
  },
): Promise<Trip> {
  const trip = unwrap(await client.models.Trip.get({ id: args.tripId }), 'Trip.get');
  // Drivers, admins and the students of this bus may request a recompute (students after toggling
  // their day status). The 30 s rate limit keeps API cost bounded whoever calls.
  let isDriver = false;
  const profile = await getCallerProfile(client, caller);
  if (!profile || profile.schoolId !== trip.schoolId) throw new HandlerError('Trip not found', 'NOT_FOUND');
  if (!(caller.isAdmin && profile.role === 'ADMIN')) {
    if (profile.busId !== trip.busId) throw new HandlerError('Not allowed', 'FORBIDDEN');
    isDriver = profile.role === 'DRIVER';
  }
  // Only the driver's own device knows where the bus is; ignore positions sent by anyone else.
  const here = isDriver || caller.isAdmin ? validLatLng(args.lat, args.lng) : null;
  if (here && isDriver && trip.status === 'ACTIVE') await upsertBusLocation(client, trip.busId, trip.schoolId, caller.sub, here, trip.id);
  // "Not going today" / "going again" toggled during the trip: update the stops before routing.
  const changed = await syncStopsWithDayStatus(client, trip);
  const routed = await recompute(client, trip, {
    force: changed.length > 0 || (!!args.force && caller.isAdmin),
    reason: changed.length ? 'day-status' : caller.isAdmin ? 'admin' : 'request',
    origin: here,
  });
  await notifyDriverOfDayChanges(client, trip, changed).catch((e) => console.error('driver notice failed', e));
  return routed;
}

async function updateTripStop(client: DataClient, caller: Caller, args: { tripStopId: string; status: StopStatus; reason?: string | null }): Promise<TripStop> {
  const stop = unwrap(await client.models.TripStop.get({ id: args.tripStopId }), 'TripStop.get');
  const trip = unwrap(await client.models.Trip.get({ id: stop.tripId }), 'Trip.get');
  await requireDriverOfBus(client, caller, trip.busId);
  if (trip.status !== 'ACTIVE') throw new HandlerError('Trip is not active', 'CONFLICT');
  const allowed: StopStatus[] = ['BOARDED', 'DROPPED', 'SKIPPED', 'PENDING'];
  if (!allowed.includes(args.status)) throw new HandlerError(`Status ${args.status} cannot be set manually`, 'VALIDATION');

  const now = nowIso();
  const patch: Partial<TripStop> & { id: string } = {
    id: stop.id,
    status: args.status,
  };
  if (args.status === 'BOARDED') patch.boardedAt = now;
  if (args.status === 'DROPPED') patch.droppedAt = now;
  if (args.status === 'SKIPPED') {
    patch.skippedAt = now;
    patch.skipReason = args.reason?.slice(0, 200) ?? 'Skipped by driver';
  }
  if (args.status === 'PENDING') patch.skipReason = null;
  const updated = unwrap(await client.models.TripStop.update(patch), 'TripStop.update');

  if (args.status === 'BOARDED' || args.status === 'DROPPED') {
    const boardedDelta = args.status === 'BOARDED' && stop.status !== 'BOARDED' ? 1 : 0;
    const [student, settings] = await Promise.all([
      client.models.Profile.get({ userId: stop.studentId }),
      getSettings(client, trip.schoolId),
      boardedDelta
        ? client.models.Trip.update({
            id: trip.id,
            boardedCount: (trip.boardedCount ?? 0) + boardedDelta,
          })
        : Promise.resolve(null),
    ]);
    const s = t(student.data?.language);
    const time = formatTime(now, settings?.timezone, student.data?.language);
    await notifyUsers(client, {
      schoolId: trip.schoolId,
      userIds: [stop.studentId],
      type: args.status,
      title: args.status === 'BOARDED' ? s.boardedTitle : s.droppedTitle,
      body: args.status === 'BOARDED' ? s.boardedBody(stop.studentName, time) : s.droppedBody(stop.studentName, time),
      data: { tripId: trip.id, tripStopId: stop.id },
      push: true,
    });
  }
  return updated;
}

async function reorderTripStops(client: DataClient, caller: Caller, args: { tripId: string; stopIds: (string | null)[] }): Promise<Trip> {
  const trip = unwrap(await client.models.Trip.get({ id: args.tripId }), 'Trip.get');
  await requireDriverOfBus(client, caller, trip.busId);
  const ids = args.stopIds.filter((x): x is string => !!x);
  if (!ids.length) throw new HandlerError('No stops', 'VALIDATION');
  return recompute(client, trip, {
    manualOrder: ids,
    reason: 'manual-reorder',
  });
}

async function notifyBusNear(client: DataClient, caller: Caller, args: { tripStopId: string }) {
  const stop = unwrap(await client.models.TripStop.get({ id: args.tripStopId }), 'TripStop.get');
  const trip = unwrap(await client.models.Trip.get({ id: stop.tripId }), 'Trip.get');
  await requireDriverOfBus(client, caller, trip.busId);
  if (trip.status !== 'ACTIVE' || !ROUTED_STATUSES.includes(stop.status)) return { ok: false, message: 'Stop not pending' };
  if (stop.nearNotifiedAt && Date.now() - Date.parse(stop.nearNotifiedAt) < 10 * 60_000) return { ok: false, message: 'Already notified' };
  const loc = await client.models.BusLocation.get({ busId: trip.busId });
  const distance = loc.data && stop.location ? haversineMeters({ lat: loc.data.lat, lng: loc.data.lng }, stop.location) : Infinity;
  const etaMin = Math.max(1, Math.round((stop.etaSeconds ?? 120) / 60));
  // server-side sanity check: within 700 m or ≤ 3 min ETA (client fires at 400 m / 2 min)
  if (distance > 700 && (stop.etaSeconds ?? 9999) > 180) return { ok: false, message: 'Bus is not near yet' };
  const student = await client.models.Profile.get({ userId: stop.studentId });
  const s = t(student.data?.language);
  await notifyUsers(client, {
    schoolId: trip.schoolId,
    userIds: [stop.studentId],
    type: 'BUS_NEAR',
    title: s.busNearTitle,
    body: s.busNearBody(etaMin),
    data: { tripId: trip.id, tripStopId: stop.id, etaSeconds: stop.etaSeconds },
    push: true,
  });
  await client.models.TripStop.update({
    id: stop.id,
    nearNotifiedAt: nowIso(),
  });
  return { ok: true };
}

async function searchPlaces(args: { query: string; lat?: number | null; lng?: number | null; language?: string | null }) {
  const key = googleKey();
  const q = (args.query ?? '').trim();
  if (!key || q.length < 2) return { places: [] };
  const body: Record<string, unknown> = {
    textQuery: q,
    maxResultCount: 8,
    languageCode: args.language === 'ar' ? 'ar' : 'en',
  };
  if (args.lat != null && args.lng != null)
    body.locationBias = {
      circle: {
        center: { latitude: args.lat, longitude: args.lng },
        radius: 30000,
      },
    };
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error('places error', res.status, await res.text());
    return { places: [] };
  }
  const json = (await res.json()) as {
    places?: {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
    }[];
  };
  return {
    places: (json.places ?? []).map((p) => ({
      placeId: p.id,
      description: [p.displayName?.text, p.formattedAddress].filter(Boolean).join(' · '),
      lat: p.location?.latitude,
      lng: p.location?.longitude,
    })),
  };
}

// ────────────────────────────── entry point ──────────────────────────────
export const handler = async (event: AppSyncEvent<Record<string, unknown>>) => {
  const caller = requireIdentity(event);
  const client = await getDataClient(env);
  const args = event.arguments as never;
  try {
    switch (opName(event)) {
      case 'startTrip':
        return await startTrip(client, caller, args);
      case 'endTrip':
        return await endTrip(client, caller, args);
      case 'computeTripRoute':
        return await computeTripRoute(client, caller, args);
      case 'setStopStatus':
        return await updateTripStop(client, caller, args);
      case 'reorderTripStops':
        return await reorderTripStops(client, caller, args);
      case 'notifyBusNear':
        return await notifyBusNear(client, caller, args);
      case 'searchPlaces':
        return await searchPlaces(args);
      case 'reverseGeocode':
        return await reverseGeocode(args);
      case 'updateHomeLocation':
        return await updateHomeLocation(client, caller, args);
      case 'setDayStatus':
        return await setDayStatus(client, caller, args);
      default:
        throw new HandlerError(`Unknown operation ${opName(event)}`);
    }
  } catch (e) {
    if (e instanceof HandlerError) throw new Error(`[${e.code}] ${e.message}`);
    console.error(e);
    throw e;
  }
};
