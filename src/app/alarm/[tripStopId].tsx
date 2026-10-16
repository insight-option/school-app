import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { client, unwrap } from '../../lib/data/client';
import { qk } from '../../lib/query/client';
import { useAcknowledgeAlarm, useTripSubscriptions } from '../../features/trips';
import { useBus } from '../../features/school';
import { alarmUiState, shouldRing, startAlarm, stopAlarm, useAlarmStore } from '../../lib/alarm/alarmPlayer';
import { callPhone, haptic } from '../../lib/util/device';
import { formatEta } from '../../lib/util/format';
import { useSession } from '../../lib/auth/session';
import { homeRouteForRole } from '../../lib/auth/routing';

/**
 * Full-screen alarm: loops the siren (also in silent mode), vibrates, shows driver + bus and offers
 * "I'm coming" (→ ACKNOWLEDGED, visible to the driver instantly) and "Call driver".
 * Route `/alarm/test` is the test alarm from Profile → it rings the same way without a stop.
 */
export default function AlarmScreen() {
  const { tripStopId } = useLocalSearchParams<{ tripStopId: string }>();
  const id = String(tripStopId);
  const isTest = id === 'test';
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();
  const dismissStore = useAlarmStore((s) => s.dismiss);
  const active = useAlarmStore((s) => s.active);
  const ack = useAcknowledgeAlarm();
  const [ackedLocally, setAckedLocally] = useState(false);

  const stop = useQuery({
    queryKey: ['alarmStop', id],
    enabled: !isTest,
    refetchInterval: 5000,
    queryFn: async () => unwrap(await client.models.TripStop.get({ id }), 'stop'),
  });
  useTripSubscriptions(stop.data?.tripId, !isTest);
  const trip = useQuery({
    queryKey: qk.trip(stop.data?.tripId ?? ''),
    enabled: !!stop.data?.tripId,
    queryFn: async () => unwrap(await client.models.Trip.get({ id: stop.data!.tripId }), 'trip'),
  });
  const bus = useBus(stop.data?.busId ?? null);

  const uiState = useMemo(() => (isTest ? (ackedLocally ? 'acknowledged' : 'ringing') : alarmUiState(stop.data?.status, ackedLocally)), [isTest, stop.data?.status, ackedLocally]);
  const ringing = shouldRing(uiState) || (!isTest && stop.isLoading && !ackedLocally);

  useEffect(() => {
    if (ringing) void startAlarm();
    else stopAlarm();
    return () => stopAlarm();
  }, [ringing]);

  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1.12, { duration: 500, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: ringing ? pulse.value : 1 }] }));

  const leave = () => {
    stopAlarm();
    dismissStore();
    if (router.canGoBack()) router.back();
    else router.replace(homeRouteForRole(session.role) as never);
  };

  const onComing = () => {
    haptic('success');
    setAckedLocally(true);
    stopAlarm();
    if (isTest) return;
    ack.mutate(id, { onError: (e) => toast.error(e.message) });
  };

  const driverName = trip.data?.driverName ?? active?.driverName ?? bus.data?.driverName ?? '';
  const plate = trip.data?.busPlate ?? active?.plate ?? bus.data?.plate ?? '';
  const phone = bus.data?.driverPhone;
  const eta = stop.data?.etaSeconds ?? active?.etaSeconds ?? null;
  const bg = uiState === 'acknowledged' || uiState === 'boarded' ? theme.colors.success : theme.colors.danger;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bg }]}>
      <View style={styles.top}>
        <Animated.View style={[styles.iconWrap, pulseStyle]}>
          <Ionicons name={uiState === 'acknowledged' || uiState === 'boarded' ? 'checkmark-circle' : 'bus'} size={110} color="#fff" />
        </Animated.View>
        <Text variant="display" style={styles.white} align="center">
          {isTest ? t('alarm.testTitle') : uiState === 'acknowledged' ? t('alarm.acknowledged') : t('alarm.title')}
        </Text>
        <Text variant="heading" style={[styles.white, { opacity: 0.9 }]} align="center">
          {isTest ? t('alarm.testBody') : t('alarm.body')}
        </Text>
      </View>

      <View style={styles.info}>
        {driverName ? <InfoRow icon="person" label={t('alarm.driver')} value={driverName} /> : null}
        {plate ? <InfoRow icon="bus" label={t('alarm.bus')} value={plate} /> : null}
        {eta !== null && eta !== undefined ? <InfoRow icon="time" label={t('alarm.eta', { minutes: Math.max(1, Math.round(eta / 60)) })} value={formatEta(eta)} /> : null}
      </View>

      <View style={styles.actions}>
        {uiState === 'ringing' || (isTest && !ackedLocally) ? (
          <Button title={t('alarm.coming')} size="xl" variant="secondary" icon="walk" fullWidth onPress={onComing} loading={ack.isPending} style={{ backgroundColor: '#fff' }} />
        ) : (
          <Button title={t('common.close')} size="xl" variant="secondary" fullWidth onPress={leave} style={{ backgroundColor: '#fff' }} />
        )}
        {phone ? <Button title={t('alarm.callDriver')} size="lg" variant="outline" icon="call" fullWidth onPress={() => callPhone(phone)} style={{ borderColor: '#fff' }} /> : null}
        {isTest ? <Button title={t('alarm.stop')} size="md" variant="ghost" onPress={leave} /> : null}
      </View>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={22} color="#fff" />
      <Text style={[styles.white, { opacity: 0.85, flex: 1 }]}>{label}</Text>
      <Text variant="subheading" style={styles.white}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, justifyContent: 'space-between' },
  top: { alignItems: 'center', gap: 16, marginTop: 24 },
  iconWrap: { width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  white: { color: '#fff' },
  info: { gap: 12, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 16, padding: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { gap: 12 },
});
