import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { useTheme } from './theme';

export type ListItemProps = {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  left?: React.ReactNode;
  right?: React.ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  titleLines?: number;
  subtitleLines?: number;
  disabled?: boolean;
  testID?: string;
};

export const ListItem = React.memo(function ListItem({
  title,
  subtitle,
  meta,
  left,
  right,
  icon,
  onPress,
  onLongPress,
  chevron,
  selected,
  style,
  titleLines = 1,
  subtitleLines = 1,
  disabled,
  testID,
}: ListItemProps) {
  const theme = useTheme();
  const { colors, spacing } = theme;
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled || (!onPress && !onLongPress)}
      style={({ pressed }) => [
        styles.row,
        { paddingHorizontal: spacing.lg, minHeight: 60, backgroundColor: selected ? colors.primarySoft : pressed ? colors.surfaceAlt : colors.surface, borderBottomColor: colors.border },
        disabled && { opacity: 0.5 },
        style,
      ]}
    >
      {left ? <View style={styles.left}>{left}</View> : icon ? <Ionicons name={icon} size={22} color={colors.textMuted} style={styles.left} /> : null}
      <View style={styles.body}>
        <Text variant="bodyStrong" numberOfLines={titleLines}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted" numberOfLines={subtitleLines}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {meta ? (
        <Text variant="caption" color="textFaint" style={styles.meta}>
          {meta}
        </Text>
      ) : null}
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} style={styles.chevron} /> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  left: { marginEnd: 2 },
  body: { flex: 1, gap: 2 },
  meta: { marginStart: 4 },
  chevron: { transform: [{ scaleX: 1 }] },
});
