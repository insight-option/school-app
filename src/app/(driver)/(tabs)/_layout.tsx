import React from 'react';
import { useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { tabColor } from '../../../ui/tabColor';
import { AppTabBar, useTheme, type TabSpec } from '../../../ui';
import { useSession } from '../../../lib/auth/session';
import { useUnreadTotal } from '../../../features/messaging';

/** Driver tabs: a floating bottom bar on phones; on tablets a side rail so the map keeps its height. */
export default function DriverTabs() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const session = useSession();
  const unread = useUnreadTotal(session.userId);
  const side = width >= 900;
  const tabs: TabSpec[] = [
    { name: 'trip', title: t('tabs.trip'), icon: 'map-outline', iconActive: 'map' },
    { name: 'students', title: t('tabs.students'), icon: 'people-outline', iconActive: 'people' },
    { name: 'messages', title: t('tabs.messages'), icon: 'chatbubbles-outline', iconActive: 'chatbubbles', badge: unread },
    { name: 'profile', title: t('tabs.profile'), icon: 'person-circle-outline', iconActive: 'person-circle' },
  ];
  return (
    <Tabs
      tabBar={side ? undefined : (props) => <AppTabBar {...props} tabs={tabs} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: side ? 'left' : 'bottom',
        tabBarVariant: 'material',
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderRightColor: colors.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="trip" options={{ title: t('tabs.trip'), tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={tabColor(color)} /> }} />
      <Tabs.Screen name="students" options={{ title: t('tabs.students'), tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={tabColor(color)} /> }} />
      <Tabs.Screen name="messages" options={{ title: t('tabs.messages'), tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={tabColor(color)} /> }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={tabColor(color)} /> }} />
    </Tabs>
  );
}
