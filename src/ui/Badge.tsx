import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { useTheme } from './theme';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'accent';

export function Badge({
  label,
  tone = 'neutral',
  icon,
  size = 'md',
  style,
}: {
  label: string | number;
  tone?: BadgeTone;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius } = useTheme();
  const map: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: colors.surfaceAlt, fg: colors.textMuted },
    primary: { bg: colors.primarySoft, fg: colors.primary },
    success: { bg: colors.successSoft, fg: colors.success },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    info: { bg: colors.primarySoft, fg: colors.info },
    accent: { bg: colors.primarySoft, fg: colors.accent },
  };
  const c = map[tone];
  const fs = size === 'sm' ? 11 : 13;
  return (
    <View
      style={[
        { backgroundColor: c.bg, borderRadius: radius.pill, paddingHorizontal: size === 'sm' ? 6 : 10, paddingVertical: size === 'sm' ? 2 : 4, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={fs} color={c.fg} /> : null}
      <Text style={{ color: c.fg, fontSize: fs, lineHeight: fs + 4, fontWeight: '600' }}>{String(label)}</Text>
    </View>
  );
}

/** Small unread counter bubble. */
export function CountBadge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  if (!count) return null;
  return (
    <View style={[{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }, style]}>
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', lineHeight: 14 }}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}
