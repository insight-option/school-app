import type { ColorValue } from 'react-native';

/** React Navigation 8 passes tab tint colours as `ColorValue` (nullable); icon components want a string. */
export function tabColor(color: ColorValue | null | undefined): string | undefined {
  return typeof color === 'string' ? color : undefined;
}
