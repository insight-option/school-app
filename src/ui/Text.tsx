import React from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle, StyleSheet } from 'react-native';
import { useTheme, type ThemeColors, typography } from './theme';

export type TextVariant = keyof typeof typography;

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  color?: keyof ThemeColors | string;
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontWeight'];
  children?: React.ReactNode;
};

export function Text({ variant = 'body', color = 'text', align, weight, style, ...rest }: TextProps) {
  const theme = useTheme();
  const resolved = (theme.colors as Record<string, string>)[color] ?? color;
  return (
    <RNText
      {...rest}
      style={StyleSheet.flatten([
        typography[variant],
        { color: resolved, writingDirection: 'auto' as const },
        align ? { textAlign: align } : null,
        weight ? { fontWeight: weight } : null,
        style,
      ])}
    />
  );
}
