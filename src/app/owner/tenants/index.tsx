import React, { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import { Badge, Chip, EmptyState, Input, ListItem, Screen, SkeletonList, useTheme } from '../../../ui';
import { useTenants, type TenantRow } from '../../../features/owner';
import { matchesSearch } from '../../../../amplify/functions/shared/tenancy';
import { formatDate } from '../../../lib/util/format';
import { ChipRow, SUB_TONE, TenantLogo } from '../../../components/owner/kit';

type Filter = 'ALL' | 'SCHOOL' | 'BUSINESS' | 'SUSPENDED' | 'TRIAL';

/** Every school and activity business, filterable and searchable. */
export default function OwnerTenants() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const tenants = useTenants();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const all = tenants.rows;

  const counts = useMemo(
    () => ({
      ALL: all.length,
      SCHOOL: all.filter((r) => r.type === 'SCHOOL').length,
      BUSINESS: all.filter((r) => r.type === 'BUSINESS').length,
      SUSPENDED: all.filter((r) => r.status === 'SUSPENDED').length,
      TRIAL: all.filter((r) => r.subscription?.status === 'TRIAL').length,
    }),
    [all],
  );
  const items = useMemo(
    () =>
      all.filter((r) => {
        if (filter === 'SCHOOL' || filter === 'BUSINESS') {
          if (r.type !== filter) return false;
        } else if (filter === 'SUSPENDED') {
          if (r.status !== 'SUSPENDED') return false;
        } else if (filter === 'TRIAL') {
          if (r.subscription?.status !== 'TRIAL') return false;
        }
        return matchesSearch(`${r.name} ${r.city ?? ''} ${r.id}`, query);
      }),
    [all, filter, query],
  );

  const filters: { value: Filter; label: string }[] = [
    { value: 'ALL', label: t('owner.tenants.all') },
    { value: 'SCHOOL', label: t('owner.tenants.schools') },
    { value: 'BUSINESS', label: t('owner.tenants.businesses') },
    { value: 'TRIAL', label: t('owner.tenants.trial') },
    { value: 'SUSPENDED', label: t('owner.tenants.suspended') },
  ];

  const header = (
    <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.sm, gap: theme.spacing.sm }}>
      <Input placeholder={t('owner.tenants.search')} value={query} onChangeText={setQuery} leftIcon="search" autoCorrect={false} />
      <ChipRow>
        {filters.map((f) => (
          <Chip key={f.value} label={f.label} count={counts[f.value]} selected={filter === f.value} onPress={() => setFilter(f.value)} />
        ))}
      </ChipRow>
    </View>
  );

  return (
    <Screen padded={false} title={t('owner.tenants.title')} subtitle={t('owner.tenants.subtitle')} maxWidth={1100}>
      {tenants.isLoading && !all.length ? (
        <>
          {header}
          <SkeletonList rows={7} />
        </>
      ) : (
        <FlashList
          data={items}
          keyExtractor={(r) => `${r.type}:${r.id}`}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <TenantItem
              row={item}
              onPress={() => router.push({ pathname: '/owner/tenants/[tenantId]', params: { tenantId: item.id, type: item.type } } as never)}
            />
          )}
          ListEmptyComponent={
            all.length ? (
              <EmptyState icon="filter-outline" title={t('owner.tenants.emptyFiltered')} compact />
            ) : (
              <EmptyState icon="business-outline" title={t('owner.tenants.empty')} body={t('owner.tenants.emptyBody')} />
            )
          }
          refreshControl={<RefreshControl refreshing={tenants.isRefetching} onRefresh={() => void tenants.refetch()} tintColor={theme.colors.primary} />}
          contentContainerStyle={{ paddingBottom: theme.spacing.xxxl }}
        />
      )}
    </Screen>
  );
}

const TenantItem = React.memo(function TenantItem({ row, onPress }: { row: TenantRow; onPress: () => void }) {
  const { t } = useTranslation();
  const sub = row.subscription;
  const subtitle = [
    t(`owner.tenants.type${row.type}`),
    row.city,
    row.type === 'BUSINESS' && row.venueCount ? t('owner.tenants.venues', { count: row.venueCount }) : null,
    row.createdAt ? t('owner.tenants.joined', { date: formatDate(row.createdAt) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <ListItem
      title={row.name}
      subtitle={subtitle}
      left={<TenantLogo logoKey={row.logoKey} name={row.name} color={row.color} size={46} />}
      right={
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {row.status === 'SUSPENDED' ? (
            <Badge label={t('owner.tenantStatus.SUSPENDED')} tone="danger" size="sm" />
          ) : sub ? (
            <Badge label={sub.planName ? `${sub.planName} · ${t(`owner.subStatus.${sub.status}`)}` : t(`owner.subStatus.${sub.status}`)} tone={SUB_TONE[sub.status] ?? 'neutral'} size="sm" />
          ) : (
            <Badge label={t('owner.tenants.noPlan')} tone="warning" size="sm" />
          )}
        </View>
      }
      chevron
      onPress={onPress}
    />
  );
});
