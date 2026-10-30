import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Gradient, PressableScale, Text, useTheme } from '../../ui';
import { colorFromString, shade } from '../../ui/theme';
import { SchoolLogo, StorageImage } from '../media/StorageImage';
import { acceptsApplications, feeRange, locationLine } from '../../lib/directory';
import { formatDate } from '../../lib/util/format';
import type { School } from '../../lib/data/client';

export const SCHOOL_CARD_COVER = 128;

/** Accent colour of a school (its brand colour, or a stable colour derived from its name). */
export function schoolAccent(s: Pick<School, 'primaryColor' | 'name'>): string {
  return s.primaryColor && /^#[0-9a-fA-F]{6}$/.test(s.primaryColor) ? s.primaryColor : colorFromString(s.name);
}

/** Cover photo, or a branded gradient with a large watermark icon when the school has none. */
export function SchoolCover({ school, height, children }: { school: Pick<School, 'coverKey' | 'primaryColor' | 'name'>; height: number; children?: React.ReactNode }) {
  const accent = schoolAccent(school);
  return (
    <View style={{ height, overflow: 'hidden' }}>
      {school.coverKey ? (
        <StorageImage storageKey={school.coverKey} style={StyleSheet.absoluteFill} />
      ) : (
        <Gradient stops={[shade(accent, 12), accent, shade(accent, -28)]} angle={135} style={StyleSheet.absoluteFill}>
          <Ionicons name="school" size={height * 1.05} color="rgba(255,255,255,0.10)" style={{ position: 'absolute', right: -height * 0.12, bottom: -height * 0.28 }} />
        </Gradient>
      )}
      <Gradient stops={[{ color: '#000000', opacity: 0 }, { color: '#000000', opacity: 0.38 }]} angle={180} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {children}
    </View>
  );
}

export const SchoolCard = React.memo(function SchoolCard({ school, onPress }: { school: School; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors, radius, spacing } = theme;
  const open = acceptsApplications(school);
  const place = locationLine(school);
  const fees = feeRange(school, i18n.language);
  return (
    <PressableScale onPress={onPress} accessibilityLabel={school.name} style={{ flex: 1 }}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }, theme.shadow.card]}>
        <SchoolCover school={school} height={SCHOOL_CARD_COVER}>
          {open ? (
            <View style={[styles.statusPill, { backgroundColor: 'rgba(255,255,255,0.94)' }]}>
              <View style={[styles.dot, { backgroundColor: colors.success }]} />
              <Text variant="label" style={{ color: '#065F46' }}>
                {t('landing.open')}
              </Text>
            </View>
          ) : null}
          {school.transportAvailable ? (
            <View style={[styles.busPill, { backgroundColor: 'rgba(15,23,42,0.55)' }]}>
              <Ionicons name="bus" size={13} color="#fff" />
            </View>
          ) : null}
        </SchoolCover>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
          <SchoolLogo logoKey={school.logoKey} name={school.name} color={school.primaryColor} size={60} bordered style={[styles.logo, theme.shadow.card]} />
          <Text variant="subheading" numberOfLines={2} style={{ marginTop: spacing.sm }}>
            {school.name}
          </Text>
          {school.tagline ? (
            <Text variant="caption" color="textMuted" numberOfLines={2} style={{ marginTop: 2 }}>
              {school.tagline}
            </Text>
          ) : null}
          <View style={[styles.metaRow, { marginTop: spacing.md }]}>
            {place ? (
              <View style={styles.meta}>
                <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {place}
                </Text>
              </View>
            ) : null}
            {school.curriculum ? (
              <View style={[styles.tag, { backgroundColor: colors.primarySoft }]}>
                <Text variant="label" color="primary" numberOfLines={1}>
                  {school.curriculum}
                </Text>
              </View>
            ) : null}
            {school.grades ? (
              <View style={[styles.tag, { backgroundColor: colors.surfaceAlt }]}>
                <Text variant="label" color="textMuted" numberOfLines={1}>
                  {school.grades}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={[styles.footer, { borderTopColor: colors.border, marginTop: spacing.md }]}>
            <View style={{ flex: 1 }}>
              {fees ? (
                <Text variant="captionStrong" numberOfLines={1}>
                  {t('landing.fromFees', { fees })}
                </Text>
              ) : open && school.applicationDeadline ? (
                <Text variant="captionStrong" color="success" numberOfLines={1}>
                  {t('landing.applyBy', { date: formatDate(school.applicationDeadline) })}
                </Text>
              ) : (
                <Text variant="caption" color={open ? 'success' : 'textFaint'} numberOfLines={1}>
                  {open ? t('landing.open') : t('landing.closed')}
                </Text>
              )}
            </View>
            <View style={[styles.arrow, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="arrow-forward" size={16} color={colors.primary} />
            </View>
          </View>
        </View>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  statusPill: { position: 'absolute', top: 12, start: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  busPill: { position: 'absolute', top: 12, end: 12, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  logo: { marginTop: -34 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, maxWidth: 180 },
  footer: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  arrow: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
