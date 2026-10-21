/** Shared geo helpers (same implementation as the Lambdas). */
import { haversineMeters, type LatLng } from '../../amplify/functions/shared/geo';

export {
  bearingDegrees,
  chunkStopsForRouting,
  decodePolyline,
  distanceToPolylineMeters,
  encodePolyline,
  fallbackEtaSeconds,
  haversineMeters,
  nearestNeighborOrder,
  type LatLng,
} from '../../amplify/functions/shared/geo';

export type Region = { lat: number; lng: number; latitudeDelta: number; longitudeDelta: number };

export function regionFor(points: { lat: number; lng: number }[], padFactor = 1.4, minDelta = 0.01): Region {
  if (!points.length) return { lat: 0, lng: 0, latitudeDelta: 60, longitudeDelta: 60 };
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(minDelta, (maxLat - minLat) * padFactor),
    longitudeDelta: Math.max(minDelta, (maxLng - minLng) * padFactor),
  };
}

/** Linear interpolation between two coordinates (bus marker animation). */
export function lerpLatLng(a: { lat: number; lng: number }, b: { lat: number; lng: number }, t: number) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Index of the route vertex closest to `p` (route polylines are dense enough to skip segment projection). */
export function nearestVertexIndex(p: LatLng, line: LatLng[]): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < line.length; i++) {
    const d = haversineMeters(p, line[i]);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

/**
 * The part of the route still ahead of the bus: from its position to the end of the line.
 * When the bus is far off the route (before a recompute) the whole line is kept.
 */
export function remainingPath(p: LatLng, line: LatLng[], maxOffRouteMeters = 500): LatLng[] {
  if (line.length < 2) return line;
  const i = nearestVertexIndex(p, line);
  if (haversineMeters(p, line[i]) > maxOffRouteMeters) return line;
  return [p, ...line.slice(i + 1)];
}

export function pathLengthMeters(line: LatLng[]): number {
  let meters = 0;
  for (let i = 1; i < line.length; i++) meters += haversineMeters(line[i - 1], line[i]);
  return meters;
}
