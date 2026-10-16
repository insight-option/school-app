import { MMKV } from 'react-native-mmkv';

/** Fast synchronous key-value store (native MMKV; localStorage on web). */
export const storage = new MMKV({ id: 'school-app' });

export const kv = {
  getString: (key: string) => storage.getString(key),
  setString: (key: string, value: string) => storage.set(key, value),
  getJSON<T>(key: string): T | undefined {
    const raw = storage.getString(key);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  },
  setJSON(key: string, value: unknown) {
    storage.set(key, JSON.stringify(value));
  },
  delete: (key: string) => storage.delete(key),
  clearAll: () => storage.clearAll(),
};

export const KV_KEYS = {
  language: 'settings.language',
  queryCache: 'query.cache.v1',
  lastBusPublish: 'driver.lastBusPublish',
  activeTrip: 'driver.activeTrip',
  pushToken: 'push.token',
  onboardingNotif: 'onboarding.notifications',
  colorScheme: 'settings.colorScheme',
} as const;
