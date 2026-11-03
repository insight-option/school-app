import React from 'react';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppTabBar, type TabSpec } from '../../../ui';
import { useSession } from '../../../lib/auth/session';
import { useUnreadTotal } from '../../../features/messaging';

export default function TeacherTabs() {
  const { t } = useTranslation();
  const session = useSession();
  const unread = useUnreadTotal(session.userId);
  const tabs: TabSpec[] = [
    { name: 'class', title: t('tabs.myClass'), icon: 'school-outline', iconActive: 'school' },
    { name: 'feedback', title: t('tabs.feedback'), icon: 'ribbon-outline', iconActive: 'ribbon' },
    { name: 'messages', title: t('tabs.messages'), icon: 'chatbubbles-outline', iconActive: 'chatbubbles', badge: unread },
    { name: 'profile', title: t('tabs.profile'), icon: 'person-circle-outline', iconActive: 'person-circle' },
  ];
  return (
    <Tabs tabBar={(props) => <AppTabBar {...props} tabs={tabs} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="class" options={{ title: t('tabs.myClass') }} />
      <Tabs.Screen name="feedback" options={{ title: t('tabs.feedback') }} />
      <Tabs.Screen name="messages" options={{ title: t('tabs.messages') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
