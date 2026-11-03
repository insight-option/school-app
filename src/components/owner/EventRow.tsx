import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Text, useTheme } from '../../ui';
import { timeAgoShort } from '../../lib/util/format';
import type { PlatformEvent } from '../../lib/data/client';
import { IconTile } from './kit';

type IconName = keyof typeof Ionicons.glyphMap;

export const EVENT_STYLE: Record<string, { icon: IconName; color: string }> = {
  SCHOOL_REGISTERED: { icon: 'school', color: '#8A1538' },
  BUSINESS_REGISTERED: { icon: 'storefront', color: '#0C8599' },
  CUSTOMER_JOINED: { icon: 'person-add', color: '#3E63DD' },
  VENUE_CREATED: { icon: 'location', color: '#6E56CF' },
  BOOKING_CREATED: { icon: 'calendar', color: '#12A150' },
  TENANT_SUSPENDED: { icon: 'pause-circle', color: '#F59E0B' },
  TENANT_REACTIVATED: { icon: 'play-circle', color: '#12A150' },
  TENANT_DELETED: { icon: 'trash', color: '#E5484D' },
  USER_ENABLE: { icon: 'lock-open', color: '#12A150' },
  USER_DISABLE: { icon: 'lock-closed', color: '#F59E0B' },
  USER_DELETE: { icon: 'person-remove', color: '#E5484D' },
  USER_RESET_PASSWORD: { icon: 'key', color: '#5E5862' },
};

export const EVENT_GROUPS: Record<string, string[]> = {
  signups: ['SCHOOL_REGISTERED', 'BUSINESS_REGISTERED', 'CUSTOMER_JOINED'],
  bookings: ['BOOKING_CREATED'],
  venues: ['VENUE_CREATED'],
  admin: ['TENANT_SUSPENDED', 'TENANT_REACTIVATED', 'TENANT_DELETED', 'USER_ENABLE', 'USER_DISABLE', 'USER_DELETE', 'USER_RESET_PASSWORD'],
};

export const EventRow = React.memo(function EventRow({ event, last }: { event: PlatformEvent; last?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const style = EVENT_STYLE[event.type] ?? { icon: 'ellipse' as IconName, color: theme.colors.textMuted };
  const typeKey = EVENT_STYLE[event.type] ? event.type : 'OTHER';
  // TENANT_DELETED stores a JSON summary in `detail` – not meant for reading.
  const detail = event.type === 'TENANT_DELETED' ? null : event.detail;
  return (
    <View style={[styles.row, { borderBottomColor: theme.colors.border, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth }]}>
      <IconTile icon={style.icon} color={style.color} size={38} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="captionStrong" color="textMuted" numberOfLines={1}>
          {t(`owner.activity.type.${typeKey}`)}
        </Text>
        <Text variant="bodyStrong" numberOfLines={1}>
          {event.title}
        </Text>
        {detail ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" color="textFaint">
        {timeAgoShort(event.occurredAt)}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
});
