import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, Chip, EmptyState, Input, ListItem, Screen, SkeletonList, useTheme } from '../../../ui';
import { useSession } from '../../../lib/auth/session';
import { useMyProfile, useProfilesByClass } from '../../../features/profiles';
import { useClassesByTeacher } from '../../../features/school';
import { useSettings } from '../../../features/settings';
import { useAbsencesOnDate } from '../../../features/dayStatus';
import { useBroadcastsForMe } from '../../../features/engagement';
import { todayIn } from '../../../lib/util/format';

export default function TeacherClass() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();
  const me = useMyProfile();
  const settings = useSettings();
  const classes = useClassesByTeacher(session.userId);
  const [classId, setClassId] = useState<string | null>(null);
  const activeClass = classes.data?.find((c) => c.id === classId) ?? classes.data?.[0] ?? null;
  const roster = useProfilesByClass(activeClass?.id);
  const today = todayIn(settings.data?.timezone);
  const absences = useAbsencesOnDate(today, !!activeClass);
  const broadcasts = useBroadcastsForMe(me.data);
  const [query, setQuery] = useState('');
  const absent = useMemo(() => new Set((absences.data ?? []).map((a) => a.studentId)), [absences.data]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (roster.data ?? []).filter((p) => p.role === 'STUDENT' && (!q || p.fullName.toLowerCase().includes(q) || p.username.toLowerCase().includes(q)));
  }, [roster.data, query]);
  const unreadBroadcasts = broadcasts.data?.length ?? 0;

  return (
    <Screen
      padded={false}
      title={t('tabs.myClass')}
      subtitle={activeClass ? `${activeClass.name} · ${t('common.students', { count: activeClass.studentCount ?? list.length })}` : undefined}
      right={
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Button size="sm" variant="ghost" icon="megaphone-outline" title={unreadBroadcasts ? String(unreadBroadcasts) : ''} onPress={() => router.push('/(teacher)/broadcasts')} />
          <Button size="sm" variant="ghost" icon="notifications-outline" title="" onPress={() => router.push('/notifications')} />
        </View>
      }
    >
      {classes.isLoading && !classes.data ? (
        <SkeletonList />
      ) : !classes.data?.length ? (
        <EmptyState icon="school-outline" title={t('teacher.noClass')} />
      ) : (
        <>
          <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, gap: theme.spacing.sm }}>
            {classes.data.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {classes.data.map((c) => (
                  <Chip key={c.id} label={c.name} selected={activeClass?.id === c.id} onPress={() => setClassId(c.id)} />
                ))}
              </ScrollView>
            ) : null}
            <Input placeholder={t('common.search')} value={query} onChangeText={setQuery} leftIcon="search" />
            <View style={{ flexDirection: 'row', gap: 8, paddingBottom: theme.spacing.sm }}>
              <Button size="sm" icon="ribbon-outline" title={t('teacher.sendFeedback')} onPress={() => router.push({ pathname: '/(teacher)/send-feedback', params: { classId: activeClass?.id ?? '' } } as never)} />
              {activeClass ? <Button size="sm" variant="secondary" icon="people-outline" title={t('teacher.classGroup')} onPress={() => router.push(`/chat/class_${activeClass.id}` as never)} /> : null}
            </View>
          </View>
          {roster.isLoading && !roster.data ? (
            <SkeletonList />
          ) : (
            <FlashList
              data={list}
              keyExtractor={(p) => p.userId}
              ListEmptyComponent={<EmptyState icon="people-outline" title={t('common.emptyList')} compact />}
              renderItem={({ item }) => (
                <ListItem
                  title={item.fullName}
                  subtitle={[item.parentPhone, item.busName ? `${t('teacher.bus')} ${item.busName}` : t('teacher.noBus')].filter(Boolean).join(' · ')}
                  left={<Avatar name={item.fullName} avatarKey={item.avatarKey} />}
                  right={<Badge label={absent.has(item.userId) ? t('teacher.absent') : t('teacher.present')} tone={absent.has(item.userId) ? 'danger' : 'success'} size="sm" />}
                  chevron
                  onPress={() => router.push(`/(teacher)/student/${item.userId}` as never)}
                />
              )}
            />
          )}
        </>
      )}
    </Screen>
  );
}
