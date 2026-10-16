import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Input, Screen, useTheme } from '../../../ui';
import { PeopleTable } from '../../../components/admin/PeopleTable';
import { flattenPages, useProfilesByRole } from '../../../features/profiles';

export default function AdminTeachers() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const q = useProfilesByRole('TEACHER');
  const items = useMemo(() => {
    const s = query.trim().toLowerCase();
    return flattenPages(q.data?.pages).filter((p) => !s || p.fullName.toLowerCase().includes(s) || p.username.toLowerCase().includes(s) || (p.email ?? '').toLowerCase().includes(s));
  }, [q.data, query]);
  return (
    <Screen padded={false} title={t('admin.teachers')} right={<Button size="sm" icon="person-add" title={t('admin.addTeacher')} onPress={() => router.push('/(admin)/teachers/new')} />}>
      <PeopleTable
        items={items}
        loading={q.isLoading}
        header={
          <View style={{ paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm }}>
            <Input placeholder={t('admin.search')} value={query} onChangeText={setQuery} leftIcon="search" />
          </View>
        }
        columns={['email', 'phone', 'classes']}
        emptyTitle={t('common.emptyList')}
        onPress={(p) => router.push(`/(admin)/teachers/${p.userId}` as never)}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
        refreshing={q.isRefetching}
        onRefresh={() => q.refetch()}
      />
    </Screen>
  );
}
