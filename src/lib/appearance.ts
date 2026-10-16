import { useColorScheme } from 'react-native';
import { create } from 'zustand';
import { KV_KEYS, kv } from './storage/mmkv';

export type AppearanceMode = 'system' | 'light' | 'dark';

type State = { mode: AppearanceMode; setMode: (m: AppearanceMode) => void };

export const useAppearanceStore = create<State>((set) => ({
  mode: (kv.getString(KV_KEYS.colorScheme) as AppearanceMode | undefined) ?? 'system',
  setMode: (mode) => {
    kv.setString(KV_KEYS.colorScheme, mode);
    set({ mode });
  },
}));

export function useResolvedScheme(): 'light' | 'dark' {
  const system = useColorScheme();
  const mode = useAppearanceStore((s) => s.mode);
  if (mode === 'system') return system === 'dark' ? 'dark' : 'light';
  return mode;
}
