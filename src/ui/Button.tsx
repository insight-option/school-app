import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { useTheme } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  title?: string;
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, children, variant = 'primary', size = 'md', loading, disabled, icon, iconRight, fullWidth, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const { colors, radius } = theme;
  const isDisabled = disabled || loading;

  const palette = {
    primary: { bg: colors.primary, pressed: colors.primaryPressed, fg: colors.onPrimary, border: 'transparent' },
    secondary: { bg: colors.primarySoft, pressed: colors.border, fg: colors.primary, border: 'transparent' },
    outline: { bg: 'transparent', pressed: colors.surfaceAlt, fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', pressed: colors.surfaceAlt, fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.danger, pressed: '#B91C1C', fg: '#fff', border: 'transparent' },
    success: { bg: colors.success, pressed: '#15803D', fg: '#fff', border: 'transparent' },
  }[variant];

  const dims = { sm: { h: 36, px: 12, fs: 14 }, md: { h: 48, px: 18, fs: 16 }, lg: { h: 56, px: 22, fs: 17 }, xl: { h: 68, px: 28, fs: 20 } }[size];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      {...rest}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: dims.h,
          paddingHorizontal: dims.px,
          backgroundColor: pressed ? palette.pressed : palette.bg,
          borderColor: palette.border,
          borderWidth: variant === 'outline' ? 1 : 0,
          borderRadius: radius.md,
          opacity: isDisabled ? 0.55 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={dims.fs + 4} color={palette.fg} style={styles.iconLeft} /> : null}
          {title ? (
            <Text variant="bodyStrong" style={{ color: palette.fg, fontSize: dims.fs, lineHeight: dims.fs + 6 }} numberOfLines={1}>
              {title}
            </Text>
          ) : (
            children
          )}
          {iconRight ? <Ionicons name={iconRight} size={dims.fs + 4} color={palette.fg} style={styles.iconRight} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  iconLeft: { marginEnd: 2 },
  iconRight: { marginStart: 2 },
});
