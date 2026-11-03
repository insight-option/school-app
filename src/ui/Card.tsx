import React from 'react';
import { Pressable, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from './theme';

export type CardProps = ViewProps & {
  padding?: number;
  onPress?: () => void;
  tone?: 'default' | 'primary' | 'success' | 'danger' | 'warning' | 'muted';
  /** 'flat' drops the shadow (cards inside cards, dense lists). */
  elevation?: 'card' | 'raised' | 'flat';
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, padding, onPress, tone = 'default', elevation = 'card', style, ...rest }: CardProps) {
  const theme = useTheme();
  const { colors, radius, spacing } = theme;
  const bg = {
    default: colors.surface,
    primary: colors.primarySoft,
    success: colors.successSoft,
    danger: colors.dangerSoft,
    warning: colors.warningSoft,
    muted: colors.surfaceAlt,
  }[tone];
  const outlined = tone === 'default' && (theme.scheme === 'dark' || elevation === 'flat');
  const base: StyleProp<ViewStyle> = [
    { backgroundColor: bg, borderRadius: radius.xl, padding: padding ?? spacing.lg, borderWidth: outlined ? 1 : 0, borderColor: colors.border },
    tone === 'default' && elevation !== 'flat' ? theme.shadow[elevation] : null,
    style,
  ];
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]} {...(rest as object)}>
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
