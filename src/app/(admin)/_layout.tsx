import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { CountBadge, Text, useTheme } from '../../ui';
import { useSettings } from '../../features/settings';
import { useUnreadTotal, useOfficeSeat } from '../../features/messaging';
import { useSignedUrl } from '../../lib/storage/s3';

export const ADMIN_SECTIONS = [
  { name: 'dashboard', icon: 'grid-outline', active: 'grid', key: 'tabs.dashboard' },
  { name: 'applications', icon: 'clipboard-outline', active: 'clipboard', key: 'tabs.applications' },
  { name: 'students', icon: 'people-outline', active: 'people', key: 'tabs.students' },
  { name: 'teachers', icon: 'school-outline', active: 'school', key: 'tabs.teachers' },
  { name: 'buses', icon: 'bus-outline', active: 'bus', key: 'tabs.buses' },
  { name: 'classes', icon: 'library-outline', active: 'library', key: 'tabs.classes' },
  { name: 'trips', icon: 'map-outline', active: 'map', key: 'tabs.trips' },
  { name: 'messages', icon: 'chatbubbles-outline', active: 'chatbubbles', key: 'tabs.messages' },
  { name: 'feedback', icon: 'ribbon-outline', active: 'ribbon', key: 'tabs.feedback' },
  { name: 'broadcasts', icon: 'megaphone-outline', active: 'megaphone', key: 'tabs.broadcasts' },
  { name: 'courses', icon: 'book-outline', active: 'book', key: 'tabs.courses' },
  { name: 'school-profile', icon: 'storefront-outline', active: 'storefront', key: 'tabs.schoolProfile' },
  { name: 'settings', icon: 'settings-outline', active: 'settings', key: 'tabs.settings' },
  { name: 'audit', icon: 'document-text-outline', active: 'document-text', key: 'tabs.audit' },
] as const;

const PHONE_PRIMARY = ['dashboard', 'students', 'messages', 'feedback'];

/** School office: left sidebar on desktop/tablet web, bottom tabs (+ "More") on phones. */
export default function AdminLayout() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  return (
    <Tabs
      tabBar={(props) => <AdminTabBar {...props} wide={wide} />}
      screenOptions={{ headerShown: false, tabBarPosition: wide ? 'left' : 'bottom', lazy: true }}
      backBehavior="history"
    >
      {ADMIN_SECTIONS.map((s) => (
        <Tabs.Screen key={s.name} name={s.name} />
      ))}
      <Tabs.Screen name="more" />
    </Tabs>
  );
}

function AdminTabBar({ state, emitter, navigateToTab, wide }: BottomTabBarProps & { wide: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const logo = useSignedUrl(settings.data?.logoKey);
  const officeSeat = useOfficeSeat();
  const unread = useUnreadTotal(officeSeat);
  const current = state.routes[state.index]?.name;

  const go = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    // React Navigation 8 tab bars get an emitter + navigateToTab instead of the navigation object.
    const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented) navigateToTab(route.key);
  };

  if (wide) {
    return (
      <View style={[styles.sidebar, { backgroundColor: theme.colors.surface, borderRightColor: theme.colors.border, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.brand}>
          {logo ? <Image source={{ uri: logo }} style={styles.logo} contentFit="contain" /> : <View style={[styles.logo, { backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="bus" size={22} color="#fff" /></View>}
          <Text variant="subheading" numberOfLines={2} style={{ flex: 1 }}>
            {settings.data?.name ?? t('roles.ADMIN')}
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ gap: 2, paddingHorizontal: 10 }}>
          {ADMIN_SECTIONS.map((s) => {
            const active = current === s.name;
            return (
              <Pressable key={s.name} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => go(s.name)} style={({ pressed }) => [styles.sideItem, { backgroundColor: active ? theme.colors.primarySoft : pressed ? theme.colors.surfaceAlt : 'transparent', borderRadius: theme.radius.md }]}>
                <Ionicons name={(active ? s.active : s.icon) as never} size={20} color={active ? theme.colors.primary : theme.colors.textMuted} />
                <Text variant={active ? 'bodyStrong' : 'body'} color={active ? 'primary' : 'text'} style={{ flex: 1 }}>
                  {t(s.key)}
                </Text>
                {s.name === 'messages' ? <CountBadge count={unread} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable accessibilityRole="tab" onPress={() => go('more')} style={({ pressed }) => [styles.sideItem, { marginHorizontal: 10, backgroundColor: current === 'more' ? theme.colors.primarySoft : pressed ? theme.colors.surfaceAlt : 'transparent', borderRadius: theme.radius.md }]}>
          <Ionicons name="person-circle-outline" size={20} color={theme.colors.textMuted} />
          <Text>{t('tabs.profile')}</Text>
        </Pressable>
      </View>
    );
  }

  const items = [...PHONE_PRIMARY, 'more'];
  const moreActive = !!current && !PHONE_PRIMARY.includes(current);
  // Same floating bar as the other workspaces (src/ui/TabBar), above the system navigation.
  const bottom = Math.max(insets.bottom, Platform.OS === 'web' ? 0 : 8) + 8;
  return (
    <View style={[styles.bottomWrap, { paddingBottom: bottom, paddingLeft: insets.left + 12, paddingRight: insets.right + 12, backgroundColor: theme.colors.background }]}>
      <View accessibilityRole="tablist" style={[styles.bottomBar, { backgroundColor: theme.colors.tabBar, borderColor: theme.colors.border, borderRadius: theme.radius.xxl }, theme.shadow.raised]}>
        {items.map((name) => {
          const s = ADMIN_SECTIONS.find((x) => x.name === name);
          const active = name === 'more' ? moreActive : current === name;
          const icon = name === 'more' ? (active ? 'ellipsis-horizontal-circle' : 'ellipsis-horizontal-circle-outline') : active ? s!.active : s!.icon;
          const label = name === 'more' ? t('common.more') : t(s!.key);
          return (
            <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={label} onPress={() => go(name)} hitSlop={4} style={({ pressed }) => [styles.bottomItem, { opacity: pressed ? 0.7 : 1 }]}>
              <View style={[styles.iconPill, active ? { backgroundColor: theme.colors.primarySoft } : null]}>
                <Ionicons name={icon as never} size={22} color={active ? theme.colors.primary : theme.colors.textMuted} />
                {name === 'messages' && unread ? <CountBadge count={unread} style={{ position: 'absolute', top: -5, right: 0 }} /> : null}
              </View>
              <Text variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} weight={active ? '800' : '600'} style={{ color: active ? theme.colors.primary : theme.colors.textMuted, fontSize: 11, letterSpacing: 0 }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { width: 248, borderRightWidth: StyleSheet.hairlineWidth, gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 8 },
  logo: { width: 40, height: 40, borderRadius: 10 },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, minHeight: 44 },
  bottomWrap: { paddingTop: 6, alignItems: 'center' },
  bottomBar: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 620, paddingHorizontal: 6, paddingVertical: 7, borderWidth: StyleSheet.hairlineWidth },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 50, minWidth: 0 },
  iconPill: { width: 50, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
