import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTabBar, CountBadge, Text, useTheme, type TabSpec } from '../../ui';
import { SchoolLogo } from '../../components/media/StorageImage';
import { hasEnded, useBusinessBookings, useBusinessBookingsLive, useMyBusiness, useQatarClock } from '../../features/partner';

export const PARTNER_SECTIONS = [
  { name: 'dashboard', icon: 'grid-outline', active: 'grid', key: 'partner.tabs.dashboard' },
  { name: 'bookings', icon: 'calendar-outline', active: 'calendar', key: 'partner.tabs.bookings' },
  { name: 'venues', icon: 'football-outline', active: 'football', key: 'partner.tabs.venues' },
  { name: 'business', icon: 'storefront-outline', active: 'storefront', key: 'partner.tabs.business' },
  { name: 'billing', icon: 'card-outline', active: 'card', key: 'partner.tabs.billing' },
] as const;

/** Pending requests from today on (badge on Bookings). */
function usePendingCount(): number {
  const bookings = useBusinessBookings();
  const now = useQatarClock();
  return useMemo(() => (bookings.data ?? []).filter((b) => b.status === 'PENDING' && !hasEnded(b, now)).length, [bookings.data, now]);
}

/** Partner workspace: sidebar on tablets / desktop web, floating bottom bar on phones. */
export default function PartnerLayout() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const { t } = useTranslation();
  const pending = usePendingCount();
  useBusinessBookingsLive();
  const tabs: TabSpec[] = [
    { name: 'dashboard', title: t('partner.tabs.dashboard'), icon: 'grid-outline', iconActive: 'grid' },
    { name: 'bookings', title: t('partner.tabs.bookings'), icon: 'calendar-outline', iconActive: 'calendar', badge: pending || undefined },
    { name: 'venues', title: t('partner.tabs.venues'), icon: 'football-outline', iconActive: 'football' },
    { name: 'business', title: t('partner.tabs.business'), icon: 'storefront-outline', iconActive: 'storefront' },
    { name: 'more', title: t('partner.tabs.more'), icon: 'ellipsis-horizontal-circle-outline', iconActive: 'ellipsis-horizontal-circle' },
  ];
  return (
    <Tabs
      tabBar={(props) => (wide ? <PartnerSidebar {...props} pending={pending} /> : <AppTabBar {...props} tabs={tabs} />)}
      screenOptions={{ headerShown: false, tabBarPosition: wide ? 'left' : 'bottom', lazy: true }}
      backBehavior="history"
    >
      {PARTNER_SECTIONS.map((s) => (
        <Tabs.Screen key={s.name} name={s.name} />
      ))}
      <Tabs.Screen name="more" />
    </Tabs>
  );
}

function PartnerSidebar({ state, emitter, navigateToTab, pending }: BottomTabBarProps & { pending: number }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const business = useMyBusiness();
  const current = state.routes[state.index]?.name;

  const go = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    // React Navigation 8 tab bars get an emitter + navigateToTab instead of the navigation object.
    const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented) navigateToTab(route.key);
  };

  const name = business.data?.name ?? t('partner.brandFallback');
  return (
    <View style={[styles.sidebar, { backgroundColor: colors.surface, borderEndColor: colors.border, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.brand}>
        <SchoolLogo logoKey={business.data?.logoKey} name={name} color={business.data?.primaryColor} size={44} radius={14} />
        <View style={{ flex: 1 }}>
          <Text variant="subheading" numberOfLines={2}>
            {name}
          </Text>
          <Text variant="caption" color="textMuted">
            {t('partner.role')}
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ gap: 4, paddingHorizontal: 12 }}>
        {PARTNER_SECTIONS.map((s) => {
          const active = current === s.name;
          return (
            <Pressable
              key={s.name}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => go(s.name)}
              style={({ pressed }) => [styles.item, { backgroundColor: active ? colors.primarySoft : pressed ? colors.surfaceAlt : 'transparent', borderRadius: theme.radius.lg }]}
            >
              <Ionicons name={(active ? s.active : s.icon) as never} size={20} color={active ? colors.primary : colors.textMuted} />
              <Text variant={active ? 'bodyStrong' : 'body'} color={active ? 'primary' : 'text'} style={{ flex: 1 }}>
                {t(s.key)}
              </Text>
              {s.name === 'bookings' ? <CountBadge count={pending} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: current === 'more' }}
        onPress={() => go('more')}
        style={({ pressed }) => [styles.item, { marginHorizontal: 12, backgroundColor: current === 'more' ? colors.primarySoft : pressed ? colors.surfaceAlt : 'transparent', borderRadius: theme.radius.lg }]}
      >
        <Ionicons name={current === 'more' ? 'person-circle' : 'person-circle-outline'} size={20} color={current === 'more' ? colors.primary : colors.textMuted} />
        <Text variant={current === 'more' ? 'bodyStrong' : 'body'} color={current === 'more' ? 'primary' : 'text'}>
          {t('partner.tabs.account')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { width: 264, borderEndWidth: StyleSheet.hairlineWidth, gap: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 46 },
});
