import React, { useMemo, useState } from 'react';
import { RefreshControl, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import { Button, Card, Chip, EmptyState, Screen, SkeletonList, useTheme } from '../../ui';
import { usePlatformEvents } from '../../features/owner';
import { EVENT_GROUPS, EventRow } from '../../components/owner/EventRow';
import { ChipRow } from '../../components/owner/kit';

type Filter = 'all' | keyof typeof EVENT_GROUPS;

/** Platform activity feed (sign-ups, venues, bookings, admin actions), newest first. */
export default function OwnerActivity() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const q = usePlatformEvents(40);
  const [filter, setFilter] = useState<Filter>('all');
  const events = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const items = useMemo(() => (filter === 'all' ? events : events.filter((e) => EVENT_GROUPS[filter].includes(e.type))), [events, filter]);
  const filters: Filter[] = ['all', 'signups', 'bookings', 'venues', 'admin'];

  const header = (
    <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm }}>
      <ChipRow>
        {filters.map((f) => (
          <Chip key={f} label={f === 'all' ? t('owner.activity.all') : t(`owner.activity.filters.${f}`)} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </ChipRow>
    </View>
  );

  return (
    <Screen back={width < 900} padded={false} title={t('owner.activity.title')} subtitle={t('owner.activity.subtitle')} maxWidth={900}>
      {q.isLoading && !q.data ? (
        <>
          {header}
          <SkeletonList rows={8} />
        </>
      ) : (
        <FlashList
          data={items}
          keyExtractor={(e) => e.id}
          ListHeaderComponent={header}
          renderItem={({ item, index }) => (
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <Card
                padding={0}
                elevation="flat"
                style={{
                  paddingHorizontal: 16,
                  borderRadius: 0,
                  borderTopWidth: 0,
                  borderBottomWidth: 0,
                  ...(index === 0 ? { borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, borderTopWidth: 1 } : null),
                  ...(index === items.length - 1 ? { borderBottomLeftRadius: theme.radius.xl, borderBottomRightRadius: theme.radius.xl, borderBottomWidth: 1 } : null),
                }}
              >
                <EventRow event={item} last={index === items.length - 1} />
              </Card>
            </View>
          )}
          ListEmptyComponent={<EmptyState icon="pulse-outline" title={t('owner.activity.empty')} compact />}
          onEndReached={() => {
            if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            q.hasNextPage ? (
              <View style={{ padding: theme.spacing.lg }}>
                <Button title={t('owner.activity.loadMore')} variant="outline" onPress={() => void q.fetchNextPage()} loading={q.isFetchingNextPage} fullWidth />
              </View>
            ) : null
          }
          refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => void q.refetch()} tintColor={theme.colors.primary} />}
          contentContainerStyle={{ paddingBottom: theme.spacing.xxxl }}
        />
      )}
    </Screen>
  );
}
