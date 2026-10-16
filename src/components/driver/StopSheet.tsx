import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Chip, Sheet, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import type { TripStop, TripType } from '../../lib/data/client';
import { useAlarmStudent, useComputeRoute, useUpdateStop } from '../../features/trips';
import { useOpenDirectConversation } from '../../features/messaging';
import { callPhone, haptic } from '../../lib/util/device';
import { formatDistance, formatEta } from '../../lib/util/format';
import { STOP_TONES } from '../StopTimeline';

export function StopSheet({ stop, tripId, tripType, nearby, onClose }: { stop: TripStop | null; tripId: string | null; tripType: TripType | null; nearby: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const alarm = useAlarmStudent();
  const update = useUpdateStop();
  const recompute = useComputeRoute();
  const openDm = useOpenDirectConversation();
  const [skipping, setSkipping] = useState(false);
  const [skipReason, setSkipReason] = useState<string>('noShow');

  if (!stop) return null;
  const alarmed = stop.status === 'ALARMED';
  const acked = stop.status === 'ACKNOWLEDGED';
  const done = stop.status === 'BOARDED' || stop.status === 'DROPPED';
  const canAct = tripId && (stop.status === 'PENDING' || alarmed || acked);
  const afterChange = () => {
    if (tripId) recompute.mutate({ tripId });
  };

  const setStatus = (status: 'BOARDED' | 'DROPPED' | 'SKIPPED' | 'PENDING', reason?: string) => {
    haptic('medium');
    update.mutate(
      { tripStopId: stop.id, status, reason },
      {
        onSuccess: () => {
          afterChange();
          setSkipping(false);
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <Sheet visible={!!stop} onClose={onClose} title={stop.studentName}>
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Badge label={t(`trips.stopStatuses.${stop.status}`)} tone={STOP_TONES[stop.status]} />
          {stop.order < 900 ? <Badge label={`#${stop.order}`} /> : null}
          <Badge label={`${t('driver.eta')} ${formatEta(stop.etaSeconds)} · ${formatDistance(stop.distanceMeters)}`} tone="primary" />
        </View>
        {stop.homeAddress ? <Text color="textMuted">{stop.homeAddress}</Text> : null}
        {stop.skipReason ? (
          <Text variant="caption" color="danger">
            {stop.skipReason}
          </Text>
        ) : null}
        {nearby && canAct ? (
          <Text variant="bodyStrong" color="success">
            {t('driver.nearSuggest')}
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          {stop.parentPhone ? <Button title={t('driver.callParent')} variant="secondary" icon="call" onPress={() => callPhone(stop.parentPhone)} style={{ flex: 1 }} /> : null}
          <Button
            title={t('driver.messageParent')}
            variant="outline"
            icon="chatbubble-ellipses-outline"
            loading={openDm.isPending}
            onPress={() => openDm.mutate(stop.studentId, { onSuccess: (c) => c && router.push(`/chat/${c.id}` as never), onError: (e) => toast.error(e.message) })}
            style={{ flex: 1 }}
          />
        </View>

        {canAct ? (
          <>
            <Button
              title={acked ? t('driver.acknowledged') : alarmed ? t('driver.alarmWaiting') : `🔔 ${t('driver.alarm')}`}
              size="xl"
              variant={acked ? 'success' : alarmed ? 'secondary' : 'danger'}
              icon={acked ? 'checkmark-done' : 'alarm'}
              loading={alarm.isPending}
              onPress={() => {
                haptic('heavy');
                alarm.mutate(stop.id, { onError: (e) => toast.error(e.message) });
              }}
              fullWidth
            />
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Button
                title={tripType === 'AFTERNOON_DROPOFF' ? t('driver.markDropped') : t('driver.markBoarded')}
                variant="success"
                size="lg"
                icon="checkmark-circle"
                loading={update.isPending}
                onPress={() => setStatus(tripType === 'AFTERNOON_DROPOFF' ? 'DROPPED' : 'BOARDED')}
                style={{ flex: 1 }}
              />
              <Button title={t('driver.skip')} variant="outline" size="lg" icon="play-skip-forward" onPress={() => setSkipping((v) => !v)} style={{ flex: 1 }} />
            </View>
            {skipping ? (
              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="captionStrong" color="textMuted">
                  {t('driver.skipReason')}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {(['noShow', 'wrongLocation', 'other'] as const).map((r) => (
                    <Chip key={r} label={t(`driver.skipReasons.${r}`)} selected={skipReason === r} onPress={() => setSkipReason(r)} tone="danger" />
                  ))}
                </View>
                <Button title={t('driver.skip')} variant="danger" loading={update.isPending} onPress={() => setStatus('SKIPPED', t(`driver.skipReasons.${skipReason}`))} />
              </View>
            ) : null}
          </>
        ) : done || stop.status === 'SKIPPED' ? (
          <Button title={t('driver.undo')} variant="outline" icon="arrow-undo" loading={update.isPending} onPress={() => setStatus('PENDING')} />
        ) : null}
      </View>
    </Sheet>
  );
}
