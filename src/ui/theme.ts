import { createContext, useContext } from 'react';
import { Platform, type TextStyle } from 'react-native';

/**
 * Design tokens (v2 – "premium"). Warm neutrals, one confident brand colour (Qatar maroon by
 * default; the platform owner can change it, schools override it inside their workspace), soft
 * layered shadows, generous radii and two typefaces: Plus Jakarta Sans (Latin) and IBM Plex Sans
 * Arabic (Arabic UI).
 */
export const BRAND_DEFAULT = '#8A1538';
export const ACCENT_DEFAULT = '#C8A24A';

const palette = {
  white: '#FFFFFF',
  black: '#000000',
  ink: '#16131A',
  ink2: '#2B2731',
  stone50: '#FAF9F7',
  stone100: '#F4F2EE',
  stone150: '#EEEBE5',
  stone200: '#E6E2DA',
  stone300: '#D3CEC4',
  stone400: '#A8A29A',
  stone500: '#7B756E',
  stone600: '#5E5862',
  green: '#12A150',
  greenSoft: '#E7F7EE',
  red: '#E5484D',
  redSoft: '#FDECEC',
  amber: '#F59E0B',
  amberSoft: '#FEF4E2',
  blue: '#3E63DD',
  violet: '#6E56CF',
};

export type ThemeColors = {
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;
  accent: string;
  accentSoft: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  inverse: string;
  onInverse: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  overlay: string;
  scrim: string;
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
  primary: BRAND_DEFAULT,
  primaryPressed: '#6E0F2B',
  primarySoft: 'rgba(138, 21, 56, 0.08)',
  onPrimary: palette.white,
  accent: ACCENT_DEFAULT,
  accentSoft: 'rgba(200, 162, 74, 0.14)',
  background: palette.stone100,
  surface: palette.white,
  surfaceAlt: palette.stone150,
  surfaceRaised: palette.white,
  border: palette.stone200,
  borderStrong: palette.stone300,
  text: palette.ink,
  textMuted: palette.stone600,
  textFaint: palette.stone400,
  inverse: palette.ink,
  onInverse: palette.white,
  success: palette.green,
  successSoft: palette.greenSoft,
  danger: palette.red,
  dangerSoft: palette.redSoft,
  warning: palette.amber,
  warningSoft: palette.amberSoft,
  info: palette.blue,
  overlay: 'rgba(22, 19, 26, 0.45)',
  scrim: 'rgba(22, 19, 26, 0.55)',
  tabBar: 'rgba(255, 255, 255, 0.96)',
  skeleton: palette.stone150,
  markerGoing: palette.green,
  markerNotGoing: palette.red,
  markerBoarded: palette.stone500,
  markerAlarmed: '#F97316',
  markerSchool: palette.violet,
  markerBus: BRAND_DEFAULT,
};

export const darkColors: ThemeColors = {
  ...lightColors,
  primary: '#D23A63',
  primaryPressed: '#B02A50',
  primarySoft: 'rgba(210, 58, 99, 0.16)',
  accent: '#E0BE6B',
  accentSoft: 'rgba(224, 190, 107, 0.16)',
  background: '#0D0B10',
  surface: '#17141C',
  surfaceAlt: '#211D27',
  surfaceRaised: '#1D1923',
  border: '#2B2632',
  borderStrong: '#3A3443',
  text: '#F5F2F8',
  textMuted: '#B5AEBD',
  textFaint: '#7D7685',
  inverse: '#F5F2F8',
  onInverse: '#16131A',
  successSoft: 'rgba(18, 161, 80, 0.18)',
  dangerSoft: 'rgba(229, 72, 77, 0.18)',
  warningSoft: 'rgba(245, 158, 11, 0.18)',
  overlay: 'rgba(0, 0, 0, 0.6)',
  scrim: 'rgba(0, 0, 0, 0.7)',
  tabBar: 'rgba(23, 20, 28, 0.96)',
  skeleton: '#241F2A',
  markerBus: '#D23A63',
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;
export const radius = { sm: 10, md: 14, lg: 18, xl: 24, xxl: 32, pill: 999 } as const;

export type FontWeightKey = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';

/** Font family names registered in the root layout (expo-font). */
export const FONT_FAMILIES = {
  latin: {
    regular: 'PlusJakartaSans_400Regular',
    medium: 'PlusJakartaSans_500Medium',
    semibold: 'PlusJakartaSans_600SemiBold',
    bold: 'PlusJakartaSans_700Bold',
    extrabold: 'PlusJakartaSans_800ExtraBold',
  },
  arabic: {
    regular: 'IBMPlexSansArabic_400Regular',
    medium: 'IBMPlexSansArabic_500Medium',
    semibold: 'IBMPlexSansArabic_600SemiBold',
    bold: 'IBMPlexSansArabic_700Bold',
    extrabold: 'IBMPlexSansArabic_700Bold',
  },
} as const;

export function weightKey(weight: TextStyle['fontWeight'] | undefined): FontWeightKey {
  const w = String(weight ?? '400');
  if (w === 'bold' || w === '700') return 'bold';
  if (w === '800' || w === '900') return 'extrabold';
  if (w === '600') return 'semibold';
  if (w === '500') return 'medium';
  return 'regular';
}

export const typography = {
  hero: { fontSize: 38, lineHeight: 44, fontWeight: '800', letterSpacing: -0.8 } as TextStyle,
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.6 } as TextStyle,
  title: { fontSize: 25, lineHeight: 31, fontWeight: '800', letterSpacing: -0.4 } as TextStyle,
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2 } as TextStyle,
  subheading: { fontSize: 17, lineHeight: 23, fontWeight: '700', letterSpacing: -0.1 } as TextStyle,
  body: { fontSize: 15.5, lineHeight: 22, fontWeight: '400' } as TextStyle,
  bodyStrong: { fontSize: 15.5, lineHeight: 22, fontWeight: '600' } as TextStyle,
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' } as TextStyle,
  captionStrong: { fontSize: 13, lineHeight: 18, fontWeight: '600' } as TextStyle,
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.3 } as TextStyle,
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' } as TextStyle,
  numeric: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6 } as TextStyle,
};

export type Theme = {
  scheme: 'light' | 'dark';
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  /** Font families for the current UI language (Arabic UI uses IBM Plex Sans Arabic). */
  fonts: Record<FontWeightKey, string>;
  arabic: boolean;
  shadow: {
    card: object;
    raised: object;
    sheet: object;
    glow: object;
  };
  touchTarget: number;
};

const isHex = (v: string | null | undefined): v is string => !!v && /^#[0-9a-fA-F]{6}$/.test(v);

/** Relative luminance (0 dark … 1 light). */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function buildTheme(
  scheme: 'light' | 'dark',
  primaryOverride?: string | null,
  opts: { arabic?: boolean; accent?: string | null } = {},
): Theme {
  const base = scheme === 'dark' ? darkColors : lightColors;
  let colors: ThemeColors = base;
  if (isHex(primaryOverride)) {
    // On dark backgrounds very dark brand colours are lifted so buttons and links stay readable.
    const primary = scheme === 'dark' && luminance(primaryOverride) < 0.08 ? shade(primaryOverride, 22) : primaryOverride;
    colors = {
      ...colors,
      primary,
      primaryPressed: shade(primary, -14),
      primarySoft: withAlpha(primary, scheme === 'dark' ? 0.18 : 0.09),
      onPrimary: luminance(primary) > 0.55 ? palette.ink : palette.white,
      markerBus: primary,
    };
  }
  if (isHex(opts.accent)) colors = { ...colors, accent: opts.accent, accentSoft: withAlpha(opts.accent, scheme === 'dark' ? 0.18 : 0.14) };
  const shadowColor = scheme === 'dark' ? '#000' : '#2A1A22';
  const web = (css: string): object => ({ boxShadow: css });
  return {
    scheme,
    colors,
    spacing,
    radius,
    typography,
    arabic: !!opts.arabic,
    fonts: opts.arabic ? FONT_FAMILIES.arabic : FONT_FAMILIES.latin,
    touchTarget: 48,
    shadow: {
      card: Platform.select<object>({
        web: web(scheme === 'dark' ? '0 1px 2px rgba(0,0,0,0.5)' : '0 1px 2px rgba(42,26,34,0.04), 0 4px 14px rgba(42,26,34,0.06)'),
        default: { shadowColor, shadowOpacity: scheme === 'dark' ? 0.35 : 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
      }) as object,
      raised: Platform.select<object>({
        web: web(scheme === 'dark' ? '0 8px 30px rgba(0,0,0,0.55)' : '0 2px 6px rgba(42,26,34,0.05), 0 14px 34px rgba(42,26,34,0.12)'),
        default: { shadowColor, shadowOpacity: scheme === 'dark' ? 0.5 : 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
      }) as object,
      sheet: Platform.select<object>({
        web: web('0 -6px 32px rgba(22,19,26,0.18)'),
        default: { shadowColor, shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: -6 }, elevation: 16 },
      }) as object,
      glow: Platform.select<object>({
        web: web(`0 10px 28px ${withAlpha(isHex(colors.primary) ? colors.primary : BRAND_DEFAULT, 0.35)}`),
        default: { shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
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
  if (!isHex(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export const ThemeContext = createContext<Theme>(buildTheme('light'));
export const useTheme = () => useContext(ThemeContext);

/** Deterministic accent colour from a string (name / id). */
export function colorFromString(input: string): string {
  const colors = ['#8A1538', '#12A150', '#E8590C', '#6E56CF', '#D6336C', '#0C8599', '#B08900', '#3E63DD', '#2B8A3E', '#5F3DC4'];
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
