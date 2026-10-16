import React from 'react';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useWindowDimensions } from 'react-native';
import { useTheme } from '../../../ui';
import { useSession } from '../../../lib/auth/session';
import { useUnreadTotal } from '../../../features/messaging';

/** Driver tabs: on tablets the bar moves to the side so the map keeps its height. */
export default function DriverTabs() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const session = useSession();
  const unread = useUnreadTotal(session.userId);
  const side = width >= 900;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: side ? 'left' : 'bottom',
        tabBarVariant: side ? 'material' : 'uikit',
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.border, borderRightColor: colors.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="trip" options={{ title: t('tabs.trip'), tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} /> }} />
      <Tabs.Screen name="students" options={{ title: t('tabs.students'), tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} /> }} />
      <Tabs.Screen name="messages" options={{ title: t('tabs.messages'), tabBarBadge: unread || undefined, tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} /> }} />
    </Tabs>
  );
}
