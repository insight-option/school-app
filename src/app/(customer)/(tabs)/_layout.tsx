import React from 'react';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppTabBar, type TabSpec } from '../../../ui';
import { isUpcoming, useMyBookings } from '../../../features/platform';

export default function CustomerTabs() {
  const { t } = useTranslation();
  const bookings = useMyBookings();
  const upcoming = (bookings.data ?? []).filter((b) => isUpcoming(b)).length;
  const tabs: TabSpec[] = [
    { name: 'explore', title: t('platform.tabs.explore'), icon: 'compass-outline', iconActive: 'compass' },
    { name: 'bookings', title: t('platform.tabs.bookings'), icon: 'calendar-outline', iconActive: 'calendar', badge: upcoming || undefined },
    { name: 'account', title: t('platform.tabs.account'), icon: 'person-circle-outline', iconActive: 'person-circle' },
  ];
  return (
    <Tabs tabBar={(props) => <AppTabBar {...props} tabs={tabs} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="explore" options={{ title: t('platform.tabs.explore') }} />
      <Tabs.Screen name="bookings" options={{ title: t('platform.tabs.bookings') }} />
      <Tabs.Screen name="account" options={{ title: t('platform.tabs.account') }} />
    </Tabs>
  );
}
