import type { Schema } from '../../data/resource';
import { audit, getDataClient, getSettings, listAll, mapLimit, nowIso, todayInTimezone, type DataClient, type DataEnv, unwrap } from '../shared/data';
import { haversineMeters, type LatLng } from '../shared/geo';
import { formatTime, t } from '../shared/i18n';
import { notifyUsers } from '../shared/notify';
import { HandlerError, opName, requireIdentity, type AppSyncEvent, type Caller } from '../shared/types';
import { fallbackRouteApi, googleRoutesApi, planRoute, type RoutableStop, type RouteApi } from './routing';

type Env = DataEnv & { GOOGLE_ROUTES_API_KEY?: string };
const env = process.env as unknown as Env;

type Trip = Schema['Trip']['type'];
type TripStop = Schema['TripStop']['type'];
type Profile = Schema['Profile']['type'];
type StopStatus = Schema['StopStatus']['type'];
type TripType = Schema['TripType']['type'];

const ROUTE_RATE_LIMIT_MS = 30_000;
const ROUTED_STATUSES: StopStatus[] = ['PENDING', 'ALARMED', 'ACKNOWLEDGED'];

function routeApi(): RouteApi {
  const key = env.GOOGLE_ROUTES_API_KEY;
  if (!key || key.startsWith('<')) return fallbackRouteApi;
  return googleRoutesApi(key);
}

function parseMeta(meta: unknown): Record<string, unknown> {
  let v: unknown = meta;
  for (let i = 0; i < 3 && typeof v === 'string'; i++) {
    try {
      v = JSON.parse(v);
    } catch {
      return {};
    }
  }
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

async function getCallerProfile(client: DataClient, caller: Caller): Promise<Profile | null> {
  const res = await client.models.Profile.get({ userId: caller.sub });
  return res.data;
}

async function requireDriverOfBus(client: DataClient, caller: Caller, busId: string): Promise<Profile | null> {
  if (caller.isAdmin) return getCallerProfile(client, caller);
  const profile = await getCallerProfile(client, caller);
  if (!profile || profile.role !== 'DRIVER' || profile.busId !== busId) throw new HandlerError('Only the driver of this bus can do that', 'FORBIDDEN');
  if (profile.isActive === false) throw new HandlerError('Account disabled', 'FORBIDDEN');
  return profile;
}

async function loadStops(client: DataClient, tripId: string): Promise<TripStop[]> {
  return listAll((nextToken) => client.models.TripStop.listStopsByTrip({ tripId }, { limit: 200, nextToken }));
}

/** A usable GPS fix sent by the driver device (finite, in range, not the 0/0 placeholder). */
function validLatLng(lat?: number | null, lng?: number | null): LatLng | null {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

/**
 * Where the route starts: the driver's live fix sent with the request, else the bus's last
 * published position, else where the trip started, else the school.
 */
async function busOrigin(client: DataClient, trip: Trip, hint?: LatLng | null): Promise<LatLng> {
  if (hint) return hint;
  const loc = await client.models.BusLocation.get({ busId: trip.busId });
  if (loc.data && (loc.data.lat !== 0 || loc.data.lng !== 0)) return { lat: loc.data.lat, lng: loc.data.lng };
  if (trip.startLocation) return trip.startLocation;
  const settings = await getSettings(client, trip.schoolId);
  return settings?.schoolLocation ?? { lat: 0, lng: 0 };
}

/** Record the driver's position so the live map and the next route start from the right place. */
async function upsertBusLocation(client: DataClient, busId: string, driverUserId: string, pos: LatLng, tripId: string | null) {
  const existing = await client.models.BusLocation.get({ busId });
  const base = { busId, lat: pos.lat, lng: pos.lng, updatedAt: nowIso(), tripId };
  if (existing.data) await client.models.BusLocation.update(base);
  else await client.models.BusLocation.create({ ...base, driverUserId, heading: 0, speed: 0, accuracy: 0 });
}

/** Compute + persist the route for a trip. Returns the refreshed Trip. */
async function recompute(
  client: DataClient,
  trip: Trip,
  opts: { manualOrder?: string[]; force?: boolean; reason: string; origin?: LatLng | null },
): Promise<Trip> {
  if (trip.status !== 'ACTIVE' && trip.status !== 'PLANNED') return trip;
  const meta = parseMeta(trip.routeMeta);
  const last = typeof meta.computedAt === 'string' ? Date.parse(meta.computedAt) : 0;
  if (!opts.force && !opts.manualOrder && Date.now() - last < ROUTE_RATE_LIMIT_MS) return trip; // rate-limited: serve cached

  const [stops, settings, origin] = await Promise.all([loadStops(client, trip.id), getSettings(client, trip.schoolId), busOrigin(client, trip, opts.origin)]);
  const routable: RoutableStop[] = stops
    .filter((s) => ROUTED_STATUSES.includes(s.status) && s.location)
    .map((s) => ({ id: s.id, location: { lat: s.location!.lat, lng: s.location!.lng } }));
  const finalDestination = trip.type === 'MORNING_PICKUP' ? (settings?.schoolLocation ?? null) : null;
  const manualOrder = opts.manualOrder ?? (meta.manualOrder === true && !opts.force ? (meta.manualOrderIds as string[] | undefined) : undefined);

  const plan = await planRoute({ origin, stops: routable, finalDestination, optimize: !manualOrder, manualOrder }, routeApi());

  const planned = new Map(plan.stops.map((p) => [p.id, p]));
  let tail = plan.stops.length;
  await mapLimit(stops, 8, async (s) => {
    const p = planned.get(s.id);
    if (p) {
      if (s.order !== p.order || s.etaSeconds !== p.etaSeconds || s.distanceMeters !== p.distanceMeters) {
        await client.models.TripStop.update({ id: s.id, order: p.order, etaSeconds: p.etaSeconds, distanceMeters: p.distanceMeters });
      }
    } else if (ROUTED_STATUSES.includes(s.status)) {
      // routed status but no location → keep at the end so the driver still sees it
      tail++;
      if (s.order !== 900 + tail) await client.models.TripStop.update({ id: s.id, order: 900 + tail, etaSeconds: null, distanceMeters: null });
    } else if (s.order < 900) {
      tail++;
      await client.models.TripStop.update({ id: s.id, order: 900 + tail });
    }
  });

  const routeMeta = {
    distanceMeters: plan.distanceMeters,
    durationSeconds: plan.durationSeconds,
    computedAt: plan.computedAt,
    source: plan.source,
    chunks: plan.chunks,
    optimized: plan.optimized,
    manualOrder: !!manualOrder,
    manualOrderIds: manualOrder ?? undefined,
    optimizedOrder: plan.stops.map((s) => s.id),
    stopCount: plan.stops.length,
    reason: opts.reason,
    warnings: plan.warnings,
    origin,
  };
  return unwrap(await client.models.Trip.update({ id: trip.id, routePolyline: plan.polyline, routeMeta: JSON.stringify(routeMeta) }), 'Trip.update');
}

// ────────────────────────────── operations ──────────────────────────────
async function startTrip(client: DataClient, caller: Caller, args: { busId: string; type: TripType; lat?: number | null; lng?: number | null }): Promise<Trip> {
  const profile = await requireDriverOfBus(client, caller, args.busId);
  const bus = unwrap(await client.models.Bus.get({ busId: args.busId }), 'Bus.get');
  const settings = await getSettings(client, bus.schoolId);
  const date = todayInTimezone(settings?.timezone);
  const here = validLatLng(args.lat, args.lng);

  const todays = await listAll((nextToken) => client.models.Trip.listTripsByBusAndDate({ busId: args.busId, date: { eq: date } }, { limit: 20, nextToken }));
  const active = todays.find((x) => x.status === 'ACTIVE');
  if (active) {
    if (active.type === args.type) {
      // Idempotent re-start (e.g. the app was reopened): still re-anchor the route to where the driver is now.
      return here ? recompute(client, active, { force: true, reason: 'restart', origin: here }) : active;
    }
    throw new HandlerError('End the current trip before starting another one', 'CONFLICT');
  }

  const loc = await client.models.BusLocation.get({ busId: args.busId });
  // The trip starts where the driver is: the live fix from the device, else the bus's last published
  // position, else the school. The live fix is also written to BusLocation so parents see the bus there.
  const startLocation = here ?? (loc.data && (loc.data.lat || loc.data.lng) ? { lat: loc.data.lat, lng: loc.data.lng } : (settings?.schoolLocation ?? undefined));
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

  const [students, dayStatuses] = await Promise.all([
    listAll((nextToken) => client.models.Profile.listProfilesByBus({ busId: args.busId }, { limit: 200, nextToken })),
    listAll((nextToken) => client.models.StudentDayStatus.listDayStatusByBusAndDate({ busId: args.busId, date: { eq: date } }, { limit: 200, nextToken })),
  ]);
  const notGoing = new Set(dayStatuses.filter((d) => d.status === 'NOT_GOING').map((d) => d.studentId));
  const riders = students.filter((s) => s.role === 'STUDENT' && s.isActive !== false);
  await mapLimit(riders, 8, async (s, i) => {
    const absent = notGoing.has(s.userId);
    const noHome = !absent && !s.homeLocation;
    await client.models.TripStop.create({
      tripId: trip.id,
      busId: args.busId,
      date,
      studentId: s.userId,
      studentName: s.fullName,
      parentPhone: s.parentPhone ?? undefined,
      homeAddress: s.homeAddress ?? undefined,
      location: s.homeLocation ?? undefined,
      order: absent || noHome ? 900 + i : i + 1,
      status: absent ? 'ABSENT' : noHome ? 'SKIPPED' : 'PENDING',
      skipReason: noHome ? 'No home location set' : undefined,
      skippedAt: noHome ? nowIso() : undefined,
      alarmCount: 0,
    });
  });
  await client.models.Trip.update({ id: trip.id, stopCount: riders.length });
  if (here) await upsertBusLocation(client, args.busId, bus.driverUserId ?? caller.sub, here, trip.id);
  else if (loc.data) await client.models.BusLocation.update({ busId: args.busId, tripId: trip.id });

  const routed = await recompute(client, { ...trip, stopCount: riders.length }, { force: true, reason: 'start', origin: here });
  await audit(client, { schoolId: bus.schoolId, actorId: caller.sub, actorName: caller.username, action: 'START_TRIP', entityType: 'Trip', entityId: trip.id, after: { type: args.type, date } });
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
    (s) => client.models.TripStop.update({ id: s.id, status: 'SKIPPED', skippedAt: nowIso(), skipReason: 'Trip ended' }),
  );
  const updated = unwrap(await client.models.Trip.update({ id: trip.id, status: 'COMPLETED', endedAt: nowIso() }), 'Trip.update');
  const loc = await client.models.BusLocation.get({ busId: trip.busId });
  if (loc.data) await client.models.BusLocation.update({ busId: trip.busId, tripId: null });
  await audit(client, { schoolId: trip.schoolId, actorId: caller.sub, actorName: caller.username, action: 'END_TRIP', entityType: 'Trip', entityId: trip.id });
  return updated;
}

async function computeTripRoute(
  client: DataClient,
  caller: Caller,
  args: { tripId: string; force?: boolean | null; lat?: number | null; lng?: number | null },
): Promise<Trip> {
  const trip = unwrap(await client.models.Trip.get({ id: args.tripId }), 'Trip.get');
  // Drivers, admins and the students of this bus may request a recompute (students after toggling
  // their day status). The 30 s rate limit keeps API cost bounded whoever calls.
  let isDriver = false;
  if (!caller.isAdmin) {
    const profile = await getCallerProfile(client, caller);
    if (!profile || profile.busId !== trip.busId) throw new HandlerError('Not allowed', 'FORBIDDEN');
    isDriver = profile.role === 'DRIVER';
  }
  // Only the driver's own device knows where the bus is; ignore positions sent by anyone else.
  const here = isDriver || caller.isAdmin ? validLatLng(args.lat, args.lng) : null;
  if (here && isDriver && trip.status === 'ACTIVE') await upsertBusLocation(client, trip.busId, caller.sub, here, trip.id);
  return recompute(client, trip, { force: !!args.force && caller.isAdmin, reason: caller.isAdmin ? 'admin' : 'request', origin: here });
}

async function updateTripStop(client: DataClient, caller: Caller, args: { tripStopId: string; status: StopStatus; reason?: string | null }): Promise<TripStop> {
  const stop = unwrap(await client.models.TripStop.get({ id: args.tripStopId }), 'TripStop.get');
  const trip = unwrap(await client.models.Trip.get({ id: stop.tripId }), 'Trip.get');
  await requireDriverOfBus(client, caller, trip.busId);
  if (trip.status !== 'ACTIVE') throw new HandlerError('Trip is not active', 'CONFLICT');
  const allowed: StopStatus[] = ['BOARDED', 'DROPPED', 'SKIPPED', 'PENDING'];
  if (!allowed.includes(args.status)) throw new HandlerError(`Status ${args.status} cannot be set manually`, 'VALIDATION');

  const now = nowIso();
  const patch: Partial<TripStop> & { id: string } = { id: stop.id, status: args.status };
  if (args.status === 'BOARDED') patch.boardedAt = now;
  if (args.status === 'DROPPED') patch.droppedAt = now;
  if (args.status === 'SKIPPED') {
    patch.skippedAt = now;
    patch.skipReason = args.reason?.slice(0, 200) ?? 'Skipped by driver';
  }
  if (args.status === 'PENDING') patch.skipReason = null;
  const updated = unwrap(await client.models.TripStop.update(patch), 'TripStop.update');

  if (args.status === 'BOARDED' || args.status === 'DROPPED') {
    if (args.status === 'BOARDED' && stop.status !== 'BOARDED') {
      await client.models.Trip.update({ id: trip.id, boardedCount: (trip.boardedCount ?? 0) + 1 });
    }
    const student = await client.models.Profile.get({ userId: stop.studentId });
    const settings = await getSettings(client, trip.schoolId);
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
  return recompute(client, trip, { manualOrder: ids, reason: 'manual-reorder' });
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
  await client.models.TripStop.update({ id: stop.id, nearNotifiedAt: nowIso() });
  return { ok: true };
}

async function searchPlaces(args: { query: string; lat?: number | null; lng?: number | null }) {
  const key = env.GOOGLE_ROUTES_API_KEY;
  const q = (args.query ?? '').trim();
  if (!key || key.startsWith('<') || q.length < 2) return { places: [] };
  const body: Record<string, unknown> = { textQuery: q, maxResultCount: 8, languageCode: 'en' };
  if (args.lat != null && args.lng != null) body.locationBias = { circle: { center: { latitude: args.lat, longitude: args.lng }, radius: 30000 } };
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
    places?: { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } }[];
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
      default:
        throw new HandlerError(`Unknown operation ${opName(event)}`);
    }
  } catch (e) {
    if (e instanceof HandlerError) throw new Error(`[${e.code}] ${e.message}`);
    console.error(e);
    throw e;
  }
};
