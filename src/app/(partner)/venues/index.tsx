import React from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, EmptyState, ErrorState, Screen, SkeletonCard, Text, useTheme } from '../../../ui';
import { StorageImage } from '../../../components/media/StorageImage';
import { useMyVenues } from '../../../features/partner';
import { categoryName, priceLabel, useCategories } from '../../../features/platform';
import type { Venue } from '../../../lib/data/client';

/** The business's venues with their live / hidden state. */
export default function PartnerVenues() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { spacing } = theme;
  const router = useRouter();
  const q = useMyVenues();
  const venues = [...(q.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Screen
      title={t('partner.venues.title')}
      subtitle={venues.length ? t('partner.venues.count', { count: venues.length }) : t('partner.venues.subtitle')}
      padded={false}
      maxWidth={900}
      right={<Button title={t('partner.venues.add')} icon="add" size="sm" onPress={() => router.push('/(partner)/venues/new' as never)} />}
    >
      {q.isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : q.isError ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} retryLabel={t('common.retry')} />
      ) : (
        <FlashList
          data={venues}
          keyExtractor={(v) => v.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshing={q.isRefetching}
          onRefresh={() => void q.refetch()}
          ListEmptyComponent={<EmptyState icon="football-outline" title={t('partner.venues.empty')} body={t('partner.venues.emptyBody')} actionLabel={t('partner.venues.add')} onAction={() => router.push('/(partner)/venues/new' as never)} />}
          renderItem={({ item }) => <VenueCard venue={item} onPress={() => router.push(`/(partner)/venues/${item.id}` as never)} />}
        />
      )}
    </Screen>
  );
}

function VenueCard({ venue, onPress }: { venue: Venue; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors } = theme;
  const categories = useCategories();
  const category = categories.data?.find((c) => c.id === venue.categoryId);
  const live = venue.directory === 'PUBLIC';
  const cover = venue.photos?.find(Boolean);
  return (
    <Card onPress={onPress} padding={0} style={{ overflow: 'hidden' }}>
      <View style={styles.row}>
        <View style={[styles.photo, { backgroundColor: colors.surfaceAlt }]}>
          {cover ? <StorageImage storageKey={cover} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="image-outline" size={28} color={colors.textFaint} />}
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text variant="subheading" numberOfLines={1} style={{ flex: 1 }}>
              {venue.name}
            </Text>
            <Badge label={live ? t('partner.venues.listed') : t('partner.venues.hidden')} tone={live ? 'success' : 'neutral'} size="sm" icon={live ? 'radio-button-on' : 'eye-off-outline'} />
          </View>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {[categoryName(category, i18n.language === 'ar'), venue.area].filter(Boolean).join(' · ')}
          </Text>
          <Text variant="captionStrong" color="primary" numberOfLines={1}>
            {priceLabel(venue, t, i18n.language)}
          </Text>
          <View style={styles.meta}>
            <Ionicons name="layers-outline" size={13} color={colors.textMuted} />
            <Text variant="caption" color="textMuted">
              {t('partner.venues.capacity', { count: venue.capacity ?? 1, label: venue.unitLabel || t('platform.venue.unitDefault') })}
            </Text>
            <Ionicons name="calendar-outline" size={13} color={colors.textMuted} style={{ marginStart: 8 }} />
            <Text variant="caption" color="textMuted">
              {t('partner.venues.bookingsCount', { count: venue.bookingCount ?? 0 })}
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  photo: { width: 112, minHeight: 112, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  body: { flex: 1, padding: 14, gap: 4, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
});
