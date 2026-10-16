import {
  chunkStopsForRouting,
  decodePolyline,
  encodePolyline,
  fallbackEtaSeconds,
  haversineMeters,
  nearestNeighborOrder,
  type LatLng,
} from '../shared/geo';

export type RoutableStop = { id: string; location: LatLng };

export type PlannedStop = { id: string; order: number; etaSeconds: number; distanceMeters: number };

export type RoutePlan = {
  polyline: string;
  distanceMeters: number;
  durationSeconds: number;
  stops: PlannedStop[];
  source: 'GOOGLE' | 'FALLBACK';
  chunks: number;
  optimized: boolean;
  computedAt: string;
  warnings: string[];
};

export type RouteLeg = { distanceMeters: number; durationSeconds: number; polyline: LatLng[] };
export type ApiRoute = { legs: RouteLeg[]; optimizedOrder?: number[] };
export type RouteApi = (req: { origin: LatLng; destination: LatLng; intermediates: LatLng[]; optimize: boolean }) => Promise<ApiRoute>;

export const GOOGLE_MAX_INTERMEDIATES = 25;

/** Live Routes API adapter. */
export function googleRoutesApi(apiKey: string, fetchImpl: typeof fetch = fetch): RouteApi {
  return async ({ origin, destination, intermediates, optimize }) => {
    const body = {
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      intermediates: intermediates.map((p) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } }, vehicleStopover: true })),
      travelMode: 'DRIVE',
      // optimizeWaypointOrder is rejected together with TRAFFIC_AWARE_OPTIMAL by the API, so optimised
      // runs use TRAFFIC_AWARE (still live traffic) and fixed-order runs get the OPTIMAL quality tier.
      routingPreference: optimize ? 'TRAFFIC_AWARE' : 'TRAFFIC_AWARE_OPTIMAL',
      departureTime: new Date(Date.now() + 10_000).toISOString(),
      optimizeWaypointOrder: optimize && intermediates.length > 1,
      polylineQuality: 'HIGH_QUALITY',
      languageCode: 'en',
      units: 'METRIC',
    };
    const res = await fetchImpl('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.distanceMeters,routes.legs.polyline.encodedPolyline,routes.optimizedIntermediateWaypointIndex',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Routes API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const json = (await res.json()) as {
      routes?: {
        legs?: { duration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string } }[];
        optimizedIntermediateWaypointIndex?: number[];
      }[];
    };
    const route = json.routes?.[0];
    if (!route?.legs?.length) throw new Error('Routes API returned no route');
    return {
      legs: route.legs.map((l) => ({
        distanceMeters: l.distanceMeters ?? 0,
        durationSeconds: parseInt((l.duration ?? '0s').replace('s', ''), 10) || 0,
        polyline: l.polyline?.encodedPolyline ? decodePolyline(l.polyline.encodedPolyline) : [],
      })),
      optimizedOrder: route.optimizedIntermediateWaypointIndex,
    };
  };
}

/** Straight-line fallback used when there is no API key or the API fails. */
export const fallbackRouteApi: RouteApi = async ({ origin, destination, intermediates, optimize }) => {
  const order = optimize ? nearestNeighborOrder(origin, intermediates) : intermediates.map((_, i) => i);
  const points = [origin, ...order.map((i) => intermediates[i]), destination];
  const legs: RouteLeg[] = [];
  for (let i = 1; i < points.length; i++) {
    const d = haversineMeters(points[i - 1], points[i]) * 1.3; // road factor
    legs.push({ distanceMeters: Math.round(d), durationSeconds: fallbackEtaSeconds(d) + 45, polyline: [points[i - 1], points[i]] });
  }
  return { legs, optimizedOrder: optimize ? order : undefined };
};

/**
 * Plan the route from `origin` through every stop, ending at `finalDestination` (school) for
 * morning pickups or at the farthest stop for afternoon drop-offs.
 * Handles the 25-intermediates API limit by chunking (nearest-neighbour sweep) and chaining chunks.
 */
export async function planRoute(
  input: {
    origin: LatLng;
    stops: RoutableStop[];
    finalDestination?: LatLng | null;
    optimize: boolean;
    manualOrder?: string[];
  },
  api: RouteApi,
  opts: { chunkSize?: number; now?: () => Date } = {},
): Promise<RoutePlan> {
  const chunkSize = opts.chunkSize ?? GOOGLE_MAX_INTERMEDIATES;
  const now = opts.now ?? (() => new Date());
  const warnings: string[] = [];
  const computedAt = now().toISOString();

  let stops = input.stops.filter((s) => s.location && Number.isFinite(s.location.lat) && Number.isFinite(s.location.lng));
  if (input.manualOrder?.length) {
    const rank = new Map(input.manualOrder.map((id, i) => [id, i]));
    stops = [...stops].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  }

  if (!stops.length) {
    if (!input.finalDestination) {
      return { polyline: '', distanceMeters: 0, durationSeconds: 0, stops: [], source: 'FALLBACK', chunks: 0, optimized: input.optimize, computedAt, warnings };
    }
    const r = await safeApi(api, { origin: input.origin, destination: input.finalDestination, intermediates: [], optimize: false }, warnings);
    const total = r.route.legs.reduce((acc, l) => ({ d: acc.d + l.distanceMeters, t: acc.t + l.durationSeconds }), { d: 0, t: 0 });
    return {
      polyline: encodePolyline(r.route.legs.flatMap((l) => l.polyline)),
      distanceMeters: total.d,
      durationSeconds: total.t,
      stops: [],
      source: r.source,
      chunks: 1,
      optimized: false,
      computedAt,
      warnings,
    };
  }

  const chunks: RoutableStop[][] = input.optimize
    ? chunkStopsForRouting(input.origin, stops, chunkSize, (s) => s.location)
    : chunkFixed(stops, chunkSize);
  if (chunks.length > 1) warnings.push(`${stops.length} stops exceed the ${chunkSize}-waypoint limit; routed as ${chunks.length} chained chunks`);

  const planned: PlannedStop[] = [];
  const coords: LatLng[] = [];
  let cumulativeSeconds = 0;
  let cumulativeMeters = 0;
  let cursor = input.origin;
  let source: RoutePlan['source'] = 'GOOGLE';
  let order = 1;

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const isLast = ci === chunks.length - 1;
    let destination: LatLng;
    let intermediates: RoutableStop[];
    let destinationStop: RoutableStop | undefined;

    if (isLast && input.finalDestination) {
      destination = input.finalDestination;
      intermediates = chunk;
    } else {
      // No fixed destination (or chained chunk): end the chunk at the stop farthest from the cursor
      // when optimising, or at the last stop in manual order.
      destinationStop = input.optimize ? farthest(cursor, chunk) : chunk[chunk.length - 1];
      destination = destinationStop.location;
      intermediates = chunk.filter((s) => s !== destinationStop);
    }

    const r = await safeApi(api, { origin: cursor, destination, intermediates: intermediates.map((s) => s.location), optimize: input.optimize }, warnings);
    if (r.source === 'FALLBACK') source = 'FALLBACK';
    const seq: RoutableStop[] =
      r.route.optimizedOrder && r.route.optimizedOrder.length === intermediates.length ? r.route.optimizedOrder.map((i) => intermediates[i]) : [...intermediates];
    if (destinationStop) seq.push(destinationStop);

    r.route.legs.forEach((leg, li) => {
      cumulativeSeconds += leg.durationSeconds;
      cumulativeMeters += leg.distanceMeters;
      coords.push(...leg.polyline);
      const stop = seq[li];
      if (stop) planned.push({ id: stop.id, order: order++, etaSeconds: cumulativeSeconds, distanceMeters: cumulativeMeters });
    });
    // Any stops the API did not produce legs for (defensive): append with best-effort estimates.
    for (let li = r.route.legs.length; li < seq.length; li++) {
      const stop = seq[li];
      const d = haversineMeters(cursor, stop.location);
      cumulativeMeters += d;
      cumulativeSeconds += fallbackEtaSeconds(d);
      planned.push({ id: stop.id, order: order++, etaSeconds: cumulativeSeconds, distanceMeters: cumulativeMeters });
    }
    cursor = destination;
  }

  return {
    polyline: encodePolyline(dedupe(coords)),
    distanceMeters: Math.round(cumulativeMeters),
    durationSeconds: Math.round(cumulativeSeconds),
    stops: planned,
    source,
    chunks: chunks.length,
    optimized: input.optimize,
    computedAt,
    warnings,
  };
}

async function safeApi(api: RouteApi, req: Parameters<RouteApi>[0], warnings: string[]): Promise<{ route: ApiRoute; source: RoutePlan['source'] }> {
  try {
    return { route: await api(req), source: api === fallbackRouteApi ? 'FALLBACK' : 'GOOGLE' };
  } catch (e) {
    warnings.push(`Routes API failed, used straight-line fallback: ${(e as Error).message}`);
    return { route: await fallbackRouteApi(req), source: 'FALLBACK' };
  }
}

function chunkFixed<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function farthest(from: LatLng, stops: RoutableStop[]): RoutableStop {
  let best = stops[0];
  let bestD = -1;
  for (const s of stops) {
    const d = haversineMeters(from, s.location);
    if (d > bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function dedupe(points: LatLng[]): LatLng[] {
  const out: LatLng[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.lat - p.lat) > 1e-6 || Math.abs(last.lng - p.lng) > 1e-6) out.push(p);
  }
  return out;
}
