import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Input, Screen, Select, useTheme } from '../../../ui';
import { PeopleTable } from '../../../components/admin/PeopleTable';
import { flattenPages, useProfilesByClass, useProfilesByBus, useProfilesByRole } from '../../../features/profiles';
import { useBuses, useClasses } from '../../../features/school';

export default function AdminStudents() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [classId, setClassId] = useState<string | null>(null);
  const [busId, setBusId] = useState<string | null>(null);
  const [status, setStatus] = useState<'all' | 'active' | 'disabled'>('all');
  const classes = useClasses();
  const buses = useBuses();
  const byRole = useProfilesByRole('STUDENT', !classId && !busId);
  const byClass = useProfilesByClass(classId);
  const byBus = useProfilesByBus(busId);

  const loading = classId ? byClass.isLoading : busId ? byBus.isLoading : byRole.isLoading;
  const items = useMemo(() => {
    const source = classId ? (byClass.data ?? []) : busId ? (byBus.data ?? []) : flattenPages(byRole.data?.pages);
    const q = query.trim().toLowerCase();
    return source.filter((p) => p.role === 'STUDENT' && (status === 'all' || (status === 'active' ? p.isActive !== false : p.isActive === false)) && (!q || p.fullName.toLowerCase().includes(q) || p.username.toLowerCase().includes(q) || (p.parentEmail ?? '').toLowerCase().includes(q)));
  }, [classId, busId, byClass.data, byBus.data, byRole.data, query, status]);

  const header = (
    <View style={{ paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, gap: theme.spacing.sm }}>
      <Input placeholder={t('admin.search')} value={query} onChangeText={setQuery} leftIcon="search" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
        <View style={{ minWidth: 160 }}>
          <Select placeholder={t('admin.class')} options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.name }))} value={classId} onChange={(v) => { setClassId((v as string) || null); setBusId(null); }} searchable />
        </View>
        <View style={{ minWidth: 160 }}>
          <Select placeholder={t('admin.bus')} options={(buses.data ?? []).map((b) => ({ value: b.busId, label: b.plate, subtitle: b.driverName }))} value={busId} onChange={(v) => { setBusId((v as string) || null); setClassId(null); }} searchable />
        </View>
        <Chip label={t('common.all')} selected={status === 'all'} onPress={() => setStatus('all')} />
        <Chip label={t('common.active')} tone="success" selected={status === 'active'} onPress={() => setStatus('active')} />
        <Chip label={t('common.disabled')} tone="danger" selected={status === 'disabled'} onPress={() => setStatus('disabled')} />
      </ScrollView>
    </View>
  );

  return (
    <Screen
      padded={false}
      title={t('admin.students')}
      right={
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Button size="sm" variant="secondary" icon="cloud-upload-outline" title={t('admin.bulkImport')} onPress={() => router.push('/(admin)/students/import')} />
          <Button size="sm" icon="person-add" title={t('admin.addStudent')} onPress={() => router.push('/(admin)/students/new')} />
        </View>
      }
    >
      <PeopleTable
        items={items}
        loading={loading}
        header={header}
        columns={['class', 'bus', 'parent']}
        emptyTitle={t('admin.noStudents')}
        onPress={(p) => router.push(`/(admin)/students/${p.userId}` as never)}
        onEndReached={() => !classId && !busId && byRole.hasNextPage && !byRole.isFetchingNextPage && byRole.fetchNextPage()}
        refreshing={byRole.isRefetching}
        onRefresh={() => (classId ? byClass.refetch() : busId ? byBus.refetch() : byRole.refetch())}
      />
    </Screen>
  );
}
