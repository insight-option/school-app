import React from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { CountBadge, Text, useTheme } from '../../ui';
import { useSettings } from '../../features/settings';
import { useUnreadTotal, OFFICE_USER_ID } from '../../features/messaging';
import { useSignedUrl } from '../../lib/storage/s3';

export const ADMIN_SECTIONS = [
  { name: 'dashboard', icon: 'grid-outline', active: 'grid', key: 'tabs.dashboard' },
  { name: 'students', icon: 'people-outline', active: 'people', key: 'tabs.students' },
  { name: 'teachers', icon: 'school-outline', active: 'school', key: 'tabs.teachers' },
  { name: 'buses', icon: 'bus-outline', active: 'bus', key: 'tabs.buses' },
  { name: 'classes', icon: 'library-outline', active: 'library', key: 'tabs.classes' },
  { name: 'trips', icon: 'map-outline', active: 'map', key: 'tabs.trips' },
  { name: 'messages', icon: 'chatbubbles-outline', active: 'chatbubbles', key: 'tabs.messages' },
  { name: 'feedback', icon: 'ribbon-outline', active: 'ribbon', key: 'tabs.feedback' },
  { name: 'broadcasts', icon: 'megaphone-outline', active: 'megaphone', key: 'tabs.broadcasts' },
  { name: 'courses', icon: 'book-outline', active: 'book', key: 'tabs.courses' },
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

function AdminTabBar({ state, navigation, wide }: BottomTabBarProps & { wide: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const logo = useSignedUrl(settings.data?.logoKey);
  const unread = useUnreadTotal(OFFICE_USER_ID);
  const current = state.routes[state.index]?.name;

  const go = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    const event = route ? navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true }) : null;
    if (!event?.defaultPrevented) navigation.navigate(name as never);
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
  return (
    <View style={[styles.bottomBar, { backgroundColor: theme.colors.tabBar, borderTopColor: theme.colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
      {items.map((name) => {
        const s = ADMIN_SECTIONS.find((x) => x.name === name);
        const active = name === 'more' ? moreActive : current === name;
        const icon = name === 'more' ? (active ? 'ellipsis-horizontal-circle' : 'ellipsis-horizontal-circle-outline') : active ? s!.active : s!.icon;
        return (
          <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => go(name)} style={styles.bottomItem}>
            <View>
              <Ionicons name={icon as never} size={24} color={active ? theme.colors.primary : theme.colors.textMuted} />
              {name === 'messages' && unread ? <CountBadge count={unread} style={{ position: 'absolute', top: -6, right: -12 }} /> : null}
            </View>
            <Text variant="label" color={active ? 'primary' : 'textMuted'} numberOfLines={1}>
              {name === 'more' ? t('common.more') : t(s!.key)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { width: 248, borderRightWidth: StyleSheet.hairlineWidth, gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 8 },
  logo: { width: 40, height: 40, borderRadius: 10 },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, minHeight: 44 },
  bottomBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  bottomItem: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48 },
});
