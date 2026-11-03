import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Badge, PressableScale, Text, useTheme } from '../../ui';
import { StorageImage } from '../media/StorageImage';
import { BOOKING_TONE, formatMoney } from '../../features/platform';
import { weekdayOf } from '../../../amplify/functions/shared/booking';
import type { Booking } from '../../lib/data/client';

/** One booking: date tile, venue, time, price and status. */
export const BookingCard = React.memo(function BookingCard({ booking, onPress, showCustomer }: { booking: Booking; onPress: () => void; showCustomer?: boolean }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors, radius } = theme;
  const tone = BOOKING_TONE[booking.status ?? 'PENDING'] ?? 'neutral';
  return (
    <PressableScale onPress={onPress} accessibilityLabel={`${booking.venueName ?? ''} ${booking.date} ${booking.startTime}`}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.xl }, theme.scheme === 'dark' ? { borderWidth: 1, borderColor: colors.border } : null, theme.shadow.card]}>
        <View style={[styles.dateTile, { backgroundColor: colors.primarySoft, borderRadius: radius.lg }]}>
          {booking.venuePhotoKey ? <StorageImage storageKey={booking.venuePhotoKey} style={[StyleSheet.absoluteFill, { opacity: 0.18 }]} /> : null}
          <Text variant="label" color="primary" style={{ letterSpacing: 0 }}>
            {t(`platform.weekdayShort.${weekdayOf(booking.date)}`)}
          </Text>
          <Text variant="title" weight="800" color="primary" style={{ lineHeight: 28 }}>
            {Number(booking.date.slice(8, 10))}
          </Text>
          <Text variant="label" color="primary" style={{ letterSpacing: 0 }}>
            {new Date(`${booking.date}T12:00:00Z`).toLocaleDateString(i18n.language === 'ar' ? 'ar-QA' : 'en-GB', { month: 'short', timeZone: 'UTC' })}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="bodyStrong" weight="700" numberOfLines={1}>
            {showCustomer ? (booking.customerName ?? '') : (booking.venueName ?? '')}
          </Text>
          <View style={styles.inline}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text variant="caption" color="textMuted">
              {booking.startTime} – {booking.endTime}
              {booking.unitLabel && booking.unit ? ` · ${booking.unitLabel} ${booking.unit}` : ''}
            </Text>
          </View>
          <Text variant="caption" color="textFaint" numberOfLines={1}>
            {showCustomer ? booking.venueName : booking.businessName}
          </Text>
          <View style={[styles.inline, { marginTop: 2, justifyContent: 'space-between' }]}>
            <Badge label={t(`platform.bookingStatus.${booking.status}`)} tone={tone} size="sm" />
            {booking.price != null ? (
              <Text variant="captionStrong" weight="800">
                {booking.price === 0 ? t('platform.price.free') : formatMoney(booking.price, booking.currency ?? 'QAR', i18n.language)}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12 },
  dateTile: { width: 68, height: 84, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
