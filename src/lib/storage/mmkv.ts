/**
 * Fast synchronous key-value store: native MMKV (localStorage on web). Expo Go does not ship the
 * MMKV native module, so there we fall back to an in-memory store – the app still works, it just
 * starts cold after a restart. Development builds and store builds always get real MMKV.
 */
export type KeyValueStore = {
  set: (key: string, value: string | number | boolean) => void;
  getString: (key: string) => string | undefined;
  getNumber: (key: string) => number | undefined;
  getBoolean: (key: string) => boolean | undefined;
  contains: (key: string) => boolean;
  delete: (key: string) => void;
  getAllKeys: () => string[];
  clearAll: () => void;
};

function memoryStore(): KeyValueStore {
  const map = new Map<string, string | number | boolean>();
  return {
    set: (k, v) => void map.set(k, v),
    getString: (k) => (typeof map.get(k) === 'string' ? (map.get(k) as string) : undefined),
    getNumber: (k) => (typeof map.get(k) === 'number' ? (map.get(k) as number) : undefined),
    getBoolean: (k) => (typeof map.get(k) === 'boolean' ? (map.get(k) as boolean) : undefined),
    contains: (k) => map.has(k),
    delete: (k) => void map.delete(k),
    getAllKeys: () => Array.from(map.keys()),
    clearAll: () => map.clear(),
  };
}

function createStore(): KeyValueStore {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    return new MMKV({ id: 'school-app' }) as unknown as KeyValueStore;
  } catch (e) {
    console.warn('MMKV unavailable (Expo Go?) – using in-memory storage', (e as Error).message);
    return memoryStore();
  }
}

export const storage: KeyValueStore = createStore();

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
  driverBusId: 'driver.busId',
  pushToken: 'push.token',
  onboardingNotif: 'onboarding.notifications',
  colorScheme: 'settings.colorScheme',
} as const;
