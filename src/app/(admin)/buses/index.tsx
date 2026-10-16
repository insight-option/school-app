import React from 'react';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, EmptyState, ListItem, Screen, SkeletonList, useTheme } from '../../../ui';
import { useBuses } from '../../../features/school';

export default function AdminBuses() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const buses = useBuses();
  return (
    <Screen padded={false} title={t('admin.buses')} right={<Button size="sm" icon="add" title={t('admin.addBus')} onPress={() => router.push('/(admin)/buses/new')} />}>
      {buses.isLoading && !buses.data ? (
        <SkeletonList />
      ) : (
        <FlashList
          data={buses.data ?? []}
          keyExtractor={(b) => b.busId}
          refreshing={buses.isRefetching}
          onRefresh={() => buses.refetch()}
          ListEmptyComponent={<EmptyState icon="bus-outline" title={t('common.emptyList')} actionLabel={t('admin.addBus')} onAction={() => router.push('/(admin)/buses/new')} />}
          renderItem={({ item }) => {
            const over = (item.studentCount ?? 0) > (item.capacity ?? 0);
            return (
              <ListItem
                title={`${item.plate} · ${item.driverName}`}
                subtitle={`${item.busId}${item.driverPhone ? ` · ${item.driverPhone}` : ''}`}
                left={<Avatar name={item.plate} icon="bus" color={theme.colors.primary} />}
                right={<Badge label={t('admin.capacityUsage', { used: item.studentCount ?? 0, capacity: item.capacity ?? 0 })} tone={over ? 'danger' : item.isActive === false ? 'neutral' : 'success'} size="sm" />}
                chevron
                onPress={() => router.push(`/(admin)/buses/${item.busId}` as never)}
              />
            );
          }}
        />
      )}
    </Screen>
  );
}
