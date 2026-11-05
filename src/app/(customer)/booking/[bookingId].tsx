import React, { useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, EmptyState, Input, Screen, Sheet, Skeleton, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { BOOKING_TONE, customerCancelState, formatMoney, isUpcoming, qatarNow, useBooking, useBusiness, useCancelBooking, useVenue } from '../../../features/platform';
import { useMinuteClock } from '../../../components/explore/VenueCard';
import { weekdayOf } from '../../../../amplify/functions/shared/booking';

type IconName = keyof typeof Ionicons.glyphMap;

export default function CustomerBookingScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors, spacing, radius } = theme;
  const router = useRouter();
  const booking = useBooking(bookingId);
  const venue = useVenue(booking.data?.venueId);
  const business = useBusiness(booking.data?.businessId);
  const cancel = useCancelBooking();
  const nowMs = useMinuteClock();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const b = booking.data;

  if (!b) {
    return (
      <Screen back>
        {booking.isLoading ? <Skeleton height={260} radius={24} /> : <EmptyState icon="alert-circle-outline" title={t('platform.venue.notFound')} />}
      </Screen>
    );
  }
  const tone = BOOKING_TONE[b.status ?? 'PENDING'] ?? 'neutral';
  const upcoming = isUpcoming(b, qatarNow(nowMs));
  const cancelState = customerCancelState(b, venue.data?.cancellationHours, nowMs);
  const started = cancelState.started;
  const deadlineLabel = cancelState.canCancel && cancelState.deadlineMs
    ? new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-QA' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Qatar' }).format(new Date(cancelState.deadlineMs))
    : null;
  const phone = venue.data?.phone || business.data?.phone;
  const loc = venue.data?.location;
  const dateLabel = new Date(`${b.date}T12:00:00Z`).toLocaleDateString(i18n.language === 'ar' ? 'ar-QA' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const rows: { icon: IconName; label: string; value: string }[] = [
    { icon: 'calendar', label: t('platform.bookings.when'), value: `${t(`platform.weekday.${weekdayOf(b.date)}`)}, ${dateLabel}` },
    { icon: 'time', label: t('platform.book.time'), value: `${b.startTime} – ${b.endTime}${b.unitLabel && b.unit ? ` · ${b.unitLabel} ${b.unit}` : ''}` },
    { icon: 'location', label: t('platform.bookings.where'), value: [b.venueName, b.businessName].filter(Boolean).join(' · ') },
    ...(b.people ? [{ icon: 'people' as IconName, label: t('platform.book.people'), value: String(b.people) }] : []),
    ...(b.price != null ? [{ icon: 'pricetag' as IconName, label: t('platform.price.total'), value: b.price === 0 ? t('platform.price.free') : `${formatMoney(b.price, b.currency ?? 'QAR', i18n.language)} · ${t('platform.price.payAtVenue')}` }] : []),
  ];

  return (
    <Screen back title={b.venueName ?? ''} subtitle={b.reference} scroll maxWidth={680}>
      <View style={{ gap: spacing.lg, paddingTop: spacing.sm }}>
        <Card elevation="raised" style={{ alignItems: 'center', gap: 10, paddingVertical: spacing.xxl }}>
          <View style={[styles.statusIcon, { backgroundColor: tone === 'success' ? colors.successSoft : tone === 'warning' ? colors.warningSoft : tone === 'danger' ? colors.dangerSoft : colors.surfaceAlt }]}>
            <Ionicons
              name={b.status === 'CONFIRMED' ? 'checkmark-circle' : b.status === 'PENDING' ? 'time' : b.status === 'COMPLETED' ? 'trophy' : 'close-circle'}
              size={40}
              color={tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : tone === 'danger' ? colors.danger : colors.textMuted}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Badge label={t(`platform.bookingStatus.${b.status}`)} tone={tone} />
            {started && upcoming ? <Badge label={t('platform.bookings.inProgress')} tone="success" icon="play" /> : null}
          </View>
          <Text variant="caption" color="textMuted" style={{ letterSpacing: 1 }}>
            {t('platform.book.reference', { ref: b.reference })}
          </Text>
        </Card>

        <Card padding={0} style={{ overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <View key={r.label} style={[styles.row, i < rows.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border } : null]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.primarySoft, borderRadius: radius.md }]}>
                <Ionicons name={r.icon} size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label" color="textMuted" style={{ letterSpacing: 0 }}>
                  {r.label}
                </Text>
                <Text variant="bodyStrong">{r.value}</Text>
              </View>
            </View>
          ))}
        </Card>

        {b.note ? (
          <Card tone="muted">
            <Text variant="label" color="textMuted" style={{ letterSpacing: 0 }}>
              {t('platform.bookings.yourNote')}
            </Text>
            <Text style={{ marginTop: 4 }}>{b.note}</Text>
          </Card>
        ) : null}
        {b.businessNote ? (
          <Card tone="primary">
            <Text variant="label" color="primary" style={{ letterSpacing: 0 }}>
              {t('platform.bookings.venueNote')}
            </Text>
            <Text style={{ marginTop: 4 }}>{b.businessNote}</Text>
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          {loc ? (
            <Button
              title={t('platform.venue.directions')}
              icon="navigate"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => void Linking.openURL(Platform.OS === 'ios' ? `https://maps.apple.com/?daddr=${loc.lat},${loc.lng}` : `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`)}
            />
          ) : null}
          {phone ? <Button title={t('platform.venue.call')} icon="call" variant="secondary" style={{ flex: 1 }} onPress={() => void Linking.openURL(`tel:${phone}`)} /> : null}
        </View>
        {upcoming ? (
          cancelState.canCancel ? (
            <View style={{ gap: 8 }}>
              {deadlineLabel ? (
                <Text variant="caption" color="textMuted" align="center">
                  {t('platform.bookings.freeUntil', { time: deadlineLabel })}
                </Text>
              ) : null}
              <Button title={t('platform.bookings.cancel')} icon="close-circle-outline" variant="outline" fullWidth onPress={() => setConfirming(true)} />
            </View>
          ) : (
            <Card tone="muted" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name={started ? 'play-circle-outline' : 'information-circle-outline'} size={20} color={colors.textMuted} />
              <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
                {started ? t('platform.bookings.startedContact') : t('platform.bookings.contactToCancel')}
              </Text>
            </Card>
          )
        ) : (
          <Button title={t('platform.bookings.bookAgain')} icon="refresh" fullWidth onPress={() => router.push(`/venues/${b.venueId}/book` as never)} />
        )}
      </View>

      <Sheet visible={confirming} onClose={() => setConfirming(false)} title={t('platform.bookings.cancelConfirm')}>
        <View style={{ gap: spacing.md }}>
          <Input label={t('platform.bookings.cancelReason')} value={reason} onChangeText={setReason} maxLength={300} />
          <Button
            title={t('platform.bookings.cancel')}
            variant="danger"
            fullWidth
            loading={cancel.isPending}
            onPress={() =>
              cancel.mutate(
                { bookingId: b.id, reason: reason.trim() || undefined },
                {
                  onSuccess: () => {
                    toast.success(t('platform.bookings.cancelled'));
                    setConfirming(false);
                  },
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          />
          <Button title={t('platform.bookings.keep')} variant="ghost" fullWidth onPress={() => setConfirming(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
});
