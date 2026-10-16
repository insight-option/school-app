import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { handleLocationSample, getLastSample, gpsQuality, type GpsSample } from './busLocationTask';

/**
 * Foreground GPS watcher for the driver screen. Publishes through the same throttled path as the
 * background task (duplicates are filtered by the shared MMKV "last publish" record), so on web –
 * where there is no background task – this is the only publisher.
 */
export function useDriverLocation(enabled: boolean) {
  const [sample, setSample] = useState<GpsSample | null>(() => getLastSample());
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (perm.status !== 'granted') {
        setPermission('denied');
        return;
      }
      setPermission('granted');
      subRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 5 },
        (loc) => {
          const s: GpsSample = {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            heading: loc.coords.heading ?? null,
            speed: loc.coords.speed ?? null,
            accuracy: loc.coords.accuracy ?? null,
            ts: loc.timestamp,
          };
          setSample(s);
          if (Platform.OS === 'web' || true) void handleLocationSample(loc);
        },
      );
    })();
    return () => {
      cancelled = true;
      subRef.current?.remove();
      subRef.current = null;
    };
  }, [enabled]);

  return { sample, quality: gpsQuality(sample?.accuracy), permission };
}
