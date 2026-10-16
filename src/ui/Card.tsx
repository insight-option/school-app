import React from 'react';
import { Pressable, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from './theme';

export type CardProps = ViewProps & {
  padding?: number;
  onPress?: () => void;
  tone?: 'default' | 'primary' | 'success' | 'danger' | 'warning';
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, padding, onPress, tone = 'default', style, ...rest }: CardProps) {
  const theme = useTheme();
  const { colors, radius, spacing } = theme;
  const bg = {
    default: colors.surface,
    primary: colors.primarySoft,
    success: colors.successSoft,
    danger: colors.dangerSoft,
    warning: colors.warningSoft,
  }[tone];
  const base: StyleProp<ViewStyle> = [
    { backgroundColor: bg, borderRadius: radius.lg, padding: padding ?? spacing.lg, borderWidth: 1, borderColor: tone === 'default' ? colors.border : 'transparent' },
    theme.shadow.card,
    style,
  ];
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85 }]} {...(rest as object)}>
        {children}
      </Pressable>
    );
  }
  return (
    <View style={base} {...rest}>
      {children}
    </View>
  );
}
