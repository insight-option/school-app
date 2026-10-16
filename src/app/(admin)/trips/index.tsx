import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Chip, EmptyState, ListItem, Screen, Select, SkeletonList, useTheme } from '../../../ui';
import { useBuses } from '../../../features/school';
import { useSettings } from '../../../features/settings';
import { useTripHistory, useTripsOnDate } from '../../../features/trips';
import { addDays, formatDate, formatDuration, formatTime, todayIn, toCsv } from '../../../lib/util/format';
import { downloadTextFile } from '../../../lib/util/device';

export default function AdminTrips() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const settings = useSettings();
  const today = todayIn(settings.data?.timezone);
  const [date, setDate] = useState(today);
  const [busId, setBusId] = useState<string | null>(null);
  const buses = useBuses();
  const byDate = useTripsOnDate(date, !busId);
  const byBus = useTripHistory(busId, 60);
  const items = useMemo(() => (busId ? byBus.data ?? [] : byDate.data ?? []).slice().sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? '')), [busId, byBus.data, byDate.data]);
  const loading = busId ? byBus.isLoading : byDate.isLoading;

  const exportCsv = () => {
    const rows = items.map((tr) => ({ date: tr.date, bus: tr.busPlate ?? tr.busId, type: tr.type, status: tr.status, driver: tr.driverName ?? '', startedAt: tr.startedAt ?? '', endedAt: tr.endedAt ?? '', stops: tr.stopCount ?? 0, boarded: tr.boardedCount ?? 0 }));
    void downloadTextFile(`trips-${busId ?? date}.csv`, toCsv(rows, ['date', 'bus', 'type', 'status', 'driver', 'startedAt', 'endedAt', 'stops', 'boarded']));
  };

  return (
    <Screen padded={false} title={t('admin.trips')} right={<Button size="sm" variant="secondary" icon="download-outline" title={t('admin.exportCsv')} onPress={exportCsv} disabled={!items.length} />}>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, gap: theme.spacing.sm }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
          <View style={{ minWidth: 180 }}>
            <Select placeholder={t('admin.bus')} options={(buses.data ?? []).map((b) => ({ value: b.busId, label: b.plate, subtitle: b.driverName }))} value={busId} onChange={(v) => setBusId((v as string) || null)} searchable />
          </View>
          {!busId
            ? [0, 1, 2, 3, 4, 5, 6].map((d) => {
                const day = addDays(today, -d);
                return <Chip key={day} label={d === 0 ? t('common.today') : d === 1 ? t('common.yesterday') : formatDate(day, { weekday: 'short', day: 'numeric' })} selected={date === day} onPress={() => setDate(day)} />;
              })
            : null}
        </ScrollView>
      </View>
      {loading && !items.length ? (
        <SkeletonList avatar={false} />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(tr) => tr.id}
          refreshing={byDate.isRefetching || byBus.isRefetching}
          onRefresh={() => (busId ? byBus.refetch() : byDate.refetch())}
          ListEmptyComponent={<EmptyState icon="map-outline" title={t('trips.noTrips')} compact />}
          renderItem={({ item: tr }) => (
            <ListItem
              title={`${tr.busPlate ?? tr.busId} · ${t(`trips.types.${tr.type}`)}`}
              subtitle={`${formatDate(tr.date)} · ${tr.driverName ?? ''} · ${formatTime(tr.startedAt, settings.data?.timezone)} – ${formatTime(tr.endedAt, settings.data?.timezone)} · ${tr.boardedCount ?? 0}/${tr.stopCount ?? 0}${tr.endedAt && tr.startedAt ? ` · ${formatDuration((Date.parse(tr.endedAt) - Date.parse(tr.startedAt)) / 1000)}` : ''}`}
              icon={tr.type === 'MORNING_PICKUP' ? 'sunny-outline' : 'moon-outline'}
              right={<Badge label={t(`trips.statuses.${tr.status}`)} tone={tr.status === 'ACTIVE' ? 'success' : tr.status === 'CANCELLED' ? 'danger' : 'neutral'} size="sm" />}
              chevron
              onPress={() => router.push(`/(admin)/trips/${tr.id}` as never)}
            />
          )}
        />
      )}
    </Screen>
  );
}
