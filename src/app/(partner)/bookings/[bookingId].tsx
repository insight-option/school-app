import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ConfirmSheet, EmptyState, Input, KeyValue, Screen, SkeletonCard, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { BookingStatusBadge, CustomerHeader, VenueThumb, unitText } from '../../../components/partner/bookings';
import { hasEnded, hasStarted, usePartnerBooking, usePartnerCancelBooking, useQatarClock, useRespondBooking } from '../../../features/partner';
import { formatMoney } from '../../../features/platform';
import { formatDate, formatDateTime } from '../../../lib/util/format';
import { haptic } from '../../../lib/util/device';

type Action = 'CONFIRMED' | 'DECLINED' | 'COMPLETED' | 'NO_SHOW';

export default function PartnerBookingDetail() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors, spacing } = theme;
  const now = useQatarClock();
  const q = usePartnerBooking(bookingId);
  const respond = useRespondBooking();
  const cancel = usePartnerCancelBooking();
  const [note, setNote] = useState('');
  const [confirmKind, setConfirmKind] = useState<'decline' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const b = q.data;

  if (q.isLoading) {
    return (
      <Screen back title={t('partner.bookings.facts')} scroll>
        <SkeletonCard lines={4} />
        <SkeletonCard lines={6} />
      </Screen>
    );
  }
  if (!b) {
    return (
      <Screen back title={t('partner.bookings.facts')}>
        <EmptyState icon="alert-circle-outline" title={t('partner.bookings.notFound')} />
      </Screen>
    );
  }

  const act = (status: Action, msg: string) =>
    respond.mutate(
      { bookingId: b.id, status, note: note.trim() || undefined },
      {
        onSuccess: () => {
          haptic('success');
          toast.success(msg);
          setNote('');
        },
        onError: (e) => toast.error(e.message),
      },
    );

  const started = hasStarted(b, now);
  const ended = hasEnded(b, now);
  const phoneDigits = (b.customerPhone ?? '').replace(/[^\d+]/g, '');
  const waDigits = phoneDigits.replace(/\D/g, '');
  const unit = unitText(b, t);
  const canAnswer = b.status === 'PENDING';
  const canFinish = b.status === 'CONFIRMED';
  const canCancel = b.status === 'PENDING' || b.status === 'CONFIRMED';
  const busy = respond.isPending || cancel.isPending;

  return (
    <Screen back title={b.reference} subtitle={b.venueName ?? undefined} scroll keyboard maxWidth={760} right={<BookingStatusBadge status={b.status} size="md" />}>
      <View style={{ gap: spacing.lg, paddingTop: spacing.sm }}>
        {/* Customer */}
        <Card style={{ gap: spacing.md }}>
          <Text variant="overline" color="textMuted">
            {t('partner.bookings.customer')}
          </Text>
          <CustomerHeader booking={b} />
          <View style={styles.contactRow}>
            {phoneDigits ? <Button title={t('partner.bookings.call')} icon="call" variant="secondary" size="sm" onPress={() => void Linking.openURL(`tel:${phoneDigits}`)} style={{ flex: 1 }} /> : null}
            {waDigits ? <Button title={t('partner.bookings.whatsapp')} icon="logo-whatsapp" variant="secondary" size="sm" onPress={() => void Linking.openURL(`https://wa.me/${waDigits}`)} style={{ flex: 1 }} /> : null}
            {b.customerEmail ? <Button title={t('partner.bookings.email')} icon="mail-outline" variant="outline" size="sm" onPress={() => void Linking.openURL(`mailto:${b.customerEmail}`)} style={{ flex: 1 }} /> : null}
          </View>
        </Card>

        {/* Facts */}
        <Card style={{ gap: spacing.sm }}>
          <View style={styles.venueRow}>
            <VenueThumb photoKey={b.venuePhotoKey} />
            <View style={{ flex: 1 }}>
              <Text variant="subheading" numberOfLines={1}>
                {b.venueName}
              </Text>
              <Text variant="caption" color="textMuted">
                {formatDate(b.date, { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
            </View>
            <View style={[styles.timeBadge, { backgroundColor: colors.inverse, borderRadius: theme.radius.lg }]}>
              <Text variant="bodyStrong" style={{ color: colors.onInverse, fontVariant: ['tabular-nums'] }}>
                {b.startTime}
              </Text>
              <Text variant="caption" style={{ color: colors.onInverse, opacity: 0.75, fontVariant: ['tabular-nums'] }}>
                {b.endTime}
              </Text>
            </View>
          </View>
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 }} />
          <KeyValue label={t('partner.bookings.duration')} value={t('partner.bookings.minutes', { count: b.durationMinutes })} />
          {unit ? <KeyValue label={t('partner.bookings.unitLabel')} value={unit} /> : null}
          {b.people ? <KeyValue label={t('platform.book.people')} value={String(b.people)} /> : null}
          <KeyValue label={t('partner.bookings.price')} value={b.price != null ? formatMoney(b.price, b.currency ?? 'QAR', i18n.language) : t('platform.price.onRequest')} />
          <KeyValue label={t('partner.bookings.reference')} value={b.reference} />
          <KeyValue label={t('partner.bookings.bookedAt')} value={formatDateTime(b.bookedAt)} />
          {b.status === 'CANCELLED' && b.cancelledBy ? <KeyValue label={t('partner.bookings.status')} value={t('partner.bookings.cancelledBy', { who: t(`partner.bookings.by.${b.cancelledBy}`) })} /> : null}
        </Card>

        {b.note ? (
          <Card tone="muted" style={{ gap: 6 }}>
            <View style={styles.inline}>
              <Ionicons name="chatbox-ellipses-outline" size={18} color={colors.textMuted} />
              <Text variant="captionStrong" color="textMuted">
                {t('partner.bookings.customerNote')}
              </Text>
            </View>
            <Text>{b.note}</Text>
          </Card>
        ) : null}
        {b.businessNote ? (
          <Card tone="primary" style={{ gap: 6 }}>
            <Text variant="captionStrong" color="primary">
              {t('partner.bookings.businessNote')}
            </Text>
            <Text>{b.businessNote}</Text>
          </Card>
        ) : null}

        {/* Answer */}
        {canAnswer || canFinish ? (
          <Card elevation="raised" style={{ gap: spacing.md }}>
            <Text variant="subheading">{t('partner.bookings.answer')}</Text>
            <Input label={t('partner.bookings.businessNote')} helper={t('partner.bookings.noteHelp')} value={note} onChangeText={setNote} multiline maxLength={500} />
            {canAnswer ? (
              <View style={styles.contactRow}>
                <Button title={t('partner.bookings.decline')} icon="close" variant="outline" onPress={() => setConfirmKind('decline')} disabled={busy} style={{ flex: 1 }} />
                <Button title={t('partner.bookings.confirm')} icon="checkmark" variant="success" loading={respond.isPending} onPress={() => act('CONFIRMED', t('partner.bookings.confirmed'))} disabled={busy || ended} style={{ flex: 1 }} />
              </View>
            ) : null}
            {canFinish ? (
              started ? (
                <View style={styles.contactRow}>
                  <Button title={t('partner.bookings.noShow')} icon="person-remove-outline" variant="outline" onPress={() => act('NO_SHOW', t('partner.bookings.markedNoShow'))} disabled={busy} style={{ flex: 1 }} />
                  <Button title={t('partner.bookings.complete')} icon="checkmark-done" variant="primary" onPress={() => act('COMPLETED', t('partner.bookings.completed'))} disabled={busy} style={{ flex: 1 }} />
                </View>
              ) : (
                <Text variant="caption" color="textMuted">
                  {t('partner.bookings.afterStart')}
                </Text>
              )
            ) : null}
          </Card>
        ) : null}

        {canCancel ? <Button title={t('partner.bookings.cancel')} icon="ban-outline" variant="ghost" onPress={() => setConfirmKind('cancel')} disabled={busy} /> : null}
      </View>

      <ConfirmSheet
        visible={!!confirmKind}
        title={confirmKind === 'decline' ? t('partner.bookings.declineTitle') : t('partner.bookings.cancelTitle')}
        body={t('partner.bookings.releaseBody')}
        confirmLabel={confirmKind === 'decline' ? t('partner.bookings.decline') : t('partner.bookings.cancel')}
        cancelLabel={t('partner.bookings.keep')}
        destructive
        loading={busy}
        onCancel={() => setConfirmKind(null)}
        onConfirm={() => {
          const msg = reason.trim() || note.trim();
          if (confirmKind === 'decline') {
            respond.mutate(
              { bookingId: b.id, status: 'DECLINED', note: msg || undefined },
              {
                onSuccess: () => toast.success(t('partner.bookings.declined')),
                onError: (e) => toast.error(e.message),
                onSettled: () => {
                  setConfirmKind(null);
                  setReason('');
                },
              },
            );
          } else {
            cancel.mutate(
              { bookingId: b.id, reason: msg || undefined },
              {
                onSuccess: () => toast.success(t('partner.bookings.cancelled')),
                onError: (e) => toast.error(e.message),
                onSettled: () => {
                  setConfirmKind(null);
                  setReason('');
                },
              },
            );
          }
        }}
      >
        <Input label={t('partner.bookings.reason')} value={reason} onChangeText={setReason} multiline maxLength={300} containerStyle={{ marginBottom: spacing.sm }} />
      </ConfirmSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  contactRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timeBadge: { paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
