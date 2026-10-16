import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, Chip, Input, ListItem, Screen, Sheet, Skeleton, Text, useTheme, type BadgeTone } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { MapView } from '../../../components/map/MapView';
import type { MapHandle, MapMarker } from '../../../components/map/types';
import { useAnimatedPosition } from '../../../components/map/useAnimatedPosition';
import { useSession } from '../../../lib/auth/session';
import { useMyProfile } from '../../../features/profiles';
import { useSettings } from '../../../features/settings';
import { useBus } from '../../../features/school';
import { useActiveTrip, useBusLocation, useBusLocationSubscription, useStudentStops, useTripStops, useTripSubscriptions } from '../../../features/trips';
import { canChangeDayStatus, useMyDayStatus, useSetDayStatus } from '../../../features/dayStatus';
import { decodePolyline, haversineMeters } from '../../../lib/geo';
import { addDays, formatDate, formatEta, formatTime, todayIn } from '../../../lib/util/format';
import { callPhone } from '../../../lib/util/device';
import { useOpenDirectConversation } from '../../../features/messaging';
import { KV_KEYS, kv } from '../../../lib/storage/mmkv';
import { isPushSupported } from '../../../lib/push/notifications';
import { STOP_TONES } from '../../../components/StopTimeline';

type TripUiState = 'noBus' | 'none' | 'onTheWay' | 'near' | 'alarmed' | 'boarded' | 'dropped' | 'completed' | 'skipped' | 'absent';

export default function BusTab() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();
  const me = useMyProfile();
  const settings = useSettings();
  const bus = useBus(me.data?.busId);
  const today = todayIn(settings.data?.timezone);
  const trips = useActiveTrip(me.data?.busId, today);
  const trip = trips.active ?? trips.latest;
  const stops = useTripStops(trip?.id);
  const myStop = stops.data?.find((s) => s.studentId === session.userId) ?? null;
  const location = useBusLocation(me.data?.busId);
  const dayStatus = useMyDayStatus(session.userId, today);
  const history = useStudentStops(session.userId);
  const setDay = useSetDayStatus();
  const openDm = useOpenDirectConversation();
  const mapRef = useRef<MapHandle>(null);
  const [focused, setFocused] = useState(true);
  const [notGoingSheet, setNotGoingSheet] = useState(false);
  const [note, setNote] = useState('');
  const [until, setUntil] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  // One-time notification onboarding after the home location (only if never shown).
  useEffect(() => {
    if (isPushSupported && !kv.getString(KV_KEYS.onboardingNotif)) router.push('/(student)/onboarding/notifications');
  }, [router]);

  useBusLocationSubscription(me.data?.busId, focused && trip?.status === 'ACTIVE');
  useTripSubscriptions(trip?.id, focused && trip?.status === 'ACTIVE');

  const busPos = useAnimatedPosition(trip?.status === 'ACTIVE' && location.data ? { lat: location.data.lat, lng: location.data.lng, heading: location.data.heading } : null);
  const home = me.data?.homeLocation ?? null;
  const encoded = trip?.status === 'ACTIVE' ? (trip.routePolyline ?? null) : null;
  const polyline = useMemo(() => (encoded ? decodePolyline(encoded) : []), [encoded]);
  const distanceToBus = busPos && home ? haversineMeters(busPos, home) : null;

  const uiState: TripUiState = useMemo(() => {
    if (!me.data?.busId) return 'noBus';
    if (!trip) return 'none';
    if (myStop) {
      if (myStop.status === 'ABSENT') return 'absent';
      if (myStop.status === 'SKIPPED') return trip.status === 'ACTIVE' ? 'skipped' : 'completed';
      if (myStop.status === 'DROPPED') return 'dropped';
      if (myStop.status === 'BOARDED') return 'boarded';
      if (myStop.status === 'ALARMED' || myStop.status === 'ACKNOWLEDGED') return 'alarmed';
    }
    if (trip.status !== 'ACTIVE') return 'completed';
    const eta = myStop?.etaSeconds ?? null;
    if ((eta !== null && eta <= 180) || (distanceToBus !== null && distanceToBus <= 400)) return 'near';
    return 'onTheWay';
  }, [me.data?.busId, trip, myStop, distanceToBus]);

  const statusText = () => {
    switch (uiState) {
      case 'noBus':
        return t('student.tripState.noBus');
      case 'none':
        return t('student.tripState.none');
      case 'near':
        return t('student.tripState.near', { minutes: Math.max(1, Math.round((myStop?.etaSeconds ?? 120) / 60)) });
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

  const markers: MapMarker[] = [];
  if (home) markers.push({ id: 'home', kind: 'home', lat: home.lat, lng: home.lng, title: t('map.home') });
  if (settings.data?.schoolLocation) markers.push({ id: 'school', kind: 'school', lat: settings.data.schoolLocation.lat, lng: settings.data.schoolLocation.lng, title: t('map.school') });
  if (busPos) markers.push({ id: 'bus', kind: 'bus', lat: busPos.lat, lng: busPos.lng, heading: busPos.heading, title: t('map.bus'), color: theme.colors.markerBus });

  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !home) return;
    const pts = [home, ...(busPos ? [busPos] : [])];
    setTimeout(() => mapRef.current?.fitTo(pts, 80), 300);
    fitted.current = true;
  }, [home, busPos]);

  const notGoing = dayStatus.data?.status === 'NOT_GOING';
  const canChange = canChangeDayStatus(myStop?.status);

  const submitDayStatus = (status: 'GOING' | 'NOT_GOING') => {
    if (!me.data || !session.userId || !me.data.busId) return;
    setDay.mutate(
      {
        studentId: session.userId,
        studentName: me.data.fullName,
        busId: me.data.busId,
        schoolId: me.data.schoolId,
        date: today,
        status,
        note: note || null,
        untilDate: status === 'NOT_GOING' ? until : null,
        setBy: session.userId,
        activeTripId: trips.active?.id ?? null,
      },
      {
        onSuccess: () => {
          setNotGoingSheet(false);
          setNote('');
          setUntil(null);
          toast.success(status === 'NOT_GOING' ? t('student.notGoingToday') : t('student.goingToday'));
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const messageDriver = () => {
    if (!bus.data?.driverUserId) return;
    openDm.mutate(bus.data.driverUserId, { onSuccess: (c) => c && router.push(`/chat/${c.id}` as never), onError: (e) => toast.error(e.message) });
  };

  const loading = me.isLoading && !me.data;

  return (
    <Screen padded={false} title={t('tabs.bus')} subtitle={settings.data?.name} right={<Button size="sm" variant="ghost" icon="notifications-outline" title="" onPress={() => router.push('/notifications')} />}>
      <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing.xxxl }}>
        <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
          {loading ? (
            <Skeleton height={120} radius={16} />
          ) : (
            <Card tone={uiState === 'alarmed' || uiState === 'near' ? 'warning' : uiState === 'boarded' || uiState === 'dropped' ? 'success' : 'default'} style={{ gap: theme.spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Badge label={trip ? t(`trips.types.${trip.type}`) : t('common.today')} tone={tone} />
                {notGoing ? <Badge label={t('student.notGoingToday')} tone="danger" /> : null}
                <View style={{ flex: 1 }} />
                {myStop && myStop.order < 900 ? <Badge label={t('student.stopOrder', { order: myStop.order })} /> : null}
              </View>
              <Text variant="title">{statusText()}</Text>
              {uiState === 'none' ? <Text color="textMuted">{t('student.tripState.noneBody')}</Text> : null}
              {uiState === 'onTheWay' || uiState === 'near' ? (
                <Text color="textMuted">
                  {t('student.eta')}: {myStop?.etaSeconds != null ? formatEta(myStop.etaSeconds) : t('student.etaUnknown')}
                </Text>
              ) : null}
              {bus.data ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{bus.data.driverName}</Text>
                    <Text variant="caption" color="textMuted">
                      {t('student.plate')} {bus.data.plate}
                      {bus.data.driverPhone ? ` · ${bus.data.driverPhone}` : ''}
                    </Text>
                  </View>
                  {bus.data.driverPhone ? <Button size="sm" variant="secondary" icon="call" title={t('common.call')} onPress={() => callPhone(bus.data?.driverPhone)} /> : null}
                  <Button size="sm" variant="outline" icon="chatbubble-ellipses-outline" title={t('common.message')} onPress={messageDriver} loading={openDm.isPending} />
                </View>
              ) : null}
            </Card>
          )}

          {me.data?.busId ? (
            <View style={{ height: 320, borderRadius: theme.radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}>
              <MapView ref={mapRef} markers={markers} polyline={polyline} polylineColor={theme.colors.primary} initialRegion={home ? { lat: home.lat, lng: home.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 } : undefined} />
              <View style={styles.mapButtons}>
                <Button size="sm" variant="secondary" icon="locate" title="" onPress={() => mapRef.current?.fitTo([...(home ? [home] : []), ...(busPos ? [busPos] : [])], 80)} style={{ backgroundColor: theme.colors.surface }} />
              </View>
            </View>
          ) : null}

          {me.data?.busId ? (
            notGoing ? (
              <Button title={t('student.markGoing')} variant="success" size="lg" icon="checkmark-circle" onPress={() => submitDayStatus('GOING')} disabled={!canChange} loading={setDay.isPending} />
            ) : (
              <Button title={t('student.notGoingToday')} variant="danger" size="lg" icon="close-circle" onPress={() => setNotGoingSheet(true)} disabled={!canChange} />
            )
          ) : null}
          {!canChange ? (
            <Text variant="caption" color="textMuted" align="center">
              {t('student.dayStatusLocked')}
            </Text>
          ) : null}
          {dayStatus.data?.note && notGoing ? (
            <Text variant="caption" color="textMuted" align="center">
              {t('common.note')}: {dayStatus.data.note}
              {dayStatus.data.untilDate ? ` · ${t('student.untilDate')} ${formatDate(dayStatus.data.untilDate)}` : ''}
            </Text>
          ) : null}

          <Text variant="subheading" style={{ marginTop: theme.spacing.md }}>
            {t('student.history')}
          </Text>
          <Card padding={0}>
            {history.isLoading && !history.data ? (
              <View style={{ padding: theme.spacing.lg, gap: 10 }}>
                <Skeleton />
                <Skeleton width="70%" />
              </View>
            ) : !history.data?.length ? (
              <Text color="textMuted" style={{ padding: theme.spacing.lg }}>
                {t('student.noHistory')}
              </Text>
            ) : (
              history.data.slice(0, 30).map((s) => (
                <ListItem
                  key={s.id}
                  title={formatDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                  subtitle={[s.boardedAt ? `${t('student.pickedUp')} ${formatTime(s.boardedAt, settings.data?.timezone)}` : null, s.droppedAt ? `${t('student.droppedOff')} ${formatTime(s.droppedAt, settings.data?.timezone)}` : null].filter(Boolean).join(' · ') || undefined}
                  right={<Badge label={t(`trips.stopStatuses.${s.status}`)} tone={STOP_TONES[s.status]} size="sm" />}
                  left={<Ionicons name="calendar-outline" size={20} color={theme.colors.textMuted} />}
                />
              ))
            )}
          </Card>
        </View>
      </ScrollView>

      <Sheet visible={notGoingSheet} onClose={() => setNotGoingSheet(false)} title={t('student.notGoingTitle')}>
        <Text color="textMuted" style={{ marginBottom: theme.spacing.md }}>
          {t('student.notGoingBody')}
        </Text>
        <Text variant="captionStrong" color="textMuted" style={{ marginBottom: 6 }}>
          {t('student.untilDate')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: theme.spacing.md }}>
          <Chip label={t('common.today')} selected={!until} onPress={() => setUntil(null)} />
          {[1, 2, 3, 4, 5, 6].map((d) => {
            const day = addDays(today, d);
            return <Chip key={day} label={formatDate(day, { weekday: 'short', day: 'numeric' })} selected={until === day} onPress={() => setUntil(day)} />;
          })}
        </View>
        <Input label={t('student.noteOptional')} value={note} onChangeText={setNote} multiline />
        <Button title={t('student.markNotGoing')} variant="danger" size="lg" style={{ marginTop: theme.spacing.lg }} loading={setDay.isPending} onPress={() => submitDayStatus('NOT_GOING')} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({ mapButtons: { position: 'absolute', top: 10, right: 10 } });
