import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, KeyValue, Screen, SectionHeader, SkeletonCard, useTheme } from '../../../ui';
import { MapView } from '../../../components/map/MapView';
import type { MapMarker } from '../../../components/map/types';
import { StopTimeline } from '../../../components/StopTimeline';
import { useSettings } from '../../../features/settings';
import { routeMetaOf, useBusLocation, useBusLocationSubscription, useTrip, useTripStops, useTripSubscriptions } from '../../../features/trips';
import { decodePolyline } from '../../../lib/geo';
import { initials } from '../../../ui/theme';
import { formatDate, formatDistance, formatDuration, formatTime, toCsv } from '../../../lib/util/format';
import { downloadTextFile } from '../../../lib/util/device';

export default function AdminTripDetail() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const id = String(tripId);
  const { t } = useTranslation();
  const theme = useTheme();
  const settings = useSettings();
  const trip = useTrip(id);
  const stops = useTripStops(id);
  const active = trip.data?.status === 'ACTIVE';
  useTripSubscriptions(id, active);
  const loc = useBusLocation(trip.data?.busId);
  useBusLocationSubscription(trip.data?.busId, active);
  const meta = routeMetaOf(trip.data);
  const encoded = trip.data?.routePolyline ?? null;
  const polyline = useMemo(() => (encoded ? decodePolyline(encoded) : []), [encoded]);

  const markers: MapMarker[] = (stops.data ?? [])
    .filter((s) => s.location)
    .map((s) => ({
      id: s.id,
      kind: 'student' as const,
      lat: s.location!.lat,
      lng: s.location!.lng,
      initials: initials(s.studentName),
      order: s.order < 900 ? s.order : null,
      color: s.status === 'ABSENT' || s.status === 'SKIPPED' ? theme.colors.markerNotGoing : s.status === 'BOARDED' || s.status === 'DROPPED' ? theme.colors.markerBoarded : s.status === 'ALARMED' || s.status === 'ACKNOWLEDGED' ? theme.colors.markerAlarmed : theme.colors.markerGoing,
      title: s.studentName,
    }));
  if (settings.data?.schoolLocation) markers.push({ id: 'school', kind: 'school', lat: settings.data.schoolLocation.lat, lng: settings.data.schoolLocation.lng, color: theme.colors.markerSchool });
  if (active && loc.data) markers.push({ id: 'bus', kind: 'bus', lat: loc.data.lat, lng: loc.data.lng, heading: loc.data.heading, color: theme.colors.markerBus, zIndex: 999 });

  const exportCsv = () => {
    const rows = (stops.data ?? []).slice().sort((a, b) => a.order - b.order).map((s) => ({ order: s.order < 900 ? s.order : '', student: s.studentName, status: s.status, etaSeconds: s.etaSeconds ?? '', alarmedAt: s.alarmedAt ?? '', alarmCount: s.alarmCount ?? 0, acknowledgedAt: s.acknowledgedAt ?? '', boardedAt: s.boardedAt ?? '', droppedAt: s.droppedAt ?? '', skippedAt: s.skippedAt ?? '', skipReason: s.skipReason ?? '' }));
    void downloadTextFile(`trip-${trip.data?.date}-${trip.data?.busPlate}.csv`, toCsv(rows, ['order', 'student', 'status', 'etaSeconds', 'alarmedAt', 'alarmCount', 'acknowledgedAt', 'boardedAt', 'droppedAt', 'skippedAt', 'skipReason']));
  };

  const tr = trip.data;
  return (
    <Screen back title={tr ? `${tr.busPlate ?? tr.busId} · ${t(`trips.types.${tr.type}`)}` : t('admin.trips')} subtitle={tr ? formatDate(tr.date, { weekday: 'long', day: 'numeric', month: 'long' }) : undefined} scroll maxWidth={960} right={<Button size="sm" variant="secondary" icon="download-outline" title={t('admin.exportCsv')} onPress={exportCsv} disabled={!stops.data?.length} />}>
      {!tr ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <SkeletonCard />
        </View>
      ) : (
        <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.md }}>
          <Card style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Badge label={t(`trips.statuses.${tr.status}`)} tone={tr.status === 'ACTIVE' ? 'success' : 'neutral'} />
              {meta.source ? <Badge label={t(`driver.routeSource.${meta.source}`)} /> : null}
              {meta.manualOrder ? <Badge label={t('driver.manualOrder')} tone="warning" /> : null}
            </View>
            <KeyValue label={t('admin.driverName')} value={tr.driverName} />
            <KeyValue label={t('trips.startedAt')} value={formatTime(tr.startedAt, settings.data?.timezone)} />
            <KeyValue label={t('trips.endedAt')} value={tr.endedAt ? formatTime(tr.endedAt, settings.data?.timezone) : '—'} />
            <KeyValue label={t('trips.stops')} value={`${tr.boardedCount ?? 0} / ${tr.stopCount ?? 0}`} />
            <KeyValue label={t('trips.distance')} value={formatDistance(meta.distanceMeters)} />
            <KeyValue label={t('trips.duration')} value={formatDuration(meta.durationSeconds)} />
          </Card>
          <Card padding={0} style={{ overflow: 'hidden', height: 320 }}>
            <MapView markers={markers} polyline={polyline} polylineColor={theme.colors.primary} />
          </Card>
          <SectionHeader title={t('admin.tripTimeline')} />
          <Card>
            <StopTimeline stops={stops.data ?? []} timeZone={settings.data?.timezone} />
          </Card>
        </View>
      )}
    </Screen>
  );
}
