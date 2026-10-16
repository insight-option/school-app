import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Text, useTheme, type BadgeTone } from '../ui';
import type { StopStatus, TripStop } from '../lib/data/client';
import { formatTime } from '../lib/util/format';

export const STOP_TONES: Record<StopStatus, BadgeTone> = {
  PENDING: 'neutral',
  ALARMED: 'warning',
  ACKNOWLEDGED: 'warning',
  BOARDED: 'success',
  DROPPED: 'success',
  SKIPPED: 'danger',
  ABSENT: 'danger',
};

/** Stop-by-stop timeline of a trip (admin trip detail, parent history). */
export function StopTimeline({ stops, timeZone }: { stops: TripStop[]; timeZone?: string | null }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const ordered = stops.slice().sort((a, b) => a.order - b.order);
  return (
    <View>
      {ordered.map((s, i) => (
        <View key={s.id} style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ alignItems: 'center', width: 24 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="captionStrong" color="primary">
                {s.order < 900 ? s.order : '·'}
              </Text>
            </View>
            {i < ordered.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: theme.colors.border, marginVertical: 2 }} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: 16, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                {s.studentName}
              </Text>
              <Badge label={t(`trips.stopStatuses.${s.status}`)} tone={STOP_TONES[s.status]} size="sm" />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {s.alarmedAt ? <Stamp icon="alarm-outline" label={`${t('trips.alarmedAt')} ${formatTime(s.alarmedAt, timeZone)}${s.alarmCount && s.alarmCount > 1 ? ` ×${s.alarmCount}` : ''}`} /> : null}
              {s.acknowledgedAt ? <Stamp icon="hand-left-outline" label={`${t('trips.stopStatuses.ACKNOWLEDGED')} ${formatTime(s.acknowledgedAt, timeZone)}`} /> : null}
              {s.boardedAt ? <Stamp icon="checkmark-circle-outline" label={`${t('trips.boardedAt')} ${formatTime(s.boardedAt, timeZone)}`} /> : null}
              {s.droppedAt ? <Stamp icon="home-outline" label={`${t('trips.stopStatuses.DROPPED')} ${formatTime(s.droppedAt, timeZone)}`} /> : null}
              {s.skippedAt ? <Stamp icon="close-circle-outline" label={`${t('trips.skippedAt')} ${formatTime(s.skippedAt, timeZone)}${s.skipReason ? ` · ${s.skipReason}` : ''}`} /> : null}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function Stamp({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons name={icon} size={14} color={theme.colors.textMuted} />
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
    </View>
  );
}
