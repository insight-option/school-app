import React from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTabBar, Avatar, Text, useTheme, type TabSpec } from '../../ui';
import { useSession } from '../../lib/auth/session';
import { useBranding } from '../../features/branding';
import { StorageImage } from '../../components/media/StorageImage';

export const OWNER_SECTIONS = [
  { name: 'overview', icon: 'grid-outline', active: 'grid', key: 'owner.nav.overview' },
  { name: 'tenants', icon: 'business-outline', active: 'business', key: 'owner.nav.tenants' },
  { name: 'bookings', icon: 'calendar-outline', active: 'calendar', key: 'owner.nav.bookings' },
  { name: 'billing', icon: 'card-outline', active: 'card', key: 'owner.nav.billing' },
  { name: 'users', icon: 'people-outline', active: 'people', key: 'owner.nav.users' },
  { name: 'categories', icon: 'pricetags-outline', active: 'pricetags', key: 'owner.nav.categories' },
  { name: 'branding', icon: 'color-palette-outline', active: 'color-palette', key: 'owner.nav.branding' },
  { name: 'activity', icon: 'pulse-outline', active: 'pulse', key: 'owner.nav.activity' },
] as const;

const PHONE_TABS = ['overview', 'tenants', 'bookings', 'billing'];
/** Sections reached from "More" on phones: full screen with a back button (no bottom bar). */
export const OWNER_SECONDARY = ['users', 'categories', 'branding', 'activity'];

/** Platform owner console: left sidebar on tablets / web, floating bottom bar on phones. */
export default function OwnerLayout() {
  const { width } = useWindowDimensions();
  const { t } = useTranslation();
  const wide = width >= 900;
  const tabs: TabSpec[] = [
    ...OWNER_SECTIONS.filter((s) => PHONE_TABS.includes(s.name)).map((s) => ({ name: s.name, title: t(s.key), icon: s.icon as TabSpec['icon'], iconActive: s.active as TabSpec['icon'] })),
    { name: 'more', title: t('owner.nav.more'), icon: 'ellipsis-horizontal-circle-outline', iconActive: 'ellipsis-horizontal-circle' },
  ];
  return (
    <Tabs
      tabBar={(props) => (wide ? <OwnerSidebar {...props} /> : <AppTabBar {...props} tabs={tabs} />)}
      screenOptions={{ headerShown: false, tabBarPosition: wide ? 'left' : 'bottom', lazy: true }}
      backBehavior="history"
    >
      {OWNER_SECTIONS.map((s) => (
        <Tabs.Screen key={s.name} name={s.name} options={!wide && OWNER_SECONDARY.includes(s.name) ? { tabBarStyle: { display: 'none' } } : undefined} />
      ))}
      <Tabs.Screen name="more" />
    </Tabs>
  );
}

function OwnerSidebar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const branding = useBranding();
  const session = useSession();
  const current = state.routes[state.index]?.name;

  const go = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    // React Navigation 8 tab bars get an emitter + navigateToTab instead of the navigation object.
    const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented) navigateToTab(route.key);
  };

  return (
    <View style={[styles.sidebar, { backgroundColor: theme.colors.surface, borderEndColor: theme.colors.border, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 14 }]}>
      <View style={styles.brand}>
        <View style={[styles.logo, { backgroundColor: branding.logoKey ? theme.colors.surfaceAlt : theme.colors.primary }]}>
          {branding.logoKey ? (
            <StorageImage storageKey={branding.logoKey} style={{ width: 40, height: 40 }} contentFit="contain" />
          ) : (
            <Ionicons name="sparkles" size={20} color={theme.colors.onPrimary} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="subheading" numberOfLines={1}>
            {branding.appName}
          </Text>
          <Text variant="overline" color="primary" numberOfLines={1}>
            {t('owner.console')}
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ gap: 4, paddingHorizontal: 12 }}>
        {OWNER_SECTIONS.map((s) => {
          const active = current === s.name;
          return (
            <Pressable
              key={s.name}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => go(s.name)}
              style={({ pressed }) => [styles.item, { borderRadius: theme.radius.lg, backgroundColor: active ? theme.colors.primarySoft : pressed ? theme.colors.surfaceAlt : 'transparent' }]}
            >
              <Ionicons name={(active ? s.active : s.icon) as never} size={20} color={active ? theme.colors.primary : theme.colors.textMuted} />
              <Text variant={active ? 'bodyStrong' : 'body'} color={active ? 'primary' : 'text'} style={{ flex: 1 }} numberOfLines={1}>
                {t(s.key)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: current === 'more' }}
        onPress={() => go('more')}
        style={({ pressed }) => [
          styles.account,
          { borderColor: theme.colors.border, backgroundColor: current === 'more' ? theme.colors.primarySoft : pressed ? theme.colors.surfaceAlt : theme.colors.background },
        ]}
      >
        <Avatar name={session.name || session.email || session.username || '?'} size={38} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {session.name || session.username || t('owner.more.account')}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {session.email || t('owner.more.role')}
          </Text>
        </View>
        <Ionicons name="settings-outline" size={18} color={current === 'more' ? theme.colors.primary : theme.colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { width: 260, borderEndWidth: StyleSheet.hairlineWidth, gap: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 6 },
  logo: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 46 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, padding: 10, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
});
