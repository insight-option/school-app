import React, { useEffect, useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueries } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, EmptyState, ListItem, Screen, SectionHeader, Skeleton, Text, useTheme } from '../../ui';
import { MapView } from '../../components/map/MapView';
import { FeedbackCard } from '../../components/FeedbackCard';
import { useSettings } from '../../features/settings';
import { useBuses, useClasses } from '../../features/school';
import { useProfilesByRole } from '../../features/profiles';
import { useTripsOnDate } from '../../features/trips';
import { useAbsencesOnDate } from '../../features/dayStatus';
import { useAllFeedback } from '../../features/engagement';
import { useInbox, OFFICE_USER_ID } from '../../features/messaging';
import { client, unwrap } from '../../lib/data/client';
import { qk, queryClient } from '../../lib/query/client';
import { todayIn, formatTime } from '../../lib/util/format';
import type { MapMarker } from '../../components/map/types';

export default function AdminDashboard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const settings = useSettings();
  const today = todayIn(settings.data?.timezone);
  const buses = useBuses();
  const classes = useClasses();
  const students = useProfilesByRole('STUDENT');
  const teachers = useProfilesByRole('TEACHER');
  const trips = useTripsOnDate(today);
  const absences = useAbsencesOnDate(today);
  const feedback = useAllFeedback(true);
  const inbox = useInbox(OFFICE_USER_ID);

  // Live positions of every bus (subscribe to each; a school has a handful of buses).
  const busIds = useMemo(() => (buses.data ?? []).map((b) => b.busId), [buses.data]);
  const locations = useQueries({
    queries: busIds.map((busId) => ({ queryKey: qk.busLocation(busId), queryFn: async () => unwrap(await client.models.BusLocation.get({ busId }), 'loc'), staleTime: 4000 })),
  });
  useEffect(() => {
    const subs = busIds.map((busId) =>
      client.models.BusLocation.onUpdate({ filter: { busId: { eq: busId } } }).subscribe({ next: (loc) => queryClient.setQueryData(qk.busLocation(busId), loc), error: () => undefined }),
    );
    return () => subs.forEach((s) => s.unsubscribe());
  }, [busIds]);

  const activeTrips = (trips.data ?? []).filter((tr) => tr.status === 'ACTIVE');
  const markers: MapMarker[] = [];
  locations.forEach((q, i) => {
    const loc = q.data;
    const bus = buses.data?.[i];
    if (loc && bus && (loc.lat || loc.lng) && activeTrips.some((tr) => tr.busId === bus.busId)) {
      markers.push({ id: bus.busId, kind: 'bus', lat: loc.lat, lng: loc.lng, heading: loc.heading, title: bus.plate, color: theme.colors.markerBus });
    }
  });
  if (settings.data?.schoolLocation) markers.push({ id: 'school', kind: 'school', lat: settings.data.schoolLocation.lat, lng: settings.data.schoolLocation.lng, color: theme.colors.markerSchool });

  const studentCount = (classes.data ?? []).reduce((a, c) => a + (c.studentCount ?? 0), 0) || students.data?.pages.flatMap((p) => p.items).length;
  const teacherCount = teachers.data?.pages.flatMap((p) => p.items).length;
  const unreadOffice = (inbox.data ?? []).reduce((a, m) => a + (m.unreadCount ?? 0), 0);
  const latestFeedback = feedback.data?.pages[0]?.items.slice(0, 3) ?? [];
  const twoCol = width >= 900;

  return (
    <Screen title={t('admin.dashboard')} subtitle={settings.data?.name} scroll maxWidth={1200} refreshing={trips.isRefetching} onRefresh={() => trips.refetch()}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md, marginTop: theme.spacing.md }}>
        <StatCard icon="people" label={t('admin.counts.students')} value={studentCount} onPress={() => router.push('/(admin)/students')} loading={students.isLoading && classes.isLoading} />
        <StatCard icon="school" label={t('admin.counts.teachers')} value={teacherCount} onPress={() => router.push('/(admin)/teachers')} loading={teachers.isLoading} />
        <StatCard icon="bus" label={t('admin.counts.buses')} value={buses.data?.length} onPress={() => router.push('/(admin)/buses')} loading={buses.isLoading} />
        <StatCard icon="library" label={t('admin.counts.classes')} value={classes.data?.length} onPress={() => router.push('/(admin)/classes')} loading={classes.isLoading} />
      </View>

      <View style={{ flexDirection: twoCol ? 'row' : 'column', gap: theme.spacing.lg, marginTop: theme.spacing.md }}>
        <View style={{ flex: 1, gap: theme.spacing.md }}>
          <SectionHeader title={t('admin.liveBuses')} />
          <Card padding={0} style={{ overflow: 'hidden', height: 320 }}>
            <MapView markers={markers} initialRegion={settings.data?.schoolLocation ? { ...settings.data.schoolLocation, latitudeDelta: 0.08, longitudeDelta: 0.08 } : undefined} />
          </Card>
          <SectionHeader title={t('admin.todaysTrips')} action={t('common.seeAll')} onAction={() => router.push('/(admin)/trips')} />
          <Card padding={0}>
            {trips.isLoading && !trips.data ? (
              <View style={{ padding: theme.spacing.lg, gap: 8 }}>
                <Skeleton />
                <Skeleton width="60%" />
              </View>
            ) : !trips.data?.length ? (
              <Text color="textMuted" style={{ padding: theme.spacing.lg }}>
                {t('admin.noTripsToday')}
              </Text>
            ) : (
              trips.data.map((tr) => (
                <ListItem
                  key={tr.id}
                  title={`${tr.busPlate ?? tr.busId} · ${t(`trips.types.${tr.type}`)}`}
                  subtitle={`${tr.driverName ?? ''} · ${t('trips.startedAt')} ${formatTime(tr.startedAt, settings.data?.timezone)} · ${tr.boardedCount ?? 0}/${tr.stopCount ?? 0}`}
                  right={<Badge label={t(`trips.statuses.${tr.status}`)} tone={tr.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm" />}
                  chevron
                  onPress={() => router.push(`/(admin)/trips/${tr.id}` as never)}
                />
              ))
            )}
          </Card>
        </View>
        <View style={{ flex: 1, gap: theme.spacing.md }}>
          <SectionHeader title={t('admin.absencesToday')} />
          <Card padding={0}>
            {!absences.data?.length ? (
              <Text color="textMuted" style={{ padding: theme.spacing.lg }}>
                {t('admin.noAbsences')}
              </Text>
            ) : (
              absences.data.slice(0, 8).map((a) => <ListItem key={`${a.studentId}-${a.date}`} title={a.studentName ?? a.studentId} subtitle={[a.note, a.untilDate ? `${t('student.untilDate')} ${a.untilDate}` : null].filter(Boolean).join(' · ') || `${t('profile.bus')} ${a.busId}`} icon="close-circle-outline" onPress={() => router.push(`/(admin)/students/${a.studentId}` as never)} />)
            )}
          </Card>
          <SectionHeader title={t('admin.unreadOffice')} action={t('common.seeAll')} onAction={() => router.push('/(admin)/messages')} />
          <Card onPress={() => router.push('/(admin)/messages')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name="chatbubbles" size={28} color={theme.colors.primary} />
            <Text variant="title">{unreadOffice}</Text>
            <Text color="textMuted">{t('common.unread')}</Text>
          </Card>
          <SectionHeader title={t('admin.latestFeedback')} action={t('common.seeAll')} onAction={() => router.push('/(admin)/feedback')} />
          {latestFeedback.length ? latestFeedback.map((f) => <FeedbackCard key={f.id} item={f} showStudent />) : <EmptyState icon="ribbon-outline" title={t('student.feedbackEmpty')} compact />}
          <Button title={t('admin.addStudent')} icon="person-add" variant="secondary" onPress={() => router.push('/(admin)/students/new')} />
        </View>
      </View>
    </Screen>
  );
}

function StatCard({ icon, label, value, onPress, loading }: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: number; onPress: () => void; loading?: boolean }) {
  const theme = useTheme();
  return (
    <Card onPress={onPress} style={{ flexGrow: 1, flexBasis: 150, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
      </View>
      {loading && value === undefined ? <Skeleton width={60} height={28} /> : <Text variant="display">{value ?? '—'}</Text>}
    </Card>
  );
}
