import React, { useEffect } from 'react';
import { View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';

type NetState = { online: boolean; setOnline: (v: boolean) => void };
export const useNetStore = create<NetState>((set) => ({ online: true, setOnline: (online) => set({ online }) }));
export const useOnline = () => useNetStore((s) => s.online);

let started = false;
/** Wire NetInfo into TanStack Query's onlineManager (pauses mutations offline, resumes when back). */
export function startNetworkListener() {
  if (started) return;
  started = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      setOnline(online);
      useNetStore.getState().setOnline(online);
    }),
  );
}

export function OfflineBanner() {
  const online = useOnline();
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  useEffect(() => {
    startNetworkListener();
  }, []);
  if (online) return null;
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: colors.warning, paddingVertical: 6, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
      <Text variant="caption" style={{ color: '#fff', flex: 1 }}>
        {t('common.offlineBanner')}
      </Text>
    </View>
  );
}
