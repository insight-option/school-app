import type { Schema } from '../../data/resource';
import { getSettings, listAll, mapLimit, nowIso, todayInTimezone, type DataClient, type DataEnv, unwrap } from '../shared/data';
import type { LatLng } from '../shared/geo';
import { HandlerError, type Caller } from '../shared/types';
import { fallbackRouteApi, googleRoutesApi, planRoute, type RoutableStop, type RouteApi } from './routing';

export type Env = DataEnv & { GOOGLE_ROUTES_API_KEY?: string };
export const env = process.env as unknown as Env;

export type Trip = Schema['Trip']['type'];
export type TripStop = Schema['TripStop']['type'];
export type Profile = Schema['Profile']['type'];
export type Bus = Schema['Bus']['type'];
export type StopStatus = Schema['StopStatus']['type'];
export type TripType = Schema['TripType']['type'];

export const ROUTE_RATE_LIMIT_MS = 30_000;
export const ROUTED_STATUSES: StopStatus[] = ['PENDING', 'ALARMED', 'ACKNOWLEDGED'];
/** Skip reason written when a rider had no pickup point at trip start – cleared once they set one. */
export const NO_HOME_REASON = 'No home location set';

export function googleKey(): string | null {
  const key = env.GOOGLE_ROUTES_API_KEY;
  return key && !key.startsWith('<') ? key : null;
}

function routeApi(): RouteApi {
  const key = googleKey();
  return key ? googleRoutesApi(key) : fallbackRouteApi;
}

export function parseMeta(meta: unknown): Record<string, unknown> {
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

export async function getCallerProfile(client: DataClient, caller: Caller): Promise<Profile | null> {
  const res = await client.models.Profile.get({ userId: caller.sub });
  return res.data;
}

/**
 * The bus's own driver, or an office admin of the bus's school. Buses of other schools are reported as
 * missing so their existence is never revealed.
 */
export async function requireDriverOfBus(client: DataClient, caller: Caller, busId: string): Promise<{ profile: Profile; bus: Bus }> {
  const profile = await getCallerProfile(client, caller);
  if (!profile) throw new HandlerError('Your account is not linked to a school yet.', 'FORBIDDEN');
  if (profile.isActive === false) throw new HandlerError('Account disabled', 'FORBIDDEN');
  const bus = (await client.models.Bus.get({ busId })).data;
  if (!bus || bus.schoolId !== profile.schoolId) throw new HandlerError('Bus not found', 'NOT_FOUND');
  if (caller.isAdmin && profile.role === 'ADMIN') return { profile, bus };
  if (profile.role !== 'DRIVER' || profile.busId !== busId) throw new HandlerError('Only the driver of this bus can do that', 'FORBIDDEN');
  return { profile, bus };
}

export async function loadStops(client: DataClient, tripId: string): Promise<TripStop[]> {
  return listAll((nextToken) => client.models.TripStop.listStopsByTrip({ tripId }, { limit: 200, nextToken }));
}

/** Today's ACTIVE trip of a bus (in the school's timezone), if any. */
export async function activeTripOfBus(client: DataClient, busId: string, timezone?: string | null): Promise<Trip | null> {
  const date = todayInTimezone(timezone);
  const todays = await listAll((nextToken) => client.models.Trip.listTripsByBusAndDate({ busId, date: { eq: date } }, { limit: 20, nextToken }));
  return todays.find((x) => x.status === 'ACTIVE') ?? null;
}

/** A usable GPS fix sent by the driver device (finite, in range, not the 0/0 placeholder). */
export function validLatLng(lat?: number | null, lng?: number | null): LatLng | null {
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
export async function upsertBusLocation(client: DataClient, busId: string, schoolId: string, driverUserId: string, pos: LatLng, tripId: string | null) {
  const existing = await client.models.BusLocation.get({ busId });
  const base = {
    busId,
    schoolId,
    lat: pos.lat,
    lng: pos.lng,
    updatedAt: nowIso(),
    tripId,
  };
  if (existing.data) await client.models.BusLocation.update(base);
  else
    await client.models.BusLocation.create({
      ...base,
      driverUserId,
      heading: 0,
      speed: 0,
      accuracy: 0,
    });
}

/** Compute + persist the route for a trip. Returns the refreshed Trip. */
export async function recompute(
  client: DataClient,
  trip: Trip,
  opts: {
    manualOrder?: string[];
    force?: boolean;
    reason: string;
    origin?: LatLng | null;
  },
): Promise<Trip> {
  if (trip.status !== 'ACTIVE' && trip.status !== 'PLANNED') return trip;
  const meta = parseMeta(trip.routeMeta);
  const last = typeof meta.computedAt === 'string' ? Date.parse(meta.computedAt) : 0;
  if (!opts.force && !opts.manualOrder && Date.now() - last < ROUTE_RATE_LIMIT_MS) return trip; // rate-limited: serve cached

  const [stops, settings, origin] = await Promise.all([loadStops(client, trip.id), getSettings(client, trip.schoolId), busOrigin(client, trip, opts.origin)]);
  const routable: RoutableStop[] = stops
    .filter((s) => ROUTED_STATUSES.includes(s.status) && s.location)
    .map((s) => ({
      id: s.id,
      location: { lat: s.location!.lat, lng: s.location!.lng },
    }));
  const finalDestination = trip.type === 'MORNING_PICKUP' ? (settings?.schoolLocation ?? null) : null;
  const savedOrder = meta.manualOrder === true && !opts.force ? (meta.manualOrderIds as string[] | undefined) : undefined;
  // A manual order only covers the stops that existed when the driver dragged them; stops added since
  // (a rider who is coming again) are appended so they are never dropped from the route.
  const manualOrder = opts.manualOrder ?? (savedOrder ? [...savedOrder, ...routable.map((s) => s.id).filter((id) => !savedOrder.includes(id))] : undefined);

  const plan = await planRoute(
    {
      origin,
      stops: routable,
      finalDestination,
      optimize: !manualOrder,
      manualOrder,
    },
    routeApi(),
  );

  const planned = new Map(plan.stops.map((p) => [p.id, p]));
  let tail = plan.stops.length;
  await mapLimit(stops, 8, async (s) => {
    const p = planned.get(s.id);
    if (p) {
      if (s.order !== p.order || s.etaSeconds !== p.etaSeconds || s.distanceMeters !== p.distanceMeters) {
        await client.models.TripStop.update({
          id: s.id,
          order: p.order,
          etaSeconds: p.etaSeconds,
          distanceMeters: p.distanceMeters,
        });
      }
    } else if (ROUTED_STATUSES.includes(s.status)) {
      // routed status but no location → keep at the end so the driver still sees it
      tail++;
      if (s.order !== 900 + tail)
        await client.models.TripStop.update({
          id: s.id,
          order: 900 + tail,
          etaSeconds: null,
          distanceMeters: null,
        });
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
    traffic: plan.traffic,
    origin,
  };
  return unwrap(
    await client.models.Trip.update({
      id: trip.id,
      routePolyline: plan.polyline,
      routeMeta: JSON.stringify(routeMeta),
    }),
    'Trip.update',
  );
}
