import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { handleLocationSample, getLastSample, gpsQuality, toGpsSample, type GpsSample } from './busLocationTask';

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
      let perm: Location.PermissionResponse;
      try {
        perm = await Location.requestForegroundPermissionsAsync();
      } catch (e) {
        // e.g. ERR_LOCATION_INFO_PLIST in a client without location usage strings – never crash the screen.
        console.warn('location permission request failed', e);
        if (!cancelled) setPermission('denied');
        return;
      }
      if (cancelled) return;
      if (perm.status !== 'granted') {
        setPermission('denied');
        return;
      }
      setPermission('granted');
      subRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 5 },
        (loc) => {
          setSample(toGpsSample(loc));
          // Publishes through the same throttled path as the background task (and is the only
          // publisher on web / Expo Go, and before a trip starts).
          void handleLocationSample(loc);
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
