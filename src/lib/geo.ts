/** Shared geo helpers (same implementation as the Lambdas). */
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
