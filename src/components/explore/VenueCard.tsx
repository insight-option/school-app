import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Gradient, PressableScale, Text, useTheme } from '../../ui';
import { shade } from '../../ui/theme';
import { StorageImage } from '../media/StorageImage';
import { categoryName, isOpenNow, parseHours, priceLabel } from '../../features/platform';
import type { Category, Venue } from '../../lib/data/client';

type IconName = keyof typeof Ionicons.glyphMap;

/** Current time, refreshed every minute (keeps "Open now" badges honest without impure renders). */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Photo, or a branded gradient with the category icon when the venue has no photo yet. */
export function VenueCover({ venue, category, height, radius = 0, children }: { venue: Venue; category?: Category | null; height: number; radius?: number; children?: React.ReactNode }) {
  const theme = useTheme();
  const color = category?.color && /^#[0-9a-fA-F]{6}$/.test(category.color) ? category.color : theme.colors.primary;
  const photo = venue.photos?.[0];
  return (
    <View style={{ height, overflow: 'hidden', borderTopLeftRadius: radius, borderTopRightRadius: radius, backgroundColor: theme.colors.surfaceAlt }}>
      {photo ? (
        <StorageImage storageKey={photo} style={StyleSheet.absoluteFill} />
      ) : (
        <Gradient stops={[shade(color, 14), color, shade(color, -30)]} angle={135} style={StyleSheet.absoluteFill}>
          <Ionicons name={(category?.icon as IconName) || 'sparkles'} size={height * 0.9} color="rgba(255,255,255,0.13)" style={{ position: 'absolute', end: -height * 0.12, bottom: -height * 0.2 }} />
        </Gradient>
      )}
      <Gradient stops={[{ color: '#000000', opacity: 0 }, { color: '#000000', opacity: 0.45 }]} angle={180} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {children}
    </View>
  );
}

function Pill({ icon, label, tone }: { icon?: IconName; label: string; tone: 'light' | 'dark' | 'success' | 'gold' }) {
  const theme = useTheme();
  const bg = { light: 'rgba(255,255,255,0.95)', dark: 'rgba(22,19,26,0.62)', success: 'rgba(255,255,255,0.95)', gold: theme.colors.accent }[tone];
  const fg = { light: theme.colors.text, dark: '#FFFFFF', success: '#0E8A44', gold: '#1A1406' }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {tone === 'success' ? <View style={[styles.dot, { backgroundColor: '#12A150' }]} /> : icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text variant="label" style={{ color: fg, letterSpacing: 0 }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Large card for carousels and grids. */
export const VenueCard = React.memo(function VenueCard({
  venue,
  category,
  now,
  onPress,
  width,
  style,
}: {
  venue: Venue;
  category?: Category | null;
  now: number;
  onPress: () => void;
  width?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors, radius, spacing } = theme;
  const open = isOpenNow(parseHours(venue.openingHours), now);
  const place = [venue.area, venue.city].filter(Boolean).join(', ');
  return (
    <PressableScale onPress={onPress} accessibilityLabel={venue.name} style={[{ width }, style]}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.xl }, theme.scheme === 'dark' ? { borderWidth: 1, borderColor: colors.border } : null, theme.shadow.card]}>
        <VenueCover venue={venue} category={category} height={156} radius={radius.xl}>
          <View style={styles.topRow}>
            {venue.featured ? <Pill icon="star" label={t('platform.explore.featured')} tone="gold" /> : null}
            {open ? <Pill label={t('platform.explore.openNow')} tone="success" /> : null}
          </View>
          <View style={styles.bottomRow}>
            <Pill label={priceLabel(venue, t, i18n.language)} tone="dark" />
          </View>
        </VenueCover>
        <View style={{ padding: spacing.lg, paddingTop: spacing.md, gap: 4 }}>
          <Text variant="subheading" numberOfLines={1}>
            {venue.name}
          </Text>
          <View style={styles.metaRow}>
            {category ? (
              <Text variant="caption" color="primary" weight="700" numberOfLines={1}>
                {categoryName(category, theme.arabic)}
              </Text>
            ) : null}
            {category && place ? <View style={[styles.sep, { backgroundColor: colors.textFaint }]} /> : null}
            {place ? (
              <Text variant="caption" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
                {place}
              </Text>
            ) : null}
          </View>
          {venue.businessName ? (
            <Text variant="caption" color="textFaint" numberOfLines={1}>
              {t('platform.explore.by', { name: venue.businessName })}
            </Text>
          ) : null}
        </View>
      </View>
    </PressableScale>
  );
});

/** Compact row for vertical lists. */
export const VenueRow = React.memo(function VenueRow({ venue, category, now, onPress }: { venue: Venue; category?: Category | null; now: number; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors, radius, spacing } = theme;
  const open = isOpenNow(parseHours(venue.openingHours), now);
  const place = [venue.area, venue.city].filter(Boolean).join(', ');
  return (
    <PressableScale onPress={onPress} accessibilityLabel={venue.name}>
      <View style={[styles.row, { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.sm }, theme.scheme === 'dark' ? { borderWidth: 1, borderColor: colors.border } : null, theme.shadow.card]}>
        <View style={{ width: 92, height: 92, borderRadius: radius.lg, overflow: 'hidden' }}>
          <VenueCover venue={venue} category={category} height={92} />
        </View>
        <View style={{ flex: 1, gap: 3, paddingVertical: 4 }}>
          <Text variant="bodyStrong" weight="700" numberOfLines={1}>
            {venue.name}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {[category ? categoryName(category, theme.arabic) : null, place].filter(Boolean).join(' · ')}
          </Text>
          <View style={[styles.metaRow, { marginTop: 4 }]}>
            <Text variant="captionStrong" weight="800" numberOfLines={1}>
              {priceLabel(venue, t, i18n.language)}
            </Text>
            <View style={[styles.sep, { backgroundColor: colors.textFaint }]} />
            <Text variant="caption" color={open ? 'success' : 'textFaint'} weight="700">
              {open ? t('platform.explore.openNow') : t('platform.explore.closed')}
            </Text>
          </View>
        </View>
        <View style={[styles.go, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="arrow-forward" size={16} color={colors.primary} style={{ transform: [{ scaleX: theme.arabic ? -1 : 1 }] }} />
        </View>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  topRow: { position: 'absolute', top: 12, start: 12, end: 12, flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  bottomRow: { position: 'absolute', bottom: 12, start: 12, flexDirection: 'row' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sep: { width: 3, height: 3, borderRadius: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  go: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginEnd: 6 },
});
