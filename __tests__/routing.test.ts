import { chunkStopsForRouting, decodePolyline, encodePolyline, haversineMeters, nearestNeighborOrder, distanceToPolylineMeters } from '../amplify/functions/shared/geo';
import { fallbackRouteApi, planRoute, type RoutableStop, type RouteApi } from '../amplify/functions/trips/routing';

const school = { lat: 24.7136, lng: 46.6753 };
const mk = (i: number, dLat: number, dLng: number): RoutableStop => ({ id: `s${i}`, location: { lat: school.lat + dLat, lng: school.lng + dLng } });

describe('geo helpers', () => {
  it('haversine distance is accurate to within 1%', () => {
    // Riyadh → Jeddah ≈ 846 km
    const d = haversineMeters({ lat: 24.7136, lng: 46.6753 }, { lat: 21.4858, lng: 39.1925 });
    expect(d).toBeGreaterThan(838_000);
    expect(d).toBeLessThan(855_000);
  });

  it('polyline encode/decode round-trips', () => {
    const pts = [
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ];
    const enc = encodePolyline(pts);
    expect(enc).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    const dec = decodePolyline(enc);
    dec.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(pts[i].lat, 4);
      expect(p.lng).toBeCloseTo(pts[i].lng, 4);
    });
  });

  it('nearest neighbour visits the closest point first', () => {
    const origin = { lat: 0, lng: 0 };
    const pts = [
      { lat: 0.03, lng: 0 },
      { lat: 0.01, lng: 0 },
      { lat: 0.02, lng: 0 },
    ];
    expect(nearestNeighborOrder(origin, pts)).toEqual([1, 2, 0]);
  });

  it('distance to polyline detects off-route', () => {
    const line = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.01 },
    ];
    expect(distanceToPolylineMeters({ lat: 0, lng: 0.005 }, line)).toBeLessThan(5);
    expect(distanceToPolylineMeters({ lat: 0.003, lng: 0.005 }, line)).toBeGreaterThan(300);
  });
});

describe('route chunking', () => {
  it('keeps ≤25 stops in a single chunk', () => {
    const stops = Array.from({ length: 25 }, (_, i) => mk(i, 0.001 * i, 0));
    expect(chunkStopsForRouting(school, stops, 25, (s) => s.location)).toHaveLength(1);
  });

  it('splits 60 stops into 3 ordered chunks of ≤25 covering every stop once', () => {
    const stops = Array.from({ length: 60 }, (_, i) => mk(i, 0.001 * (i % 7), 0.0013 * Math.floor(i / 7)));
    const chunks = chunkStopsForRouting(school, stops, 25, (s) => s.location);
    expect(chunks).toHaveLength(3);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(25));
    const ids = chunks.flat().map((s) => s.id);
    expect(new Set(ids).size).toBe(60);
  });
});

describe('planRoute', () => {
  it('orders stops, assigns cumulative ETAs and ends at the school (fallback api)', async () => {
    const stops = [mk(1, 0.02, 0), mk(2, 0.005, 0), mk(3, 0.012, 0)];
    const origin = { lat: school.lat + 0.03, lng: school.lng }; // bus starts far away, drives towards school
    const plan = await planRoute({ origin, stops, finalDestination: school, optimize: true }, fallbackRouteApi);
    expect(plan.stops.map((s) => s.id)).toEqual(['s1', 's3', 's2']);
    expect(plan.stops.map((s) => s.order)).toEqual([1, 2, 3]);
    for (let i = 1; i < plan.stops.length; i++) expect(plan.stops[i].etaSeconds).toBeGreaterThan(plan.stops[i - 1].etaSeconds);
    expect(plan.polyline.length).toBeGreaterThan(0);
    expect(plan.source).toBe('FALLBACK');
    expect(plan.chunks).toBe(1);
  });

  it('respects a manual order and does not optimise', async () => {
    const stops = [mk(1, 0.02, 0), mk(2, 0.005, 0), mk(3, 0.012, 0)];
    const plan = await planRoute({ origin: school, stops, finalDestination: school, optimize: false, manualOrder: ['s2', 's1', 's3'] }, fallbackRouteApi);
    expect(plan.stops.map((s) => s.id)).toEqual(['s2', 's1', 's3']);
    expect(plan.optimized).toBe(false);
  });

  it('chains chunks for more than 25 stops and uses the api optimised order', async () => {
    const stops = Array.from({ length: 30 }, (_, i) => mk(i, 0.001 * i, 0.0005 * (i % 3)));
    let calls = 0;
    const api: RouteApi = async (req) => {
      calls++;
      expect(req.intermediates.length).toBeLessThanOrEqual(25);
      return fallbackRouteApi(req);
    };
    const plan = await planRoute({ origin: school, stops, finalDestination: school, optimize: true }, api);
    expect(calls).toBe(2);
    expect(plan.chunks).toBe(2);
    expect(plan.stops).toHaveLength(30);
    expect(new Set(plan.stops.map((s) => s.id)).size).toBe(30);
    expect(plan.warnings.some((w) => /25-waypoint/.test(w))).toBe(true);
  });

  it('falls back to straight lines when the api fails', async () => {
    const failing: RouteApi = async () => {
      throw new Error('quota');
    };
    const plan = await planRoute({ origin: school, stops: [mk(1, 0.01, 0)], finalDestination: school, optimize: true }, failing);
    expect(plan.source).toBe('FALLBACK');
    expect(plan.warnings[0]).toMatch(/quota/);
    expect(plan.stops).toHaveLength(1);
  });

  it('afternoon drop-off (no fixed destination) ends at the farthest stop', async () => {
    const stops = [mk(1, 0.03, 0), mk(2, 0.005, 0), mk(3, 0.012, 0)];
    const plan = await planRoute({ origin: school, stops, finalDestination: null, optimize: true }, fallbackRouteApi);
    expect(plan.stops[plan.stops.length - 1].id).toBe('s1');
  });
});
