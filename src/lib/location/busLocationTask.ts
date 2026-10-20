import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import '../amplify';
import { publishBusLocation } from '../../features/trips';
import { KV_KEYS, kv } from '../storage/mmkv';
import { SUPPORTS_BACKGROUND_LOCATION } from '../runtime';
import { PUBLISH_INTERVAL_MS, shouldPublish, type GpsSample, type LastPublish } from '../rules/location';

export { PUBLISH_DISTANCE_M, PUBLISH_INTERVAL_MS, MAX_ACCURACY_M, gpsQuality, shouldPublish, type GpsSample } from '../rules/location';

export const BUS_LOCATION_TASK = 'school-bus-location-task';

type ActiveTrip = { busId: string; tripId: string };

export const getActiveTrip = () => kv.getJSON<ActiveTrip>(KV_KEYS.activeTrip) ?? null;
export const getLastSample = () => kv.getJSON<GpsSample>('driver.lastSample') ?? null;

/** The signed-in driver's bus – lets the foreground watcher publish the bus position before a trip starts. */
export function setDriverBusId(busId: string | null) {
  if (busId) kv.setString(KV_KEYS.driverBusId, busId);
  else kv.delete(KV_KEYS.driverBusId);
}

export function toGpsSample(loc: Location.LocationObject): GpsSample {
  return {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    heading: loc.coords.heading ?? null,
    speed: loc.coords.speed ?? null,
    accuracy: loc.coords.accuracy ?? null,
    ts: loc.timestamp,
  };
}

/** One-off fix for actions that need to know where the driver is right now (e.g. Start trip). */
export async function getCurrentFix(timeoutMs = 8000): Promise<GpsSample | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const loc = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (loc) return toGpsSample(loc);
    const last = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60_000 });
    return last ? toGpsSample(last) : getLastSample();
  } catch {
    return getLastSample();
  }
}

export async function handleLocationSample(loc: Location.LocationObject): Promise<boolean> {
  const sample = toGpsSample(loc);
  kv.setJSON('driver.lastSample', sample);
  const trip = getActiveTrip();
  const busId = trip?.busId ?? kv.getString(KV_KEYS.driverBusId) ?? null;
  if (!busId) return false;
  const last = kv.getJSON<LastPublish>(KV_KEYS.lastBusPublish) ?? null;
  if (!shouldPublish(sample, last)) return false;
  try {
    await publishBusLocation({ busId, lat: sample.lat, lng: sample.lng, heading: sample.heading, speed: sample.speed, accuracy: sample.accuracy, tripId: trip?.tripId });
    kv.setJSON(KV_KEYS.lastBusPublish, { ts: Date.now(), lat: sample.lat, lng: sample.lng });
    return true;
  } catch (e) {
    console.warn('publish bus location failed', e);
    return false;
  }
}

// Background task: must be defined at module scope (imported by the root layout).
if (Platform.OS !== 'web') {
  TaskManager.defineTask(BUS_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      console.warn('location task error', error);
      return;
    }
    const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
    const latest = locations?.[locations.length - 1];
    if (latest) await handleLocationSample(latest);
  });
}

export async function ensureLocationPermissions(background: boolean): Promise<'granted' | 'foreground-only' | 'denied'> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  // Expo Go and web have no background mode: asking would throw ERR_LOCATION_INFO_PLIST on iOS.
  if (!background || !SUPPORTS_BACKGROUND_LOCATION) return 'granted';
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    return bg.status === 'granted' ? 'granted' : 'foreground-only';
  } catch (e) {
    console.warn('background location permission unavailable', e);
    return 'foreground-only';
  }
}

/** Start publishing for an active trip (background-capable on native, foreground watcher on web). */
export async function startBusLocationUpdates(trip: ActiveTrip, labels: { title: string; body: string }): Promise<void> {
  kv.setJSON(KV_KEYS.activeTrip, trip);
  kv.delete(KV_KEYS.lastBusPublish);
  // Web and Expo Go cannot run the background task – the foreground watcher (useDriverLocation) publishes instead.
  if (!SUPPORTS_BACKGROUND_LOCATION) return;
  const already = await Location.hasStartedLocationUpdatesAsync(BUS_LOCATION_TASK).catch(() => false);
  if (already) return;
  await Location.startLocationUpdatesAsync(BUS_LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: PUBLISH_INTERVAL_MS,
    distanceInterval: 10,
    deferredUpdatesInterval: PUBLISH_INTERVAL_MS,
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    foregroundService: {
      notificationTitle: labels.title,
      notificationBody: labels.body,
      notificationColor: '#2563EB',
      killServiceOnDestroy: false,
    },
  });
}

export async function stopBusLocationUpdates(): Promise<void> {
  kv.delete(KV_KEYS.activeTrip);
  kv.delete(KV_KEYS.lastBusPublish);
  if (!SUPPORTS_BACKGROUND_LOCATION) return;
  const started = await Location.hasStartedLocationUpdatesAsync(BUS_LOCATION_TASK).catch(() => false);
  if (started) await Location.stopLocationUpdatesAsync(BUS_LOCATION_TASK);
}

export async function isPublishing(): Promise<boolean> {
  if (Platform.OS === 'web') return !!getActiveTrip();
  return Location.hasStartedLocationUpdatesAsync(BUS_LOCATION_TASK).catch(() => false);
}
