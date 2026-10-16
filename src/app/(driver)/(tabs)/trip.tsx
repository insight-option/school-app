import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Button, Chip, ConfirmSheet, Text, useTheme, type BadgeTone } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { MapView } from '../../../components/map/MapView';
import type { MapHandle, MapMarker } from '../../../components/map/types';
import { ReorderableStops, STOP_ROW_HEIGHT } from '../../../components/driver/ReorderableStops';
import { StopSheet } from '../../../components/driver/StopSheet';
import { useMyProfile, useProfilesByBus } from '../../../features/profiles';
import { useSettings } from '../../../features/settings';
import { routeMetaOf, useActiveTrip, useComputeRoute, useEndTrip, useNotifyBusNear, useReorderStops, useStartTrip, useTripStops, useTripSubscriptions } from '../../../features/trips';
import { useBusDayStatusSubscription, useBusDayStatuses } from '../../../features/dayStatus';
import { useDriverLocation } from '../../../lib/location/useDriverLocation';
import { ensureLocationPermissions, startBusLocationUpdates, stopBusLocationUpdates } from '../../../lib/location/busLocationTask';
import { decodePolyline, distanceToPolylineMeters, haversineMeters } from '../../../lib/geo';
import { initials } from '../../../ui/theme';
import { todayIn } from '../../../lib/util/format';
import type { TripStop, TripType } from '../../../lib/data/client';
import { haptic } from '../../../lib/util/device';

const ROUTED = new Set(['PENDING', 'ALARMED', 'ACKNOWLEDGED']);
const NEAR_METERS = 400;
const NEAR_SECONDS = 120;
const BOARD_SUGGEST_METERS = 60;
const OFF_ROUTE_METERS = 300;
const OFF_ROUTE_MS = 60_000;
const TRAFFIC_REFRESH_MS = 5 * 60_000;

export default function DriverTripScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const wide = width >= 900;
  const me = useMyProfile();
  const settings = useSettings();
  const busId = me.data?.busId ?? null;
  const today = todayIn(settings.data?.timezone);
  const trips = useActiveTrip(busId, today);
  const trip = trips.active;
  const stops = useTripStops(trip?.id);
  const students = useProfilesByBus(busId);
  const dayStatuses = useBusDayStatuses(busId, today);
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useTripSubscriptions(trip?.id, focused);
  useBusDayStatusSubscription(busId, today, focused);

  const startTrip = useStartTrip();
  const endTrip = useEndTrip();
  const compute = useComputeRoute();
  const reorder = useReorderStops();
  const notifyNear = useNotifyBusNear();
  const [tripType, setTripType] = useState<TripType>(() => (new Date().getHours() < 12 ? 'MORNING_PICKUP' : 'AFTERNOON_DROPOFF'));
  const [follow, setFollow] = useState(true);
  const [traffic, setTraffic] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);
  const mapRef = useRef<MapHandle>(null);

  const { sample, quality, permission } = useDriverLocation(true);
  const busPos = sample ? { lat: sample.lat, lng: sample.lng, heading: sample.heading } : null;

  // ── Follow mode ──
  useEffect(() => {
    if (follow && busPos) mapRef.current?.animateTo(busPos, 16);
  }, [busPos?.lat, busPos?.lng, follow]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Background publishing lifecycle ──
  useEffect(() => {
    if (!busId) return;
    if (trip) {
      void ensureLocationPermissions(true).then((res) => {
        if (res === 'denied') toast.error(t('driver.locationPermissionBody'));
        return startBusLocationUpdates({ busId, tripId: trip.id }, { title: t('driver.foregroundServiceTitle'), body: t('driver.foregroundServiceBody') }).catch((e) => toast.error(String(e)));
      });
    } else {
      void stopBusLocationUpdates();
    }
  }, [trip?.id, busId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Periodic traffic refresh (5 min) ──
  useEffect(() => {
    if (!trip) return;
    const id = setInterval(() => compute.mutate({ tripId: trip.id }), TRAFFIC_REFRESH_MS);
    return () => clearInterval(id);
  }, [trip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const encoded = trip?.routePolyline ?? null;
  const polyline = useMemo(() => (encoded ? decodePolyline(encoded) : []), [encoded]);
  const meta = routeMetaOf(trip);

  // ── Off-route detection (>300 m for >60 s) ──
  const offRouteSince = useRef<number | null>(null);
  useEffect(() => {
    if (!trip || !busPos || polyline.length < 2) return;
    const d = distanceToPolylineMeters(busPos, polyline);
    if (d > OFF_ROUTE_METERS) {
      offRouteSince.current ??= Date.now();
      if (Date.now() - offRouteSince.current > OFF_ROUTE_MS) {
        offRouteSince.current = Date.now();
        compute.mutate({ tripId: trip.id });
        toast.info(t('driver.offRoute'));
      }
    } else offRouteSince.current = null;
  }, [busPos?.lat, busPos?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const orderedStops = useMemo(() => (stops.data ?? []).slice().sort((a, b) => a.order - b.order), [stops.data]);
  const routedStops = useMemo(() => orderedStops.filter((s) => ROUTED.has(s.status) && s.order < 900), [orderedStops]);
  // Selected stop is derived from the live list so subscription updates flow into the sheet.
  const selected: TripStop | null = selectedId ? (orderedStops.find((s) => s.id === selectedId) ?? null) : null;
  const setSelected = (s: TripStop | null) => setSelectedId(s?.id ?? null);
  const nextStop = routedStops[0] ?? null;
  const nextDistance = nextStop?.location && busPos ? haversineMeters(busPos, nextStop.location) : null;
  const nearby = nextDistance !== null && nextDistance <= BOARD_SUGGEST_METERS;

  // ── Proximity automation: "Bus is near" push once per stop ──
  const notified = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!trip || !nextStop || notified.current.has(nextStop.id) || nextStop.nearNotifiedAt) return;
    const near = (nextDistance !== null && nextDistance <= NEAR_METERS) || (nextStop.etaSeconds !== null && nextStop.etaSeconds !== undefined && nextStop.etaSeconds <= NEAR_SECONDS && nextDistance !== null && nextDistance < 1500);
    if (!near) return;
    notified.current.add(nextStop.id);
    notifyNear.mutate(nextStop.id, { onSuccess: (r) => r?.ok && toast.info(t('driver.busNearSent', { name: nextStop.studentName })) });
  }, [nextStop?.id, nextDistance]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Markers ──
  const notGoingToday = useMemo(() => new Set((dayStatuses.data ?? []).filter((d) => d.status === 'NOT_GOING').map((d) => d.studentId)), [dayStatuses.data]);
  const stopByStudent = useMemo(() => new Map(orderedStops.map((s) => [s.studentId, s])), [orderedStops]);
  const markers: MapMarker[] = [];
  for (const s of students.data ?? []) {
    if (!s.homeLocation) continue;
    const stop = stopByStudent.get(s.userId);
    let color = theme.colors.markerGoing;
    if (stop) {
      if (stop.status === 'ABSENT') color = theme.colors.markerNotGoing;
      else if (stop.status === 'BOARDED' || stop.status === 'DROPPED' || stop.status === 'SKIPPED') color = theme.colors.markerBoarded;
      else if (stop.status === 'ALARMED' || stop.status === 'ACKNOWLEDGED') color = theme.colors.markerAlarmed;
    } else if (notGoingToday.has(s.userId)) color = theme.colors.markerNotGoing;
    markers.push({
      id: s.userId,
      kind: 'student',
      lat: s.homeLocation.lat,
      lng: s.homeLocation.lng,
      initials: initials(s.fullName),
      color,
      order: stop && stop.order < 900 && ROUTED.has(stop.status) ? stop.order : null,
      selected: selected?.studentId === s.userId,
      title: s.fullName,
      onPress: () => {
        if (stop) setSelected(stop);
        else toast.info(s.fullName);
      },
    });
  }
  if (settings.data?.schoolLocation) markers.push({ id: 'school', kind: 'school', lat: settings.data.schoolLocation.lat, lng: settings.data.schoolLocation.lng, title: t('driver.school'), color: theme.colors.markerSchool });
  if (busPos) markers.push({ id: 'bus', kind: 'bus', lat: busPos.lat, lng: busPos.lng, heading: busPos.heading, color: theme.colors.markerBus, zIndex: 999 });

  const counts = useMemo(() => {
    const all = orderedStops.length ? orderedStops : null;
    if (all) {
      const going = all.filter((s) => ROUTED.has(s.status)).length;
      const notGoing = all.filter((s) => s.status === 'ABSENT').length;
      const boarded = all.filter((s) => s.status === 'BOARDED' || s.status === 'DROPPED').length;
      return { going, notGoing, boarded };
    }
    const total = (students.data ?? []).length;
    const ng = (students.data ?? []).filter((s) => notGoingToday.has(s.userId)).length;
    return { going: total - ng, notGoing: ng, boarded: 0 };
  }, [orderedStops, students.data, notGoingToday]);

  const onStart = () => {
    if (!busId) return;
    haptic('medium');
    startTrip.mutate({ busId, type: tripType }, { onError: (e) => toast.error(e.message) });
  };
  const onEnd = () => {
    if (!trip) return;
    endTrip.mutate(trip.id, {
      onSuccess: () => {
        setConfirmEnd(false);
        toast.success(t('driver.tripEnded'));
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const fitAll = () => {
    setFollow(false);
    const pts = markers.map((m) => ({ lat: m.lat, lng: m.lng }));
    if (pts.length) mapRef.current?.fitTo(pts, 70);
  };

  const gpsTone: BadgeTone = quality === 'good' ? 'success' : quality === 'fair' ? 'warning' : 'danger';
  const panelHeight = Math.min(height * 0.45, STOP_ROW_HEIGHT * Math.max(2, routedStops.length) + 56);

  const stopsPanel = (
    <View style={[styles.panel, wide ? { width: 380, borderLeftWidth: 1 } : { height: sheetOpen ? panelHeight : 56, borderTopWidth: 1 }, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Pressable accessibilityRole="button" onPress={() => !wide && setSheetOpen((v) => !v)} style={styles.panelHeader}>
        <View style={{ flex: 1 }}>
          <Text variant="subheading">{t('driver.nextStops')}</Text>
          <Text variant="caption" color="textMuted">
            {meta.manualOrder ? t('driver.manualOrder') : t('driver.optimizedOrder')}
            {meta.source ? ` · ${t(`driver.routeSource.${meta.source}`)}` : ''}
          </Text>
        </View>
        {!wide ? <Ionicons name={sheetOpen ? 'chevron-down' : 'chevron-up'} size={22} color={theme.colors.textMuted} /> : null}
      </Pressable>
      {(wide || sheetOpen) && (
        <ScrollView style={{ flex: 1 }}>
          {routedStops.length === 0 ? (
            <Text color="textMuted" style={{ padding: 16 }}>
              {trip ? t('driver.noStops') : t('driver.noActiveTripBody')}
            </Text>
          ) : (
            <>
              <Text variant="caption" color="textFaint" style={{ paddingHorizontal: 12, paddingTop: 6 }}>
                {t('driver.dragHint')}
              </Text>
              <ReorderableStops
                stops={routedStops}
                selectedId={selected?.id}
                onSelect={(s) => {
                  setSelected(s);
                  if (s.location) {
                    setFollow(false);
                    mapRef.current?.animateTo(s.location, 16);
                  }
                }}
                onReorder={(ids) => trip && reorder.mutate({ tripId: trip.id, stopIds: ids }, { onError: (e) => toast.error(e.message) })}
                disabled={!trip || reorder.isPending}
              />
            </>
          )}
        </ScrollView>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]} edges={['top', 'left', 'right']}>
      {/* Top bar */}
      <View style={[styles.topBar, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center', paddingHorizontal: 12 }}>
          {!trip ? (
            <>
              <Chip label={t('driver.morning')} icon="sunny" selected={tripType === 'MORNING_PICKUP'} onPress={() => setTripType('MORNING_PICKUP')} />
              <Chip label={t('driver.afternoon')} icon="moon" selected={tripType === 'AFTERNOON_DROPOFF'} onPress={() => setTripType('AFTERNOON_DROPOFF')} />
              <Button title={startTrip.isPending ? t('driver.starting') : t('driver.startTrip')} icon="play" variant="success" onPress={onStart} loading={startTrip.isPending} disabled={!busId || !students.data?.length} />
            </>
          ) : (
            <>
              <Badge label={t(`trips.types.${trip.type}`)} tone="primary" />
              <Button title={t('driver.endTrip')} icon="stop" variant="danger" size="sm" onPress={() => setConfirmEnd(true)} />
              <Button title={t('driver.recompute')} icon="refresh" variant="outline" size="sm" onPress={() => compute.mutate({ tripId: trip.id }, { onSuccess: () => toast.success(t('student.recompute')) })} loading={compute.isPending} />
            </>
          )}
          <Chip label={t('driver.traffic')} icon="car" selected={traffic} onPress={() => setTraffic((v) => !v)} tone="neutral" />
          <Badge label={`${t('driver.gps')}: ${t(`driver.gps${quality === 'good' ? 'Good' : quality === 'fair' ? 'Fair' : quality === 'poor' ? 'Poor' : 'Off'}`)}`} tone={gpsTone} />
        </ScrollView>
        <Text variant="captionStrong" color="textMuted" style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
          {t('driver.summary', counts)}
        </Text>
      </View>

      <View style={[styles.fill, wide && { flexDirection: 'row' }]}>
        <View style={styles.fill}>
          <MapView
            ref={mapRef}
            markers={markers}
            polyline={polyline}
            polylineColor={theme.colors.primary}
            showsTraffic={traffic}
            showsUserLocation={false}
            onUserGesture={() => setFollow(false)}
            initialRegion={busPos ? { lat: busPos.lat, lng: busPos.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 } : settings.data?.schoolLocation ? { ...settings.data.schoolLocation, latitudeDelta: 0.05, longitudeDelta: 0.05 } : undefined}
            padding={{ bottom: wide ? 0 : 20 }}
          />
          <View style={styles.mapControls}>
            <Button size="sm" variant={follow ? 'primary' : 'secondary'} icon="navigate" title={t('driver.follow')} onPress={() => setFollow((v) => !v)} />
            <Button size="sm" variant="secondary" icon="scan" title={t('driver.recenter')} onPress={fitAll} style={{ backgroundColor: theme.colors.surface }} />
          </View>
          {permission === 'denied' ? (
            <View style={[styles.banner, { backgroundColor: theme.colors.danger }]}>
              <Text style={{ color: '#fff' }} variant="captionStrong">
                {t('driver.locationPermissionBody')}
              </Text>
            </View>
          ) : null}
          {!trip && !startTrip.isPending ? (
            <View style={[styles.emptyOverlay, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <Ionicons name="bus-outline" size={28} color={theme.colors.primary} />
              <Text variant="bodyStrong">{t('driver.noActiveTrip')}</Text>
              <Text variant="caption" color="textMuted" align="center">
                {students.data?.length ? t('driver.noActiveTripBody') : t('driver.noStudents')}
              </Text>
            </View>
          ) : null}
        </View>
        {stopsPanel}
      </View>

      <StopSheet stop={selected} tripId={trip?.id ?? null} tripType={trip?.type ?? null} nearby={nearby && selected?.id === nextStop?.id} onClose={() => setSelected(null)} />
      <ConfirmSheet visible={confirmEnd} title={t('driver.endTrip')} body={t('driver.endTripConfirm')} confirmLabel={t('driver.endTrip')} cancelLabel={t('common.cancel')} destructive loading={endTrip.isPending} onCancel={() => setConfirmEnd(false)} onConfirm={onEnd} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { paddingTop: 8, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  mapControls: { position: 'absolute', top: 12, right: 12, gap: 8 },
  banner: { position: 'absolute', left: 12, right: 12, top: 12, padding: 10, borderRadius: 10 },
  emptyOverlay: { position: 'absolute', left: 16, right: 16, bottom: 16, padding: 16, borderRadius: 16, borderWidth: 1, alignItems: 'center', gap: 6 },
  panel: { overflow: 'hidden' },
  panelHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 56, gap: 8 },
});
