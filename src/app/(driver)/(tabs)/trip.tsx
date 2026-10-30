import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Button, Chip, ConfirmSheet, Text, useTheme, type BadgeTone } from '../../../ui';
import { initials, shade } from '../../../ui/theme';
import { toast } from '../../../ui/Toast';
import { MapView } from '../../../components/map/MapView';
import type { MapHandle, MapMarker, MapType, RouteOverlay } from '../../../components/map/types';
import { ReorderableStops, STOP_ROW_HEIGHT } from '../../../components/driver/ReorderableStops';
import { StopSheet } from '../../../components/driver/StopSheet';
import { useMyProfile, useProfilesByBus } from '../../../features/profiles';
import { useSettings } from '../../../features/settings';
import { routeMetaOf, useActiveTrip, useComputeRoute, useEndTrip, useNotifyBusNear, useReorderStops, useStartTrip, useTripStops, useTripSubscriptions } from '../../../features/trips';
import { useBusDayStatusSubscription, useBusDayStatuses } from '../../../features/dayStatus';
import { useDriverLocation } from '../../../lib/location/useDriverLocation';
import { ensureLocationPermissions, getCurrentFix, setDriverBusId, startBusLocationUpdates, stopBusLocationUpdates } from '../../../lib/location/busLocationTask';
import { decodePolyline, distanceToPolylineMeters, haversineMeters, pathLengthMeters, remainingPathFrom, trafficAhead } from '../../../lib/geo';
import { formatDistance, formatEta, formatTime, todayIn } from '../../../lib/util/format';
import { callPhone, haptic } from '../../../lib/util/device';
import type { TripStop, TripType } from '../../../lib/data/client';

const ROUTED = new Set(['PENDING', 'ALARMED', 'ACKNOWLEDGED']);
const NEAR_METERS = 400;
const NEAR_SECONDS = 120;
const BOARD_SUGGEST_METERS = 60;
const OFF_ROUTE_METERS = 300;
const OFF_ROUTE_MS = 60_000;
const TRAFFIC_REFRESH_MS = 5 * 60_000;
const SLOW_COLOR = '#F59E0B';
const JAM_COLOR = '#DC2626';
const MAP_TYPES: MapType[] = ['standard', 'satellite', 'hybrid'];

export default function DriverTripScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors, radius } = theme;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
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
  const [traffic, setTraffic] = useState(true);
  const [mapType, setMapType] = useState<MapType>('standard');
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);
  const mapRef = useRef<MapHandle>(null);

  // ── Live location: tracked from the moment the driver opens the app, not only during trips ──
  const { sample, quality, permission } = useDriverLocation(true);
  const busPos = sample ? { lat: sample.lat, lng: sample.lng, heading: sample.heading } : null;
  const [locating, setLocating] = useState(false);
  const busPosRef = useRef(busPos);
  useEffect(() => {
    busPosRef.current = busPos;
  });
  // Keep the last good heading so the camera and arrow do not spin back to north when the bus stops.
  const goodHeading = sample?.heading != null && sample.heading >= 0 && (sample.speed ?? 0) > 1 ? sample.heading : null;
  const [lastHeading, setLastHeading] = useState<number | null>(null);
  if (goodHeading !== null && goodHeading !== lastHeading) setLastHeading(goodHeading);
  const heading = goodHeading ?? lastHeading;
  // Coarse clock for ETAs and arrival times (render must stay pure).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setDriverBusId(busId, me.data?.schoolId);
  }, [busId, me.data?.schoolId]);

  // ── Full screen: hide the tab bar and status bar ──
  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: fullscreen ? { display: 'none' } : { backgroundColor: colors.tabBar, borderTopColor: colors.border, borderRightColor: colors.border },
    } as never);
  }, [fullscreen, navigation, colors.tabBar, colors.border]);
  useEffect(() => () => navigation.setOptions({ tabBarStyle: undefined } as never), [navigation]);

  // ── Camera: navigation view (heading-up, tilted) during a trip, plain follow otherwise ──
  useEffect(() => {
    if (!follow || !busPos) return;
    if (trip) mapRef.current?.follow(busPos, { heading, zoom: 17, pitch: 50 });
    else mapRef.current?.animateTo(busPos, 15);
  }, [busPos?.lat, busPos?.lng, follow, trip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Background publishing lifecycle ──
  useEffect(() => {
    if (!busId) return;
    if (trip) {
      void ensureLocationPermissions(true)
        .then((res) => {
          if (res === 'denied') toast.error(t('driver.locationPermissionBody'));
          return startBusLocationUpdates({ busId, tripId: trip.id }, { title: t('driver.foregroundServiceTitle'), body: t('driver.foregroundServiceBody') }).catch((e) => toast.error(String(e)));
        })
        .catch((e) => console.warn('location setup failed', e));
    } else {
      void stopBusLocationUpdates();
    }
  }, [trip?.id, busId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Periodic traffic refresh (5 min) from the live position ──
  useEffect(() => {
    if (!trip) return;
    const id = setInterval(() => compute.mutate({ tripId: trip.id, lat: busPosRef.current?.lat, lng: busPosRef.current?.lng }), TRAFFIC_REFRESH_MS);
    return () => clearInterval(id);
  }, [trip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const encoded = trip?.routePolyline ?? null;
  const polyline = useMemo(() => (encoded ? decodePolyline(encoded) : []), [encoded]);
  const meta = routeMetaOf(trip);
  // Only the route still ahead of the bus is drawn; live traffic is coloured on top of it.
  const aheadInfo = useMemo(() => (busPos && polyline.length > 1 ? remainingPathFrom(busPos, polyline) : { points: polyline, startIndex: -1 }), [busPos?.lat, busPos?.lng, polyline]); // eslint-disable-line react-hooks/exhaustive-deps
  const ahead = aheadInfo.points;
  const remainingMeters = useMemo(() => pathLengthMeters(ahead), [ahead]);
  const totalMeters = useMemo(() => pathLengthMeters(polyline), [polyline]);
  const trafficSegments: RouteOverlay[] = useMemo(
    () =>
      traffic
        ? trafficAhead(polyline, meta.traffic, aheadInfo.startIndex, busPos ? { lat: busPos.lat, lng: busPos.lng } : null).map((s) => ({ points: s.points, color: s.level === 2 ? JAM_COLOR : SLOW_COLOR }))
        : [],
    [traffic, polyline, meta.traffic, aheadInfo.startIndex, busPos?.lat, busPos?.lng], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const remainingSeconds = meta.durationSeconds && totalMeters > 0 ? Math.round(meta.durationSeconds * (remainingMeters / totalMeters)) : null;

  // ── Off-route detection (>300 m for >60 s) → recompute from where the bus is ──
  const offRouteSince = useRef<number | null>(null);
  useEffect(() => {
    if (!trip || !busPos || polyline.length < 2) return;
    const d = distanceToPolylineMeters(busPos, polyline);
    if (d > OFF_ROUTE_METERS) {
      offRouteSince.current ??= Date.now();
      if (Date.now() - offRouteSince.current > OFF_ROUTE_MS) {
        offRouteSince.current = Date.now();
        compute.mutate({ tripId: trip.id, lat: busPos.lat, lng: busPos.lng });
        toast.info(t('driver.offRoute'));
      }
    } else offRouteSince.current = null;
  }, [busPos?.lat, busPos?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const orderedStops = useMemo(() => (stops.data ?? []).slice().sort((a, b) => a.order - b.order), [stops.data]);
  const routedStops = useMemo(() => orderedStops.filter((s) => ROUTED.has(s.status) && s.order < 900), [orderedStops]);
  const selected: TripStop | null = selectedId ? (orderedStops.find((s) => s.id === selectedId) ?? null) : null;
  const setSelected = (s: TripStop | null) => setSelectedId(s?.id ?? null);
  const nextStop = routedStops[0] ?? null;
  const nextDistance = nextStop?.location && busPos ? haversineMeters(busPos, nextStop.location) : null;
  const nearby = nextDistance !== null && nextDistance <= BOARD_SUGGEST_METERS;
  const elapsedSinceRoute = meta.computedAt ? Math.max(0, (now - Date.parse(meta.computedAt)) / 1000) : 0;
  const nextEta = nextStop?.etaSeconds != null ? Math.max(0, nextStop.etaSeconds - elapsedSinceRoute) : null;

  // ── Fit the whole route once when a new trip's route arrives ──
  const fittedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!trip || polyline.length < 2 || fittedFor.current === trip.id) return;
    fittedFor.current = trip.id;
    setFollow(false);
    mapRef.current?.fitTo(polyline, 80);
    const id = setTimeout(() => setFollow(true), 4000);
    return () => clearTimeout(id);
  }, [trip?.id, polyline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Proximity automation: "Bus is near" push once per stop ──
  const notified = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!trip || !nextStop || notified.current.has(nextStop.id) || nextStop.nearNotifiedAt) return;
    const near = (nextDistance !== null && nextDistance <= NEAR_METERS) || (nextEta !== null && nextEta <= NEAR_SECONDS && nextDistance !== null && nextDistance < 1500);
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
    let color = colors.markerGoing;
    if (stop) {
      if (stop.status === 'ABSENT') color = colors.markerNotGoing;
      else if (stop.status === 'BOARDED' || stop.status === 'DROPPED' || stop.status === 'SKIPPED') color = colors.markerBoarded;
      else if (stop.status === 'ALARMED' || stop.status === 'ACKNOWLEDGED') color = colors.markerAlarmed;
    } else if (notGoingToday.has(s.userId)) color = colors.markerNotGoing;
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
  const school = settings.data?.schoolLocation ?? null;
  if (school) markers.push({ id: 'school', kind: 'school', lat: school.lat, lng: school.lng, title: t('driver.school'), color: colors.markerSchool });
  if (busPos) markers.push({ id: 'bus', kind: 'bus', lat: busPos.lat, lng: busPos.lng, heading, color: colors.markerBus, zIndex: 999 });

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

  const onStart = async () => {
    if (!busId || locating) return;
    haptic('medium');
    // The route starts exactly where the driver is now: use the live fix, or fetch a fresh one.
    setLocating(true);
    const here = busPos ?? (await getCurrentFix());
    setLocating(false);
    startTrip.mutate({ busId, type: tripType, lat: here?.lat, lng: here?.lng }, { onError: (e) => toast.error(e.message) });
  };
  const onEnd = () => {
    if (!trip) return;
    endTrip.mutate(trip.id, {
      onSuccess: () => {
        setConfirmEnd(false);
        setFullscreen(false);
        toast.success(t('driver.tripEnded'));
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const fitAll = () => {
    setFollow(false);
    const pts = [...(polyline.length > 1 ? polyline : markers.map((m) => ({ lat: m.lat, lng: m.lng })))];
    if (busPos) pts.push(busPos);
    if (pts.length) mapRef.current?.fitTo(pts, 80);
  };
  const toggleFollow = () => {
    haptic('selection');
    setFollow((v) => !v);
  };

  const gpsTone: BadgeTone = quality === 'good' ? 'success' : quality === 'fair' ? 'warning' : 'danger';
  const panelHeight = Math.min(height * 0.42, STOP_ROW_HEIGHT * Math.max(2, routedStops.length) + 56);
  const totalStops = counts.going + counts.boarded;
  const arriveAt = remainingSeconds != null ? formatTime(new Date(now + remainingSeconds * 1000).toISOString(), settings.data?.timezone) : null;
  const showMeta = !!trip && remainingMeters > 0;

  const stopsPanel = (
    <View style={[styles.panel, wide ? { width: 380, borderLeftWidth: 1 } : { height: sheetOpen ? panelHeight : 56, borderTopWidth: 1 }, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable accessibilityRole="button" onPress={() => !wide && setSheetOpen((v) => !v)} style={styles.panelHeader}>
        <View style={{ flex: 1 }}>
          <Text variant="subheading">{t('driver.nextStops')}</Text>
          <Text variant="caption" color="textMuted">
            {meta.manualOrder ? t('driver.manualOrder') : t('driver.optimizedOrder')}
            {meta.source ? ` · ${t(`driver.routeSource.${meta.source}`)}` : ''}
          </Text>
        </View>
        {!wide ? <Ionicons name={sheetOpen ? 'chevron-down' : 'chevron-up'} size={22} color={colors.textMuted} /> : null}
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

  const topInset = fullscreen ? insets.top + 8 : 12;

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={fullscreen ? [] : ['top', 'left', 'right']}>
      <StatusBar hidden={fullscreen} animated />
      {!fullscreen ? (
        <View style={[styles.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center', paddingHorizontal: 12 }}>
            {!trip ? (
              <>
                <Chip label={t('driver.morning')} icon="sunny" selected={tripType === 'MORNING_PICKUP'} onPress={() => setTripType('MORNING_PICKUP')} />
                <Chip label={t('driver.afternoon')} icon="moon" selected={tripType === 'AFTERNOON_DROPOFF'} onPress={() => setTripType('AFTERNOON_DROPOFF')} />
                <Button title={startTrip.isPending || locating ? t('driver.starting') : t('driver.startTrip')} icon="play" variant="success" onPress={() => void onStart()} loading={startTrip.isPending || locating} disabled={!busId || !students.data?.length} testID="start-trip" />
              </>
            ) : (
              <>
                <Badge label={t(`trips.types.${trip.type}`)} tone="primary" />
                <Button title={t('driver.endTrip')} icon="stop" variant="danger" size="sm" onPress={() => setConfirmEnd(true)} />
                <Button title={t('driver.recompute')} icon="refresh" variant="outline" size="sm" onPress={() => compute.mutate({ tripId: trip.id, lat: busPos?.lat, lng: busPos?.lng }, { onSuccess: () => toast.success(t('student.recompute')) })} loading={compute.isPending} />
              </>
            )}
            <Badge label={`${t('driver.gps')}: ${t(`driver.gps${quality === 'good' ? 'Good' : quality === 'fair' ? 'Fair' : quality === 'poor' ? 'Poor' : 'Off'}`)}`} tone={gpsTone} />
          </ScrollView>
          <Text variant="captionStrong" color="textMuted" style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
            {t('driver.summary', counts)}
            {!trip && busPos ? ` · ${t('driverMap.startsHere')}` : ''}
            {!trip && !busPos && permission !== 'denied' ? ` · ${t('driverMap.waitingGps')}` : ''}
          </Text>
        </View>
      ) : null}

      <View style={[styles.fill, wide && !fullscreen && { flexDirection: 'row' }]}>
        <View style={styles.fill}>
          <MapView
            ref={mapRef}
            markers={markers}
            polyline={ahead}
            polylineColor={colors.primary}
            routeOutlineColor={shade(colors.primary, -38)}
            routeSegments={trafficSegments}
            mapType={mapType}
            themed
            dark={theme.scheme === 'dark'}
            showsTraffic={traffic}
            showsUserLocation={false}
            onUserGesture={() => setFollow(false)}
            initialRegion={busPos ? { lat: busPos.lat, lng: busPos.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 } : school ? { ...school, latitudeDelta: 0.05, longitudeDelta: 0.05 } : undefined}
            padding={{ top: trip ? 120 : 0, bottom: wide || fullscreen ? 60 : 20 }}
          />

          {/* Next stop / heading to school */}
          {trip ? (
            <View style={[styles.nextCard, { top: topInset, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }, theme.shadow.sheet]}>
              {nextStop ? (
                <Pressable accessibilityRole="button" onPress={() => setSelected(nextStop)} style={styles.nextRow}>
                  <View style={[styles.nextAvatar, { backgroundColor: nextStop.status === 'PENDING' ? colors.markerGoing : colors.markerAlarmed }]}>
                    <Text style={styles.nextAvatarText}>{initials(nextStop.studentName)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="label" color="primary">
                      {t('driverMap.nextStop')} · #{nextStop.order}
                    </Text>
                    <Text variant="subheading" numberOfLines={1}>
                      {nextStop.studentName}
                    </Text>
                    {nextStop.homeAddress ? (
                      <Text variant="caption" color="textMuted" numberOfLines={1}>
                        {nextStop.homeAddress}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text variant="heading">{nextDistance != null ? formatDistance(nextDistance) : '—'}</Text>
                    <Text variant="caption" color="textMuted">
                      {nextEta != null ? formatEta(nextEta) : ''}
                    </Text>
                  </View>
                  {nextStop.parentPhone ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={t('driver.callParent')} onPress={() => void callPhone(nextStop.parentPhone)} hitSlop={6} style={[styles.callBtn, { backgroundColor: colors.successSoft }]}>
                      <Ionicons name="call" size={18} color={colors.success} />
                    </Pressable>
                  ) : null}
                </Pressable>
              ) : (
                <View style={styles.nextRow}>
                  <View style={[styles.nextAvatar, { backgroundColor: colors.markerSchool }]}>
                    <Ionicons name={trip.type === 'MORNING_PICKUP' ? 'school' : 'flag'} size={20} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="subheading">{trip.type === 'MORNING_PICKUP' ? t('driverMap.toSchool') : t('driverMap.toFinish')}</Text>
                    {arriveAt ? (
                      <Text variant="caption" color="textMuted">
                        {t('driverMap.arriveAt', { time: arriveAt })}
                      </Text>
                    ) : null}
                  </View>
                </View>
              )}
            </View>
          ) : null}

          {/* Floating controls */}
          <View style={[styles.fabColumn, { top: trip ? topInset + 104 : topInset }]}>
            <Fab icon={fullscreen ? 'contract' : 'expand'} label={fullscreen ? t('driverMap.exitFullscreen') : t('driverMap.fullscreen')} onPress={() => setFullscreen((v) => !v)} active={fullscreen} />
            <Fab icon="navigate" label={t('driverMap.navigation')} onPress={toggleFollow} active={follow} />
            <Fab icon="car" label={traffic ? t('driverMap.trafficOn') : t('driverMap.trafficOff')} onPress={() => setTraffic((v) => !v)} active={traffic} />
            <Fab icon="layers" label={t('driverMap.mapType')} onPress={() => setMapType((m) => MAP_TYPES[(MAP_TYPES.indexOf(m) + 1) % MAP_TYPES.length])} active={mapType !== 'standard'} />
            <Fab icon="scan" label={t('driverMap.fitRoute')} onPress={fitAll} />
          </View>

          {/* Remaining route + traffic legend */}
          {showMeta || (traffic && trafficSegments.length) ? (
            <View style={[styles.bottomInfo, { bottom: fullscreen ? insets.bottom + 16 : 12 }]} pointerEvents="box-none">
              {showMeta ? (
                <View style={[styles.metaPill, { backgroundColor: colors.surface, borderColor: colors.border }, theme.shadow.card]}>
                  <Ionicons name="time-outline" size={16} color={colors.primary} />
                  <Text variant="captionStrong">
                    {t('driverMap.remaining', { distance: formatDistance(remainingMeters), time: remainingSeconds != null ? formatEta(remainingSeconds) : '—' })}
                  </Text>
                  {arriveAt ? (
                    <Text variant="caption" color="textMuted">
                      · {t('driverMap.arriveAt', { time: arriveAt })}
                    </Text>
                  ) : null}
                  {totalStops ? (
                    <Text variant="caption" color="textMuted">
                      · {t('driverMap.pickedUp', { done: counts.boarded, total: totalStops })}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {traffic && trafficSegments.length ? (
                <View style={[styles.legend, { backgroundColor: colors.surface, borderColor: colors.border }, theme.shadow.card]}>
                  <LegendDot color={colors.primary} label={t('driverMap.legendClear')} />
                  <LegendDot color={SLOW_COLOR} label={t('driverMap.legendSlow')} />
                  <LegendDot color={JAM_COLOR} label={t('driverMap.legendJam')} />
                </View>
              ) : null}
            </View>
          ) : null}

          {permission === 'denied' ? (
            <View style={[styles.banner, { backgroundColor: colors.danger, top: trip ? topInset + 104 : topInset }]}>
              <Text style={{ color: '#fff' }} variant="captionStrong">
                {t('driver.locationPermissionBody')}
              </Text>
            </View>
          ) : null}
          {!trip && !startTrip.isPending && !fullscreen ? (
            <View style={[styles.emptyOverlay, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }, theme.shadow.sheet]}>
              <Ionicons name="bus-outline" size={28} color={colors.primary} />
              <Text variant="bodyStrong">{t('driver.noActiveTrip')}</Text>
              <Text variant="caption" color="textMuted" align="center">
                {students.data?.length ? t('driver.noActiveTripBody') : t('driver.noStudents')}
              </Text>
            </View>
          ) : null}
        </View>
        {!fullscreen ? stopsPanel : null}
      </View>

      <StopSheet stop={selected} tripId={trip?.id ?? null} tripType={trip?.type ?? null} nearby={nearby && selected?.id === nextStop?.id} onClose={() => setSelected(null)} />
      <ConfirmSheet visible={confirmEnd} title={t('driver.endTrip')} body={t('driver.endTripConfirm')} confirmLabel={t('driver.endTrip')} cancelLabel={t('common.cancel')} destructive loading={endTrip.isPending} onCancel={() => setConfirmEnd(false)} onConfirm={onEnd} />
    </SafeAreaView>
  );
}

function Fab({ icon, label, onPress, active = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; active?: boolean }) {
  const theme = useTheme();
  const { colors } = theme;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.fab, { backgroundColor: active ? colors.primary : colors.surface, opacity: pressed ? 0.85 : 1 }, theme.shadow.card]}
    >
      <Ionicons name={icon} size={20} color={active ? colors.onPrimary : colors.text} />
    </Pressable>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text variant="label">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { paddingTop: 8, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  nextCard: { position: 'absolute', left: 12, right: 64, padding: 12, borderWidth: StyleSheet.hairlineWidth },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  nextAvatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  callBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  fabColumn: { position: 'absolute', right: 12, gap: 10 },
  fab: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bottomInfo: { position: 'absolute', left: 12, right: 12, alignItems: 'flex-start', gap: 8 },
  metaPill: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  legend: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 14, height: 5, borderRadius: 3 },
  banner: { position: 'absolute', left: 12, right: 64, padding: 10, borderRadius: 10 },
  emptyOverlay: { position: 'absolute', left: 16, right: 16, bottom: 16, padding: 16, borderWidth: 1, alignItems: 'center', gap: 6 },
  panel: { overflow: 'hidden' },
  panelHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 56, gap: 8 },
});
