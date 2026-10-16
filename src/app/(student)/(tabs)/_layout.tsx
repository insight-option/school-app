import React from 'react';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../ui';
import { useSession } from '../../../lib/auth/session';
import { useUnreadTotal } from '../../../features/messaging';

export default function StudentTabs() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const session = useSession();
  const unread = useUnreadTotal(session.userId);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="bus" options={{ title: t('tabs.bus'), tabBarIcon: ({ color, size }) => <Ionicons name="bus" size={size} color={color} /> }} />
      <Tabs.Screen
        name="messages"
        options={{ title: t('tabs.messages'), tabBarBadge: unread || undefined, tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} /> }}
      />
      <Tabs.Screen name="feedback" options={{ title: t('tabs.feedback'), tabBarIcon: ({ color, size }) => <Ionicons name="ribbon" size={size} color={color} /> }} />
      <Tabs.Screen name="courses" options={{ title: t('tabs.courses'), tabBarIcon: ({ color, size }) => <Ionicons name="book" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} /> }} />
    </Tabs>
  );
}
