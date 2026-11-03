import React, { useMemo } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, EmptyState, Gradient, Skeleton, Text, useTheme } from '../../ui';
import { shade } from '../../ui/theme';
import { SchoolLogo, StorageImage } from '../../components/media/StorageImage';
import { VenueCard, useMinuteClock } from '../../components/explore/VenueCard';
import { categoryName, useBusiness, useCategories, useDirectoryVenues } from '../../features/platform';

type IconName = keyof typeof Ionicons.glyphMap;
const MAX_WIDTH = 980;

/** Public page of an activity business: cover, about, contacts and all its listed venues. */
export default function BusinessScreen() {
  const { businessId } = useLocalSearchParams<{ businessId: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors, spacing } = theme;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const business = useBusiness(businessId);
  const categories = useCategories();
  const venues = useDirectoryVenues();
  const now = useMinuteClock();
  const b = business.data;
  const list = useMemo(() => (venues.data ?? []).filter((v) => v.businessId === businessId), [venues.data, businessId]);
  const columns = Math.min(width, MAX_WIDTH) >= 680 ? 2 : 1;

  if (!b) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background, paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.lg }]}>
        {business.isLoading ? <Skeleton height={240} radius={28} /> : <EmptyState icon="alert-circle-outline" title={t('platform.venue.notFound')} actionLabel={t('platform.venue.back')} onAction={() => router.replace('/')} />}
      </View>
    );
  }
  const accent = b.primaryColor && /^#[0-9a-fA-F]{6}$/.test(b.primaryColor) ? b.primaryColor : colors.primary;
  const contacts: { icon: IconName; label: string; url: string }[] = [
    ...(b.phone ? [{ icon: 'call' as IconName, label: b.phone, url: `tel:${b.phone}` }] : []),
    ...(b.whatsapp ? [{ icon: 'logo-whatsapp' as IconName, label: t('platform.venue.whatsapp'), url: `https://wa.me/${b.whatsapp.replace(/\D/g, '')}` }] : []),
    ...(b.email ? [{ icon: 'mail' as IconName, label: b.email, url: `mailto:${b.email}` }] : []),
    ...(b.instagram ? [{ icon: 'logo-instagram' as IconName, label: `@${b.instagram.replace(/^@/, '')}`, url: `https://instagram.com/${b.instagram.replace(/^@/, '')}` }] : []),
    ...(b.website ? [{ icon: 'globe' as IconName, label: b.website.replace(/^https?:\/\//, ''), url: /^https?:/.test(b.website) ? b.website : `https://${b.website}` }] : []),
  ];

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.huge }}>
        <View style={{ height: 220 + insets.top }}>
          {b.coverKey ? (
            <StorageImage storageKey={b.coverKey} style={StyleSheet.absoluteFill} />
          ) : (
            <Gradient stops={[shade(accent, 12), accent, shade(accent, -32)]} angle={140} style={StyleSheet.absoluteFill} />
          )}
          <Gradient stops={[{ color: '#000000', opacity: 0.25 }, { color: '#000000', opacity: 0 }]} angle={180} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={[styles.glass, { top: insets.top + 8, start: 16 }]}
          >
            <Ionicons name="arrow-back" size={21} color="#FFFFFF" style={{ transform: [{ scaleX: theme.arabic ? -1 : 1 }] }} />
          </Pressable>
        </View>
        <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: spacing.lg, marginTop: -44, gap: spacing.lg }}>
          <SchoolLogo logoKey={b.logoKey} name={b.name} color={accent} size={88} bordered style={theme.shadow.raised} />
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text variant="display">{b.name}</Text>
              {b.verified ? <Badge label={t('platform.explore.verified')} tone="info" icon="checkmark-circle" /> : null}
            </View>
            {b.tagline ? <Text color="textMuted">{b.tagline}</Text> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {(b.categoryIds ?? []).map((id) => {
                const c = categories.data?.find((x) => x.id === id);
                return c ? <Badge key={id} label={categoryName(c, theme.arabic)} tone="primary" /> : null;
              })}
              {[b.area, b.city].filter(Boolean).length ? <Badge label={[b.area, b.city].filter(Boolean).join(', ')} icon="location" /> : null}
            </View>
          </View>
          {b.description ? (
            <Text color="textMuted" style={{ lineHeight: 23 }}>
              {b.description}
            </Text>
          ) : null}
          {contacts.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {contacts.map((c) => (
                <Pressable key={c.url} accessibilityRole="link" onPress={() => void Linking.openURL(c.url)} style={[styles.contact, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name={c.icon} size={16} color={colors.primary} />
                  <Text variant="captionStrong" numberOfLines={1}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text variant="heading" style={{ marginTop: spacing.sm }}>
            {t('platform.explore.results', { count: list.length })}
          </Text>
          <View style={[styles.grid, columns > 1 && styles.gridWide]}>
            {list.map((v) => (
              <View key={v.id} style={columns > 1 ? { width: '48.8%' } : undefined}>
                <VenueCard venue={v} category={categories.data?.find((c) => c.id === v.categoryId)} now={now} onPress={() => router.push(`/venues/${v.id}` as never)} />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  glass: { position: 'absolute', width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(22,19,26,0.42)' },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1, maxWidth: 260 },
  grid: { gap: 14 },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
});
