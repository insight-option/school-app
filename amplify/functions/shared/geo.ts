/** Pure geo helpers shared by the trips Lambda, the client and unit tests. */
export type LatLng = { lat: number; lng: number };

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearingDegrees(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** Google encoded polyline → coordinates. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/** Coordinates → Google encoded polyline. */
export function encodePolyline(points: LatLng[]): string {
  let out = '';
  let prevLat = 0;
  let prevLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    s += String.fromCharCode(n + 63);
    return s;
  };
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    out += enc(lat - prevLat) + enc(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

/** Distance from point p to the polyline (min over segments), in meters. Good enough for "off-route" checks. */
export function distanceToPolylineMeters(p: LatLng, line: LatLng[]): number {
  if (!line.length) return Infinity;
  if (line.length === 1) return haversineMeters(p, line[0]);
  // local equirectangular projection around p
  const cosLat = Math.cos(toRad(p.lat));
  const proj = (q: LatLng) => ({ x: toRad(q.lng - p.lng) * cosLat * R, y: toRad(q.lat - p.lat) * R });
  let best = Infinity;
  let prev = proj(line[0]);
  for (let i = 1; i < line.length; i++) {
    const cur = proj(line[i]);
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? -(prev.x * dx + prev.y * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = prev.x + t * dx;
    const cy = prev.y + t * dy;
    const d = Math.sqrt(cx * cx + cy * cy);
    if (d < best) best = d;
    prev = cur;
  }
  return best;
}

/** Nearest-neighbour ordering starting from `origin`. Returns indexes into `points`. */
export function nearestNeighborOrder(origin: LatLng, points: LatLng[]): number[] {
  const remaining = points.map((_, i) => i);
  const order: number[] = [];
  let cur = origin;
  while (remaining.length) {
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMeters(cur, points[remaining[i]]);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    const chosen = remaining.splice(bestIdx, 1)[0];
    order.push(chosen);
    cur = points[chosen];
  }
  return order;
}

/**
 * Split stops into consecutive chunks of at most `size` following a nearest-neighbour sweep from
 * the origin. Google's computeRoutes accepts ≤ 25 intermediates when optimising; each chunk is
 * optimised separately and chained (end of chunk N = origin of chunk N+1).
 */
export function chunkStopsForRouting<T>(
  origin: LatLng,
  stops: T[],
  size = 25,
  getLocation: (stop: T) => LatLng = (s) => s as unknown as LatLng,
): T[][] {
  if (stops.length <= size) return stops.length ? [stops] : [];
  const order = nearestNeighborOrder(origin, stops.map(getLocation));
  const chunks: T[][] = [];
  for (let i = 0; i < order.length; i += size) {
    chunks.push(order.slice(i, i + size).map((idx) => stops[idx]));
  }
  return chunks;
}

/** Rough ETA in seconds for a straight-line fallback (used when the Routes API is unavailable). */
export function fallbackEtaSeconds(meters: number, avgKmh = 30): number {
  return Math.round((meters / 1000 / avgKmh) * 3600);
}
