/* eslint-env jest */
jest.mock('react-native-mmkv', () => {
  const store = new Map();
  class MMKV {
    set(k, v) {
      store.set(k, v);
    }
    getString(k) {
      const v = store.get(k);
      return typeof v === 'string' ? v : undefined;
    }
    getNumber(k) {
      const v = store.get(k);
      return typeof v === 'number' ? v : undefined;
    }
    getBoolean(k) {
      const v = store.get(k);
      return typeof v === 'boolean' ? v : undefined;
    }
    contains(k) {
      return store.has(k);
    }
    delete(k) {
      store.delete(k);
    }
    getAllKeys() {
      return Array.from(store.keys());
    }
    clearAll() {
      store.clear();
    }
  }
  return { MMKV, createMMKV: () => new MMKV() };
});
