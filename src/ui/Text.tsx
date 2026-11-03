import React from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle, StyleSheet } from 'react-native';
import { useTheme, type ThemeColors, typography, weightKey } from './theme';

export type TextVariant = keyof typeof typography;

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  color?: keyof ThemeColors | string;
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontWeight'];
  children?: React.ReactNode;
};

/**
 * Text in the app typeface. Custom fonts ship one file per weight, so the weight is mapped to a
 * font family (fontWeight on a custom family is ignored on Android).
 */
export function Text({ variant = 'body', color = 'text', align, weight, style, ...rest }: TextProps) {
  const theme = useTheme();
  const resolved = (theme.colors as Record<string, string>)[color] ?? color;
  const flat = StyleSheet.flatten([typography[variant], weight ? { fontWeight: weight } : null, style]) as TextStyle;
  return (
    <RNText
      {...rest}
      style={[
        flat,
        { color: flat.color ?? resolved, fontFamily: flat.fontFamily ?? theme.fonts[weightKey(flat.fontWeight)], fontWeight: undefined, writingDirection: 'auto' as const },
        align ? { textAlign: align } : null,
        style && (style as TextStyle).color ? { color: (style as TextStyle).color } : null,
      ]}
    />
  );
}

/** fontFamily for raw RN text (TextInput etc.) at a given weight. */
export function useFontFamily(weight: TextStyle['fontWeight'] = '400'): string {
  return useTheme().fonts[weightKey(weight)];
}
