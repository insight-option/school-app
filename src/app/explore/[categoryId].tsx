import React, { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, EmptyState, ErrorState, Skeleton, Text, useTheme } from '../../ui';
import { withAlpha } from '../../ui/theme';
import { DirectoryScreen } from '../../components/directory/DirectoryScreen';
import { VenueCard, useMinuteClock } from '../../components/explore/VenueCard';
import { categoryName, filterVenues, rankVenues, useCategories, useDirectoryVenues, type VenueFilter } from '../../features/platform';
import { haptic } from '../../lib/util/device';

type IconName = keyof typeof Ionicons.glyphMap;
const MAX_WIDTH = 1180;

/** A category of Explore: every listed venue of that category with search and filters ("schools" → school directory). */
export default function CategoryScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  if (categoryId === 'schools') return <DirectoryScreen />;
  return <VenuesByCategory categoryId={categoryId} />;
}

function VenuesByCategory({ categoryId }: { categoryId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors, spacing, radius } = theme;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const categories = useCategories();
  const venues = useDirectoryVenues();
  const now = useMinuteClock();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Omit<VenueFilter, 'query' | 'categoryId'>>({});
  const deferred = useDeferredValue(query);

  const category = categories.data?.find((c) => c.id === categoryId);
  const color = category?.color && /^#[0-9a-fA-F]{6}$/.test(category.color) ? category.color : colors.primary;
  const rows = useMemo(
    () => rankVenues(filterVenues(venues.data ?? [], { ...filter, query: deferred, categoryId: categoryId === 'all' ? null : categoryId })),
    [venues.data, filter, deferred, categoryId],
  );
  const contentWidth = Math.min(width, MAX_WIDTH);
  const columns = contentWidth >= 1080 ? 3 : contentWidth >= 680 ? 2 : 1;
  const sidePad = Math.max(spacing.lg, (width - MAX_WIDTH) / 2 + spacing.lg);
  const filtered = !!(query || filter.openNow || filter.indoor != null || filter.audience);
  const title = categoryId === 'all' ? t('platform.explore.popular') : categoryName(category, theme.arabic);

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.sm, width: '100%' }}>
      <View style={[styles.banner, { backgroundColor: withAlpha(color, theme.scheme === 'dark' ? 0.2 : 0.1), borderRadius: radius.xxl }]}>
        <View style={[styles.bannerIcon, { backgroundColor: color }]}>
          <Ionicons name={(category?.icon as IconName) || 'grid'} size={26} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title">{title || ' '}</Text>
          <Text variant="caption" color="textMuted">
            {venues.data ? t('platform.explore.results', { count: rows.length }) : ' '}
          </Text>
        </View>
      </View>
      <View style={[styles.search, { backgroundColor: colors.surface, borderRadius: radius.lg, borderColor: colors.border }]}>
        <Ionicons name="search" size={19} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('platform.explore.searchPlaceholder')}
          placeholderTextColor={colors.textFaint}
          style={[styles.searchInput, { color: colors.text, fontFamily: theme.fonts.medium, textAlign: theme.arabic ? 'right' : 'left' }]}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.clear')} hitSlop={10} onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={19} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label={t('platform.explore.openNow')} icon="time-outline" tone="success" selected={!!filter.openNow} onPress={() => setFilter((f) => ({ ...f, openNow: !f.openNow }))} />
        <Chip label={t('platform.explore.indoor')} icon="business-outline" selected={filter.indoor === true} onPress={() => setFilter((f) => ({ ...f, indoor: f.indoor === true ? null : true }))} />
        <Chip label={t('platform.explore.outdoor')} icon="sunny-outline" selected={filter.indoor === false} onPress={() => setFilter((f) => ({ ...f, indoor: f.indoor === false ? null : false }))} />
        {(['WOMEN', 'KIDS', 'FAMILY'] as const).map((a) => (
          <Chip key={a} label={t(`platform.audience.${a}`)} tone="neutral" selected={filter.audience === a} onPress={() => setFilter((f) => ({ ...f, audience: f.audience === a ? null : a }))} />
        ))}
      </ScrollView>
    </View>
  );

  const empty =
    venues.isLoading && !venues.data ? (
      <View style={{ gap: spacing.lg }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={250} radius={24} />
        ))}
      </View>
    ) : venues.isError && !venues.data ? (
      <ErrorState message={t('platform.explore.loadError')} onRetry={() => void venues.refetch()} retryLabel={t('common.retry')} />
    ) : (
      <EmptyState
        icon={filtered ? 'search-outline' : 'sparkles-outline'}
        title={filtered ? t('platform.explore.noResults') : t('platform.explore.emptyTitle')}
        body={filtered ? t('platform.explore.noResultsBody') : t('platform.explore.emptyBody')}
        actionLabel={filtered ? t('platform.explore.clear') : undefined}
        onAction={
          filtered
            ? () => {
                setQuery('');
                setFilter({});
              }
            : undefined
        }
      />
    );

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm, paddingHorizontal: sidePad }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={[styles.back, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="arrow-back" size={21} color={colors.text} style={{ transform: [{ scaleX: theme.arabic ? -1 : 1 }] }} />
        </Pressable>
      </View>
      <FlashList
        key={`cols-${columns}`}
        data={rows}
        numColumns={columns}
        keyExtractor={(v) => v.id}
        renderItem={({ item }) => (
          <View style={{ padding: spacing.sm }}>
            <VenueCard
              venue={item}
              category={category}
              now={now}
              onPress={() => {
                haptic('selection');
                router.push(`/venues/${item.id}` as never);
              }}
            />
          </View>
        )}
        ListHeaderComponent={<View style={{ paddingHorizontal: spacing.sm, width: '100%', alignSelf: 'stretch' }}>{header}</View>}
        ListEmptyComponent={<View style={{ paddingHorizontal: spacing.sm, paddingTop: spacing.md }}>{empty}</View>}
        contentContainerStyle={{ paddingHorizontal: sidePad - spacing.sm, paddingBottom: insets.bottom + spacing.huge }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8 },
  back: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 },
  bannerIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 50, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 15.5, height: '100%', outlineStyle: 'none' } as object,
});
