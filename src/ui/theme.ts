import { createContext, useContext } from 'react';
import { Platform, type TextStyle } from 'react-native';

/** Design tokens. Light is the primary theme; dark derives from the same scale. */
const palette = {
  blue600: '#2563EB',
  blue700: '#1D4ED8',
  blue50: '#EFF6FF',
  green600: '#16A34A',
  green50: '#F0FDF4',
  red600: '#DC2626',
  red50: '#FEF2F2',
  orange500: '#F97316',
  orange50: '#FFF7ED',
  amber500: '#F59E0B',
  purple600: '#7C3AED',
  gray50: '#F8FAFC',
  gray100: '#F1F5F9',
  gray200: '#E2E8F0',
  gray300: '#CBD5E1',
  gray400: '#94A3B8',
  gray500: '#64748B',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1E293B',
  gray900: '#0F172A',
  white: '#FFFFFF',
  black: '#000000',
};

export type ThemeColors = {
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  accent: string;
  overlay: string;
  tabBar: string;
  skeleton: string;
  // map marker states
  markerGoing: string;
  markerNotGoing: string;
  markerBoarded: string;
  markerAlarmed: string;
  markerSchool: string;
  markerBus: string;
};

export const lightColors: ThemeColors = {
  primary: palette.blue600,
  primaryPressed: palette.blue700,
  primarySoft: palette.blue50,
  onPrimary: palette.white,
  background: palette.gray50,
  surface: palette.white,
  surfaceAlt: palette.gray100,
  border: palette.gray200,
  text: palette.gray900,
  textMuted: palette.gray600,
  textFaint: palette.gray400,
  success: palette.green600,
  successSoft: palette.green50,
  danger: palette.red600,
  dangerSoft: palette.red50,
  warning: palette.orange500,
  warningSoft: palette.orange50,
  info: palette.blue600,
  accent: palette.purple600,
  overlay: 'rgba(15, 23, 42, 0.45)',
  tabBar: palette.white,
  skeleton: palette.gray200,
  markerGoing: palette.green600,
  markerNotGoing: palette.red600,
  markerBoarded: palette.gray500,
  markerAlarmed: palette.orange500,
  markerSchool: palette.purple600,
  markerBus: palette.blue600,
};

export const darkColors: ThemeColors = {
  ...lightColors,
  primary: '#3B82F6',
  primaryPressed: '#2563EB',
  primarySoft: 'rgba(59, 130, 246, 0.18)',
  background: '#0B1220',
  surface: '#111A2E',
  surfaceAlt: '#182238',
  border: '#243049',
  text: '#F1F5F9',
  textMuted: '#A3B1C6',
  textFaint: '#64748B',
  successSoft: 'rgba(22, 163, 74, 0.18)',
  dangerSoft: 'rgba(220, 38, 38, 0.18)',
  warningSoft: 'rgba(249, 115, 22, 0.18)',
  overlay: 'rgba(0, 0, 0, 0.6)',
  tabBar: '#0F172A',
  skeleton: '#1E293B',
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' } as TextStyle,
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' } as TextStyle,
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600' } as TextStyle,
  subheading: { fontSize: 17, lineHeight: 22, fontWeight: '600' } as TextStyle,
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' } as TextStyle,
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' } as TextStyle,
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' } as TextStyle,
  captionStrong: { fontSize: 13, lineHeight: 18, fontWeight: '600' } as TextStyle,
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.4 } as TextStyle,
};

export type Theme = {
  scheme: 'light' | 'dark';
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  shadow: {
    card: object;
    sheet: object;
  };
  touchTarget: number;
};

export function buildTheme(scheme: 'light' | 'dark', primaryOverride?: string | null): Theme {
  const base = scheme === 'dark' ? darkColors : lightColors;
  const colors: ThemeColors = primaryOverride && /^#[0-9a-fA-F]{6}$/.test(primaryOverride)
    ? { ...base, primary: primaryOverride, primaryPressed: shade(primaryOverride, -18), primarySoft: withAlpha(primaryOverride, scheme === 'dark' ? 0.2 : 0.1), markerBus: primaryOverride }
    : base;
  const shadowColor = scheme === 'dark' ? '#000' : '#0F172A';
  return {
    scheme,
    colors,
    spacing,
    radius,
    typography,
    touchTarget: 48,
    shadow: {
      card: Platform.select({
        web: { boxShadow: scheme === 'dark' ? '0 1px 2px rgba(0,0,0,0.5)' : '0 1px 3px rgba(15,23,42,0.08)' },
        default: { shadowColor, shadowOpacity: scheme === 'dark' ? 0.4 : 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
      }) as object,
      sheet: Platform.select({
        web: { boxShadow: '0 -4px 24px rgba(15,23,42,0.18)' },
        default: { shadowColor, shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
      }) as object,
    },
  };
}

export function shade(hex: string, percent: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + Math.round((255 * percent) / 100)));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + Math.round((255 * percent) / 100)));
  const b = Math.min(255, Math.max(0, (n & 0xff) + Math.round((255 * percent) / 100)));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export const ThemeContext = createContext<Theme>(buildTheme('light'));
export const useTheme = () => useContext(ThemeContext);

/** Deterministic avatar colour from a string (name / id). */
export function colorFromString(input: string): string {
  const colors = ['#2563EB', '#16A34A', '#F97316', '#7C3AED', '#DB2777', '#0891B2', '#CA8A04', '#DC2626', '#059669', '#4F46E5'];
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
