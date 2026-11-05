import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, Chip, Input, ListItem, Screen, Sheet, Skeleton, Text, useTheme, type BadgeTone } from '../../../ui';
import { initials, shade } from '../../../ui/theme';
import { toast } from '../../../ui/Toast';
import { MapView } from '../../../components/map/MapView';
import type { MapHandle, MapMarker } from '../../../components/map/types';
import { useAnimatedPosition } from '../../../components/map/useAnimatedPosition';
import { StudentTopBar } from '../../../components/places/PickupSwitcher';
import { useSession } from '../../../lib/auth/session';
import { useMyProfile } from '../../../features/profiles';
import { useSettings } from '../../../features/settings';
import { useBus } from '../../../features/school';
import {
  routeMetaOf,
  useActiveTrip,
  useBusLocation,
  useBusLocationSubscription,
  useBusTripsSubscription,
  useMyStopSubscription,
  useStudentStops,
  useTripStops,
  useTripSubscriptions,
} from '../../../features/trips';
import { canChangeDayStatus, useMyDayStatus, useSetDayStatus } from '../../../features/dayStatus';
import { decodePolyline, haversineMeters, remainingPathFrom, type LatLng } from '../../../lib/geo';
import { addDays, formatDate, formatEta, formatTime, todayIn } from '../../../lib/util/format';
import { callPhone, haptic } from '../../../lib/util/device';
import { useOpenDirectConversation } from '../../../features/messaging';
import { KV_KEYS, kv } from '../../../lib/storage/mmkv';
import { getPushPermissionStatus, isPushSupported } from '../../../lib/push/notifications';
import { NotificationBanner } from '../../../components/push/NotificationBanner';
import { STOP_TONES } from '../../../components/StopTimeline';
import type { Trip } from '../../../lib/data/client';

type TripUiState = 'noBus' | 'none' | 'onTheWay' | 'near' | 'alarmed' | 'boarded' | 'dropped' | 'completed' | 'skipped' | 'absent';
const ROUTED = new Set(['PENDING', 'ALARMED', 'ACKNOWLEDGED']);
const LIVE_SECONDS = 45;

export default function BusTab() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors, radius, spacing } = theme;
  const router = useRouter();
  const { height } = useWindowDimensions();
  const session = useSession();
  const me = useMyProfile();
  const settings = useSettings();
  const busId = me.data?.busId ?? null;
  const bus = useBus(busId);
  const today = todayIn(settings.data?.timezone);
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // ── Live data: subscriptions first, a slow poll underneath as a safety net ──
  const trips = useActiveTrip(busId, today, { poll: focused ? 30_000 : false });
  const trip = trips.active ?? trips.latest;
  const live = trip?.status === 'ACTIVE';
  const stops = useTripStops(trip?.id);
  const myStop = stops.data?.find((s) => s.studentId === session.userId) ?? null;
  const location = useBusLocation(busId, { poll: focused && live ? 10_000 : false });
  const dayStatus = useMyDayStatus(session.userId, today);
  const history = useStudentStops(session.userId);
  const setDay = useSetDayStatus();
  const openDm = useOpenDirectConversation();
  useBusTripsSubscription(busId, today, focused);
  useMyStopSubscription(session.userId, focused);
  useBusLocationSubscription(busId, focused && live);
  useTripSubscriptions(trip?.id, focused && live);

  const [notGoingSheet, setNotGoingSheet] = useState(false);
  const [note, setNote] = useState('');
  const [until, setUntil] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live || !focused) return;
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, [live, focused]);

  // Ask for notifications whenever the OS has never asked yet (the driver's alarm needs them).
  useEffect(() => {
    if (!isPushSupported || kv.getString(KV_KEYS.onboardingNotif)) return;
    let alive = true;
    void getPushPermissionStatus().then((s) => {
      if (alive && s === 'undetermined') router.push('/(student)/onboarding/notifications');
    });
    return () => {
      alive = false;
    };
  }, [router]);

  // The driver just started: say so even where pushes cannot arrive (Expo Go, web, muted phone).
  const seenTrip = useRef<string | null | undefined>(undefined);
  const activeId = trips.active?.id ?? null;
  const fetched = trips.isFetched;
  useEffect(() => {
    if (!fetched) return;
    if (seenTrip.current !== undefined && activeId && activeId !== seenTrip.current && focused) {
      toast.info(t('transport.tripStartedToast'));
      haptic('success');
    }
    seenTrip.current = activeId;
  }, [activeId, fetched]); // eslint-disable-line react-hooks/exhaustive-deps

  const home = me.data?.homeLocation ?? null;
  const busRaw = live && location.data ? { lat: location.data.lat, lng: location.data.lng, heading: location.data.heading } : null;
  const distanceToBus = busRaw && home ? haversineMeters(busRaw, home) : null;
  const meta = routeMetaOf(trip);
  const elapsed = meta.computedAt ? Math.max(0, (now - Date.parse(meta.computedAt)) / 1000) : 0;
  const eta = myStop?.etaSeconds != null && ROUTED.has(myStop.status) ? Math.max(0, myStop.etaSeconds - elapsed) : null;
  const stopsBefore = myStop && ROUTED.has(myStop.status) ? (stops.data ?? []).filter((s) => ROUTED.has(s.status) && s.order < myStop.order).length : null;
  const age = location.data?.updatedAt ? Math.max(0, (now - Date.parse(location.data.updatedAt)) / 1000) : null;
  const fresh = live && age !== null && age <= LIVE_SECONDS;

  const uiState: TripUiState = (() => {
    if (!busId) return 'noBus';
    if (!trip) return 'none';
    if (myStop) {
      if (myStop.status === 'ABSENT') return 'absent';
      if (myStop.status === 'SKIPPED') return trip.status === 'ACTIVE' ? 'skipped' : 'completed';
      if (myStop.status === 'DROPPED') return 'dropped';
      if (myStop.status === 'BOARDED') return trip.status === 'ACTIVE' ? 'boarded' : 'completed';
      if (myStop.status === 'ALARMED' || myStop.status === 'ACKNOWLEDGED') return 'alarmed';
    }
    if (trip.status !== 'ACTIVE') return 'completed';
    if ((eta !== null && eta <= 180) || (distanceToBus !== null && distanceToBus <= 400)) return 'near';
    return 'onTheWay';
  })();

  const statusText = () => {
    switch (uiState) {
      case 'noBus':
        return t('student.tripState.noBus');
      case 'none':
        return t('student.tripState.none');
      case 'near':
        return t('student.tripState.near', { minutes: Math.max(1, Math.round((eta ?? 120) / 60)) });
      case 'alarmed':
        return t('student.tripState.alarmed');
      case 'boarded':
        return t('student.tripState.boarded', { time: formatTime(myStop?.boardedAt, settings.data?.timezone) });
      case 'dropped':
        return t('student.tripState.dropped', { time: formatTime(myStop?.droppedAt, settings.data?.timezone) });
      case 'completed':
        return t('student.tripState.completed');
      case 'skipped':
        return t('student.tripState.skipped');
      case 'absent':
        return t('student.tripState.absent');
      default:
        return t('student.tripState.onTheWay');
    }
  };
  const tone: BadgeTone = uiState === 'alarmed' || uiState === 'near' ? 'warning' : uiState === 'boarded' || uiState === 'dropped' ? 'success' : uiState === 'absent' || uiState === 'skipped' ? 'danger' : uiState === 'onTheWay' ? 'primary' : 'neutral';

  const notGoing = dayStatus.data?.status === 'NOT_GOING';
  const canChange = canChangeDayStatus(myStop?.status);

  const submitDayStatus = (status: 'GOING' | 'NOT_GOING') => {
    if (!session.userId || !busId) return;
    haptic('medium');
    setDay.mutate(
      { studentId: session.userId, busId, date: today, status, note: status === 'NOT_GOING' ? note : null, untilDate: status === 'NOT_GOING' ? until : null },
      {
        onSuccess: () => {
          setNotGoingSheet(false);
          setNote('');
          setUntil(null);
          toast.success(status === 'NOT_GOING' ? t('transport.notRidingSaved') : t('transport.ridingSaved'));
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const messageDriver = () => {
    if (!bus.data?.driverUserId) return;
    openDm.mutate(bus.data.driverUserId, { onSuccess: (c) => c && router.push(`/chat/${c.id}` as never), onError: (e) => toast.error(e.message) });
  };

  const refresh = () => {
    void trips.refetch();
    void location.refetch();
    void stops.refetch();
    void dayStatus.refetch();
  };

  const subtitle =
    uiState === 'none'
      ? t('student.tripState.noneBody')
      : uiState === 'onTheWay' || uiState === 'near'
        ? eta !== null
          ? t('transport.arrivesAt', { time: formatTime(new Date(now + eta * 1000).toISOString(), settings.data?.timezone) })
          : t('student.etaUnknown')
        : uiState === 'alarmed'
          ? t('transport.alarmedBody')
          : uiState === 'skipped' && myStop?.skipReason === 'No home location set'
            ? t('transport.skippedNoHome')
            : '';
  const loading = me.isLoading && !me.data;
  const mapHeight = Math.round(Math.min(440, Math.max(280, height * 0.42)));

  return (
    <Screen padded={false} topBar={<StudentTopBar />}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }} refreshControl={<RefreshControl refreshing={trips.isRefetching && !trips.isLoading} onRefresh={refresh} tintColor={colors.primary} />}>
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md }}>
          <NotificationBanner />

          {busId ? (
            <View style={[styles.mapCard, { height: mapHeight, borderRadius: radius.xl, borderColor: colors.border, backgroundColor: colors.surfaceAlt }, theme.shadow.card]}>
              <LiveMap trip={live ? trip : null} bus={busRaw} home={home} homeLabel={me.data?.homeLabel} school={settings.data?.schoolLocation ?? null} />
              <View style={[styles.liveChip, { backgroundColor: colors.surface, borderRadius: radius.pill }, theme.shadow.card]} pointerEvents="none">
                <View style={[styles.liveDot, { backgroundColor: fresh ? colors.success : live ? colors.warning : colors.textFaint }]} />
                <Text variant="captionStrong">{!live ? t('transport.notStarted') : fresh ? t('transport.live') : age !== null ? t('transport.lastSeen', { ago: formatEta(age) }) : t('transport.waitingForBus')}</Text>
              </View>
              {live && eta !== null ? (
                <View style={[styles.etaBubble, { backgroundColor: colors.primary, borderRadius: radius.lg }, theme.shadow.glow]} pointerEvents="none">
                  <Text variant="numeric" style={{ color: colors.onPrimary }}>
                    {Math.max(1, Math.round(eta / 60))}
                    <Text variant="bodyStrong" style={{ color: colors.onPrimary }}>
                      {` ${t('transport.min')}`}
                    </Text>
                  </Text>
                  <Text variant="label" style={{ color: colors.onPrimary, opacity: 0.85 }}>
                    {trip?.type === 'AFTERNOON_DROPOFF' ? t('transport.toHome') : t('transport.toPickup')}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {loading ? (
            <Skeleton height={140} radius={radius.xl} />
          ) : (
            <Card style={{ gap: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Badge label={trip ? t(`trips.types.${trip.type}`) : t('common.today')} tone={tone} />
                {notGoing ? <Badge label={t('student.notGoingToday')} tone="danger" /> : null}
                <View style={{ flex: 1 }} />
                {stopsBefore !== null && live ? (
                  <Text variant="captionStrong" color="textMuted">
                    {stopsBefore === 0 ? t('transport.youAreNext') : t('transport.stopsBefore', { count: stopsBefore })}
                  </Text>
                ) : null}
              </View>
              <View style={{ gap: 4 }}>
                <Text variant="title">{statusText()}</Text>
                {subtitle ? <Text color="textMuted">{subtitle}</Text> : null}
              </View>
              {trip && uiState !== 'absent' ? <Progress trip={trip} state={uiState} /> : null}
            </Card>
          )}

          {bus.data ? (
            <Card style={styles.driverRow}>
              <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}>
                <Text variant="subheading" color="primary">
                  {initials(bus.data.driverName)}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="label" color="textMuted">
                  {t('student.busDriver')}
                </Text>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {bus.data.driverName}
                </Text>
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {t('student.plate')} {bus.data.plate}
                </Text>
              </View>
              {bus.data.driverPhone ? <RoundAction icon="call" label={t('student.callDriver')} onPress={() => void callPhone(bus.data?.driverPhone)} tint={colors.success} /> : null}
              <RoundAction icon="chatbubble-ellipses" label={t('student.messageDriver')} onPress={messageDriver} tint={colors.primary} busy={openDm.isPending} />
            </Card>
          ) : null}

          {busId ? (
            <Card style={{ gap: spacing.md }}>
              <View>
                <Text variant="subheading">{t('transport.todayPlan')}</Text>
                <Text variant="caption" color="textMuted">
                  {notGoing ? (dayStatus.data?.untilDate ? t('transport.notRidingUntil', { date: formatDate(dayStatus.data.untilDate, { weekday: 'short', day: 'numeric', month: 'short' }) }) : t('transport.notRidingBody')) : t('transport.ridingBody')}
                </Text>
              </View>
              <View style={[styles.segment, { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg }]}>
                <PlanOption icon="checkmark-circle" label={t('transport.riding')} selected={!notGoing} tint={colors.success} disabled={!canChange || setDay.isPending} onPress={() => notGoing && submitDayStatus('GOING')} />
                <PlanOption icon="close-circle" label={t('transport.notRiding')} selected={notGoing} tint={colors.danger} disabled={!canChange || setDay.isPending} onPress={() => !notGoing && setNotGoingSheet(true)} />
              </View>
              {!canChange ? (
                <Text variant="caption" color="textMuted">
                  {t('student.dayStatusLocked')}
                </Text>
              ) : null}
              {dayStatus.data?.note && notGoing ? (
                <Text variant="caption" color="textMuted">
                  {t('common.note')}: {dayStatus.data.note}
                </Text>
              ) : null}
            </Card>
          ) : null}

          <Text variant="subheading" style={{ marginTop: spacing.sm }}>
            {t('student.history')}
          </Text>
          <Card padding={0}>
            {history.isLoading && !history.data ? (
              <View style={{ padding: spacing.lg, gap: 10 }}>
                <Skeleton />
                <Skeleton width="70%" />
              </View>
            ) : !history.data?.length ? (
              <Text color="textMuted" style={{ padding: spacing.lg }}>
                {t('student.noHistory')}
              </Text>
            ) : (
              history.data.slice(0, 15).map((s) => (
                <ListItem
                  key={s.id}
                  title={formatDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                  subtitle={
                    [s.boardedAt ? `${t('student.pickedUp')} ${formatTime(s.boardedAt, settings.data?.timezone)}` : null, s.droppedAt ? `${t('student.droppedOff')} ${formatTime(s.droppedAt, settings.data?.timezone)}` : null]
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                  right={<Badge label={t(`trips.stopStatuses.${s.status}`)} tone={STOP_TONES[s.status]} size="sm" />}
                  left={<Ionicons name="calendar-outline" size={20} color={colors.textMuted} />}
                />
              ))
            )}
          </Card>
        </View>
      </ScrollView>

      <Sheet visible={notGoingSheet} onClose={() => setNotGoingSheet(false)} title={t('student.notGoingTitle')}>
        <Text color="textMuted" style={{ marginBottom: spacing.md }}>
          {t('student.notGoingBody')}
        </Text>
        <Text variant="captionStrong" color="textMuted" style={{ marginBottom: 6 }}>
          {t('student.untilDate')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md }}>
          <Chip label={t('common.today')} selected={!until} onPress={() => setUntil(null)} />
          {[1, 2, 3, 4, 5, 6].map((d) => {
            const day = addDays(today, d);
            return <Chip key={day} label={formatDate(day, { weekday: 'short', day: 'numeric' })} selected={until === day} onPress={() => setUntil(day)} />;
          })}
        </View>
        <Input label={t('student.noteOptional')} value={note} onChangeText={setNote} multiline maxLength={300} />
        <Button title={t('student.markNotGoing')} variant="danger" size="lg" style={{ marginTop: spacing.lg }} loading={setDay.isPending} onPress={() => submitDayStatus('NOT_GOING')} />
      </Sheet>
    </Screen>
  );
}

/**
 * The map lives in its own component: the bus glides at 60 fps (useAnimatedPosition) and only this
 * subtree re-renders, not the whole screen.
 */
const LiveMap = React.memo(function LiveMap({
  trip,
  bus,
  home,
  homeLabel,
  school,
}: {
  trip: Trip | null;
  bus: (LatLng & { heading?: number | null }) | null;
  home: LatLng | null;
  homeLabel?: string | null;
  school: LatLng | null;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors } = theme;
  const mapRef = useRef<MapHandle>(null);
  const busPos = useAnimatedPosition(bus);
  const encoded = trip?.routePolyline ?? null;
  const polyline = useMemo(() => (encoded ? decodePolyline(encoded) : []), [encoded]);
  const busKey = busPos ? `${busPos.lat.toFixed(4)},${busPos.lng.toFixed(4)}` : '';
  const ahead = useMemo(() => (busPos && polyline.length > 1 ? remainingPathFrom(busPos, polyline).points : polyline), [busKey, polyline]); // eslint-disable-line react-hooks/exhaustive-deps

  const markers: MapMarker[] = [];
  if (home) markers.push({ id: 'home', kind: 'home', lat: home.lat, lng: home.lng, title: homeLabel || t('map.home'), color: colors.primary });
  if (school) markers.push({ id: 'school', kind: 'school', lat: school.lat, lng: school.lng, title: t('map.school'), color: colors.markerSchool });
  if (busPos) markers.push({ id: 'bus', kind: 'bus', lat: busPos.lat, lng: busPos.lng, heading: busPos.heading, title: t('map.bus'), color: colors.markerBus, zIndex: 999 });

  // Frame home + bus when the map is ready and whenever the trip, the pickup point or the bus's
  // presence changes – not on every position update.
  const [ready, setReady] = useState(false);
  const framedFor = useRef<string | null>(null);
  const frameKey = `${trip?.id ?? 'none'}:${home ? `${home.lat.toFixed(4)},${home.lng.toFixed(4)}` : ''}:${bus ? 'bus' : ''}`;
  useEffect(() => {
    if (!ready || framedFor.current === frameKey) return;
    framedFor.current = frameKey;
    const pts = [...(home ? [home] : []), ...(bus ? [bus] : []), ...(!bus && school ? [school] : [])];
    const id = setTimeout(() => (pts.length > 1 ? mapRef.current?.fitTo(pts, 70) : pts[0] && mapRef.current?.animateTo(pts[0], 15)), 150);
    return () => clearTimeout(id);
  }, [frameKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const recenter = () => {
    haptic('selection');
    const pts = [...(home ? [home] : []), ...(busPos ? [busPos] : [])];
    if (pts.length > 1) mapRef.current?.fitTo(pts, 70);
    else if (pts[0]) mapRef.current?.animateTo(pts[0], 16);
  };

  const center = home ?? school;
  return (
    <>
      <MapView
        ref={mapRef}
        markers={markers}
        polyline={ahead}
        polylineColor={colors.primary}
        routeOutlineColor={shade(colors.primary, -30)}
        polylineWidth={5}
        themed
        dark={theme.scheme === 'dark'}
        initialRegion={center ? { lat: center.lat, lng: center.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 } : undefined}
        padding={{ top: 40, bottom: 70 }}
        onReady={() => setReady(true)}
      />
      <Pressable accessibilityRole="button" accessibilityLabel={t('transport.recenter')} onPress={recenter} style={({ pressed }) => [styles.fab, { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }, theme.shadow.card]}>
        <Ionicons name="scan" size={20} color={colors.text} />
      </Pressable>
    </>
  );
});

/** Started → on the way → near → picked up → at school (morning) / dropped off (afternoon). */
function Progress({ trip, state }: { trip: Trip; state: TripUiState }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const morning = trip.type === 'MORNING_PICKUP';
  const steps = morning ? ['started', 'onTheWay', 'near', 'boarded', 'school'] : ['started', 'onTheWay', 'near', 'dropped'];
  const reached =
    state === 'completed'
      ? steps.length - 1
      : state === 'boarded'
        ? 3
        : state === 'dropped'
          ? 3
          : state === 'alarmed' || state === 'near'
            ? 2
            : state === 'onTheWay'
              ? 1
              : 0;
  return (
    <View style={styles.steps} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: steps.length - 1, now: reached }}>
      {steps.map((s, i) => {
        const done = i <= reached;
        return (
          <View key={s} style={styles.step}>
            <View style={styles.stepTrack}>
              <View style={[styles.stepLine, { backgroundColor: i === 0 ? 'transparent' : i <= reached ? colors.primary : colors.border }]} />
              <View style={[styles.stepDot, { backgroundColor: done ? colors.primary : colors.surface, borderColor: done ? colors.primary : colors.borderStrong }, i === reached && { transform: [{ scale: 1.25 }] }]}>
                {done ? <Ionicons name="checkmark" size={10} color={colors.onPrimary} /> : null}
              </View>
              <View style={[styles.stepLine, { backgroundColor: i === steps.length - 1 ? 'transparent' : i < reached ? colors.primary : colors.border }]} />
            </View>
            <Text variant="label" align="center" color={done ? 'text' : 'textFaint'} numberOfLines={2} style={{ fontSize: 10.5, lineHeight: 13, letterSpacing: 0 }}>
              {t(`transport.steps.${s}`)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function PlanOption({ icon, label, selected, tint, disabled, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; selected: boolean; tint: string; disabled?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.option, { borderRadius: theme.radius.md, backgroundColor: selected ? theme.colors.surface : 'transparent', opacity: disabled && !selected ? 0.5 : pressed ? 0.8 : 1 }, selected && theme.shadow.card]}
    >
      <Ionicons name={selected ? icon : (`${icon}-outline` as keyof typeof Ionicons.glyphMap)} size={20} color={selected ? tint : theme.colors.textMuted} />
      <Text variant="bodyStrong" style={{ color: selected ? theme.colors.text : theme.colors.textMuted }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function RoundAction({ icon, label, onPress, tint, busy }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tint: string; busy?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={busy} hitSlop={4} style={({ pressed }) => [styles.round, { backgroundColor: theme.colors.surfaceAlt, opacity: pressed || busy ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={20} color={tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mapCard: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  liveChip: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  etaBubble: { position: 'absolute', left: 12, bottom: 12, paddingHorizontal: 14, paddingVertical: 8 },
  fab: { position: 'absolute', top: 12, right: 12, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', padding: 4, gap: 4 },
  option: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, paddingHorizontal: 8 },
  steps: { flexDirection: 'row', alignItems: 'flex-start' },
  step: { flex: 1, alignItems: 'center', gap: 6, minWidth: 0 },
  stepTrack: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  stepLine: { flex: 1, height: 3, borderRadius: 2 },
  stepDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
