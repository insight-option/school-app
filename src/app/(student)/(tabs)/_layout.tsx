import React from 'react';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppTabBar, type TabSpec } from '../../../ui';
import { useSession } from '../../../lib/auth/session';
import { useUnreadTotal } from '../../../features/messaging';

export default function StudentTabs() {
  const { t } = useTranslation();
  const session = useSession();
  const unread = useUnreadTotal(session.userId);
  const tabs: TabSpec[] = [
    { name: 'bus', title: t('tabs.bus'), icon: 'bus-outline', iconActive: 'bus' },
    { name: 'messages', title: t('tabs.messages'), icon: 'chatbubbles-outline', iconActive: 'chatbubbles', badge: unread },
    { name: 'feedback', title: t('tabs.feedback'), icon: 'ribbon-outline', iconActive: 'ribbon' },
    { name: 'courses', title: t('tabs.courses'), icon: 'book-outline', iconActive: 'book' },
    { name: 'profile', title: t('tabs.profile'), icon: 'person-circle-outline', iconActive: 'person-circle' },
  ];
  return (
    <Tabs tabBar={(props) => <AppTabBar {...props} tabs={tabs} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="bus" options={{ title: t('tabs.bus') }} />
      <Tabs.Screen name="messages" options={{ title: t('tabs.messages') }} />
      <Tabs.Screen name="feedback" options={{ title: t('tabs.feedback') }} />
      <Tabs.Screen name="courses" options={{ title: t('tabs.courses') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
