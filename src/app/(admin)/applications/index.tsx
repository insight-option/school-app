import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import { Badge, Button, Chip, EmptyState, Input, ListItem, Screen, SkeletonList, useTheme } from '../../../ui';
import { Avatar } from '../../../ui/Avatar';
import { APPLICATION_STATUSES, STATUS_TONE, useApplications } from '../../../features/admissions';
import { matchesSearch } from '../../../../amplify/functions/shared/tenancy';
import { formatDate } from '../../../lib/util/format';
import type { Application, ApplicationStatus } from '../../../lib/data/client';

/** Office: online applications – newest first, filter by status, instant search. */
export default function AdminApplications() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const q = useApplications();
  const [status, setStatus] = useState<ApplicationStatus | null>(null);
  const [query, setQuery] = useState('');
  const all = useMemo(() => q.data ?? [], [q.data]);
  const counts = useMemo(() => {
    const c: Partial<Record<ApplicationStatus, number>> = {};
    for (const a of all) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [all]);
  const items = useMemo(
    () => all.filter((a) => (!status || a.status === status) && matchesSearch(`${a.studentName} ${a.parentName} ${a.parentEmail} ${a.reference} ${a.gradeApplying ?? ''}`, query)),
    [all, status, query],
  );

  const header = (
    <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, gap: theme.spacing.sm }}>
      <Input placeholder={t('admin.search')} value={query} onChangeText={setQuery} leftIcon="search" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={t('admissions.all')} count={all.length} selected={!status} onPress={() => setStatus(null)} />
        {APPLICATION_STATUSES.map((s) => (
          <Chip key={s} label={t(`appStatus.statuses.${s}`)} count={counts[s] ?? 0} selected={status === s} onPress={() => setStatus(status === s ? null : s)} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <Screen padded={false} title={t('admissions.title')} subtitle={t('admissions.subtitle')}>
      {q.isLoading && !q.data ? (
        <>
          {header}
          <SkeletonList rows={6} />
        </>
      ) : (
        <FlashList
          data={items}
          keyExtractor={(a) => a.id}
          ListHeaderComponent={header}
          renderItem={({ item }) => <Row item={item} onPress={() => router.push(`/(admin)/applications/${item.id}` as never)} />}
          ListEmptyComponent={
            <View style={{ padding: theme.spacing.xl }}>
              {all.length ? (
                <EmptyState icon="filter-outline" title={t('admissions.emptyFiltered')} />
              ) : (
                <EmptyState icon="clipboard-outline" title={t('admissions.empty')} body={t('admissions.emptyBody')} />
              )}
              {!all.length ? <Button title={t('admissions.openProfile')} variant="secondary" icon="storefront-outline" onPress={() => router.push('/(admin)/school-profile' as never)} style={{ alignSelf: 'center' }} /> : null}
            </View>
          }
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={theme.colors.primary} />}
          contentContainerStyle={{ paddingBottom: theme.spacing.xxxl }}
        />
      )}
    </Screen>
  );
}

const Row = React.memo(function Row({ item, onPress }: { item: Application; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <ListItem
      title={item.studentName}
      subtitle={[item.gradeApplying, item.parentName, t('admissions.submittedOn', { date: formatDate(item.submittedAt) })].filter(Boolean).join(' · ')}
      left={<Avatar name={item.studentName} size={42} />}
      right={<Badge label={t(`appStatus.statuses.${item.status}`)} tone={STATUS_TONE[item.status]} size="sm" />}
      chevron
      onPress={onPress}
    />
  );
});

const styles = StyleSheet.create({ chips: { gap: 8, paddingVertical: 4 } });
