import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gradient, Text, heroStops, useTheme, withAlpha } from '../../ui';
import { toast } from '../../ui/Toast';
import { BrandMark } from '../explore/BrandMark';
import { useBranding } from '../../features/branding';
import { currentLanguage, setAppLanguage } from '../../lib/i18n';

type IconName = keyof typeof Ionicons.glyphMap;

const FEATURES: { icon: IconName; key: string }[] = [
  { icon: 'school-outline', key: 'auth.hero.schools' },
  { icon: 'bus-outline', key: 'auth.hero.bus' },
  { icon: 'tennisball-outline', key: 'auth.hero.activities' },
];

/**
 * Sign-in / password screens: brand gradient hero with the form card floating over it on phones,
 * a split brand panel + form on tablets and the web.
 */
export function AuthShell({
  title,
  subtitle,
  icon,
  children,
  footer,
}: {
  title: string;
  subtitle?: string | null;
  icon?: IconName;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const theme = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const branding = useBranding();
  const wide = width >= 900;
  const stops = heroStops(theme);

  const heading = (
    <View style={{ gap: 6, alignItems: wide ? 'flex-start' : 'center' }}>
      {icon && wide ? (
        <View style={[styles.iconBadge, { backgroundColor: wide ? colors.primarySoft : 'rgba(255,255,255,0.16)' }]}>
          <Ionicons name={icon} size={22} color={wide ? colors.primary : '#FFFFFF'} />
        </View>
      ) : null}
      <Text variant="display" align={wide ? undefined : 'center'} style={wide ? null : styles.onDark}>
        {title}
      </Text>
      {subtitle ? (
        <Text align={wide ? undefined : 'center'} color="textMuted" style={wide ? null : styles.onDarkMuted}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  const form = (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, theme.shadow.raised]}>
      {wide ? heading : null}
      <View style={{ gap: theme.spacing.lg }}>{children}</View>
    </View>
  );

  if (wide) {
    return (
      <View style={[styles.fill, styles.row, { backgroundColor: colors.background }]}>
        <Gradient stops={stops} angle={155} style={[styles.brandPanel, { paddingTop: insets.top + 36 }]}>
          <Orbs />
          <View style={styles.brandRow}>
            <BrandMark size={52} onDark />
            <Text variant="heading" style={styles.onDark}>
              {branding.appName}
            </Text>
          </View>
          <View style={{ gap: 26, maxWidth: 440 }}>
            <Text style={[styles.onDark, styles.tagline]}>{branding.tagline}</Text>
            <View style={{ gap: 14 }}>
              {FEATURES.map((f) => (
                <Feature key={f.key} icon={f.icon} textKey={f.key} />
              ))}
            </View>
          </View>
          <Text variant="caption" style={styles.onDarkFaint}>
            © {new Date().getFullYear()} {branding.appName}
          </Text>
        </Gradient>
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.wideScroll, { minHeight: height }]}>
            <View style={styles.wideTop}>
              <BackButton tone="light" />
              <LanguagePill tone="light" />
            </View>
            <View style={{ width: '100%', maxWidth: 460, alignSelf: 'center', gap: theme.spacing.xl }}>
              {form}
              {footer}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 28 }}>
          <Gradient stops={stops} angle={160} style={[styles.hero, { paddingTop: insets.top + 10 }]}>
            <Orbs />
            <View style={styles.topRow}>
              <BackButton tone="dark" />
              <LanguagePill tone="dark" />
            </View>
            <View style={{ alignItems: 'center', gap: 12, marginTop: 14 }}>
              <View style={styles.markRing}>
                <BrandMark size={64} onDark />
              </View>
              <Text variant="overline" style={styles.onDarkMuted}>
                {branding.appName}
              </Text>
            </View>
            <View style={{ marginTop: 10 }}>{heading}</View>
          </Gradient>
          <View style={[styles.phoneBody, { gap: theme.spacing.xl }]}>
            {form}
            {footer}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Feature({ icon, textKey }: { icon: IconName; textKey: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={18} color="#FFFFFF" />
      </View>
      <Text variant="bodyStrong" style={[styles.onDark, { flex: 1 }]}>
        {t(textKey)}
      </Text>
    </View>
  );
}

/** Soft light circles over the gradient. */
function Orbs() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.orb, { width: 260, height: 260, top: -90, end: -70, backgroundColor: 'rgba(255,255,255,0.07)' }]} />
      <View style={[styles.orb, { width: 180, height: 180, bottom: -60, start: -50, backgroundColor: 'rgba(255,255,255,0.06)' }]} />
      <View style={[styles.orb, { width: 90, height: 90, top: 120, start: '58%', backgroundColor: 'rgba(255,255,255,0.05)' }]} />
    </View>
  );
}

function BackButton({ tone }: { tone: 'dark' | 'light' }) {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useTranslation();
  const onDark = tone === 'dark';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      hitSlop={10}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={({ pressed }) => [
        styles.circle,
        onDark ? styles.glass : { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1 },
        { opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <Ionicons name="arrow-back" size={21} color={onDark ? '#FFFFFF' : theme.colors.text} style={{ transform: [{ scaleX: theme.arabic ? -1 : 1 }] }} />
    </Pressable>
  );
}

function LanguagePill({ tone }: { tone: 'dark' | 'light' }) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const onDark = tone === 'dark';
  const active = i18n.language === 'ar' ? 'ar' : currentLanguage();
  return (
    <View style={[styles.langPill, onDark ? styles.glass : { backgroundColor: theme.colors.surfaceAlt }]}>
      {(['en', 'ar'] as const).map((lang) => {
        const on = active === lang;
        return (
          <Pressable
            key={lang}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={async () => {
              if (on) return;
              const restart = await setAppLanguage(lang);
              if (restart) toast.info(t('common.restartRequired'));
            }}
            style={[styles.langItem, on ? { backgroundColor: onDark ? '#FFFFFF' : theme.colors.surface } : null]}
          >
            <Text variant="captionStrong" style={{ color: on ? theme.colors.primary : onDark ? 'rgba(255,255,255,0.85)' : theme.colors.textMuted }}>
              {lang === 'en' ? 'EN' : 'ع'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "Signed in as" style chip used on the password screens. */
export function IdentityChip({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: withAlpha(theme.colors.primary, 0.08), borderColor: withAlpha(theme.colors.primary, 0.18) }]}>
      <Ionicons name="person-circle" size={22} color={theme.colors.primary} />
      <View style={{ flex: 1 }}>
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
        <Text variant="bodyStrong" numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

/** Live checklist of the password rules (8+ characters, upper, lower, number). */
export function PasswordRules({ password }: { password: string }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const rules = [
    { ok: password.length >= 8, label: t('auth.rules.length') },
    { ok: /[A-Z]/.test(password), label: t('auth.rules.upper') },
    { ok: /[a-z]/.test(password), label: t('auth.rules.lower') },
    { ok: /\d/.test(password), label: t('auth.rules.number') },
  ];
  return (
    <View style={styles.rules}>
      {rules.map((r) => (
        <View key={r.label} style={[styles.rule, { backgroundColor: r.ok ? withAlpha(theme.colors.success, 0.12) : theme.colors.surfaceAlt }]}>
          <Ionicons name={r.ok ? 'checkmark-circle' : 'ellipse-outline'} size={15} color={r.ok ? theme.colors.success : theme.colors.textFaint} />
          <Text variant="caption" weight="600" style={{ color: r.ok ? theme.colors.success : theme.colors.textMuted }}>
            {r.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row' },
  hero: { paddingHorizontal: 20, paddingBottom: 76, overflow: 'hidden', borderBottomStartRadius: 34, borderBottomEndRadius: 34 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  markRing: { padding: 6, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.14)' },
  phoneBody: { marginTop: -52, paddingHorizontal: 16, width: '100%', maxWidth: 520, alignSelf: 'center' },
  card: { borderRadius: 28, padding: 22, gap: 22, borderWidth: StyleSheet.hairlineWidth },
  iconBadge: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  onDark: { color: '#FFFFFF' },
  onDarkMuted: { color: 'rgba(255,255,255,0.82)' },
  onDarkFaint: { color: 'rgba(255,255,255,0.6)' },
  brandPanel: { width: '44%', maxWidth: 620, paddingHorizontal: 48, paddingBottom: 36, justifyContent: 'space-between', overflow: 'hidden' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tagline: { fontSize: 34, lineHeight: 42, fontWeight: '800', letterSpacing: -0.8 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featureIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  wideScroll: { flexGrow: 1, paddingHorizontal: 32, paddingVertical: 28, justifyContent: 'center' },
  wideTop: { position: 'absolute', top: 24, start: 32, end: 32, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orb: { position: 'absolute', borderRadius: 999 },
  circle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  glass: { backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  langPill: { flexDirection: 'row', padding: 3, borderRadius: 999, gap: 2 },
  langItem: { minWidth: 40, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderWidth: 1 },
  rules: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
});
