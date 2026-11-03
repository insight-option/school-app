import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { useTheme } from './theme';

type IconName = keyof typeof Ionicons.glyphMap;

export type TabSpec = {
  /** Route name inside the Tabs navigator. */
  name: string;
  title: string;
  icon: IconName;
  iconActive?: IconName;
  badge?: number | boolean;
};

/**
 * The app's bottom navigation: a floating rounded bar that sits *above* the system navigation
 * (gesture bar or 3-button bar on Android, home indicator on iOS) using the real safe-area inset,
 * so it is never covered or clipped. Rendered in layout flow – screens end above it.
 * Screens can hide it with `tabBarStyle: { display: 'none' }` (e.g. the driver's full-screen map).
 */
export function AppTabBar({ state, descriptors, emitter, navigateToTab, tabs }: BottomTabBarProps & { tabs: TabSpec[] }) {
  const theme = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const focusedRoute = state.routes[state.index];
  const focusedOptions = focusedRoute ? (descriptors[focusedRoute.key]?.options as { tabBarStyle?: { display?: string } } | undefined) : undefined;
  if (focusedOptions?.tabBarStyle?.display === 'none') return null;

  const go = (routeName: string) => {
    const route = state.routes.find((r) => r.name === routeName);
    if (!route) return;
    // React Navigation 8 tab bars get an emitter + navigateToTab instead of the navigation object.
    const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented && route.key !== focusedRoute?.key) navigateToTab(route.key);
  };

  const visible = tabs.filter((tab) => state.routes.some((r) => r.name === tab.name));
  const compact = visible.length >= 5;
  // Android's gesture bar reports ~16–24 dp, the 3-button bar ~48 dp; never sit closer than 8 dp.
  const bottom = Math.max(insets.bottom, Platform.OS === 'web' ? 0 : 8) + 8;

  return (
    <View style={[styles.wrap, { paddingBottom: bottom, paddingLeft: insets.left + 12, paddingRight: insets.right + 12, backgroundColor: colors.background }]}>
      <View
        accessibilityRole="tablist"
        style={[styles.bar, { backgroundColor: colors.tabBar, borderColor: colors.border, borderRadius: theme.radius.xxl }, theme.shadow.raised]}
      >
        {visible.map((tab) => {
          const active = focusedRoute?.name === tab.name;
          const badge = tab.badge;
          return (
            <Pressable
              key={tab.name}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.title}
              onPress={() => go(tab.name)}
              style={({ pressed }) => [styles.item, { opacity: pressed ? 0.7 : 1 }]}
              hitSlop={4}
            >
              <View style={[styles.iconPill, compact && styles.iconPillCompact, active ? { backgroundColor: colors.primarySoft } : null]}>
                <Ionicons name={active ? (tab.iconActive ?? tab.icon) : tab.icon} size={22} color={active ? colors.primary : colors.textMuted} />
                {badge ? (
                  <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.tabBar }, typeof badge === 'number' ? styles.badgeCount : styles.badgeDot]}>
                    {typeof badge === 'number' ? (
                      <Text style={styles.badgeText} weight="800">
                        {badge > 99 ? '99+' : String(badge)}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
              <Text
                variant="label"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{ color: active ? colors.primary : colors.textMuted, fontSize: compact ? 10.5 : 11.5, letterSpacing: 0 }}
                weight={active ? '800' : '600'}
              >
                {tab.title}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 6, alignItems: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 620, paddingHorizontal: 6, paddingVertical: 7, borderWidth: StyleSheet.hairlineWidth },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 50, minWidth: 0 },
  iconPill: { width: 54, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  iconPillCompact: { width: 46 },
  badge: { position: 'absolute', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badgeDot: { top: 2, right: 10, width: 11, height: 11, borderRadius: 6 },
  badgeCount: { top: -4, right: 2, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, lineHeight: 12 },
});
