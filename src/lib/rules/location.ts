import { haversineMeters } from '../../../amplify/functions/shared/geo';

export const PUBLISH_INTERVAL_MS = 4_000;
export const PUBLISH_DISTANCE_M = 15;
export const MAX_ACCURACY_M = 50;

export type GpsSample = { lat: number; lng: number; heading: number | null; speed: number | null; accuracy: number | null; ts: number };
export type LastPublish = { ts: number; lat: number; lng: number };

/** Publish every 4 s or 15 m, whichever comes first; skip fixes worse than 50 m. */
export function shouldPublish(sample: GpsSample, last: LastPublish | null, now = Date.now()): boolean {
  if (sample.accuracy !== null && sample.accuracy > MAX_ACCURACY_M) return false;
  if (!last) return true;
  if (now - last.ts >= PUBLISH_INTERVAL_MS) return true;
  return haversineMeters({ lat: last.lat, lng: last.lng }, { lat: sample.lat, lng: sample.lng }) >= PUBLISH_DISTANCE_M;
}

export function gpsQuality(accuracy: number | null | undefined): 'good' | 'fair' | 'poor' | 'off' {
  if (accuracy === null || accuracy === undefined) return 'off';
  if (accuracy <= 15) return 'good';
  if (accuracy <= MAX_ACCURACY_M) return 'fair';
  return 'poor';
}
