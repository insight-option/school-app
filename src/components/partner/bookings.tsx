import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Badge, Button, Card, Text, useTheme } from '../../ui';
import { StorageImage } from '../media/StorageImage';
import { BOOKING_TONE, formatMoney } from '../../features/platform';
import type { Booking, TenantSubscription } from '../../lib/data/client';
import { formatDate } from '../../lib/util/format';
import { addDays, weekdayOf } from '../../../amplify/functions/shared/booking';

/** "Court 2" / "Unit 1" – the unit a booking occupies. */
export function unitText(b: Pick<Booking, 'unit' | 'unitLabel'>, t: (k: string, o?: Record<string, unknown>) => string): string | null {
  if (!b.unit) return null;
  return t('partner.bookings.unit', { label: b.unitLabel || t('partner.bookings.unitFallback'), n: b.unit });
}

export function BookingStatusBadge({ status, size = 'sm' }: { status: Booking['status']; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  const s = status ?? 'PENDING';
  return <Badge label={t(`platform.bookingStatus.${s}`)} tone={BOOKING_TONE[s] ?? 'neutral'} size={size} />;
}

/** One booking in a list: time block, customer, venue, unit, price and status. */
export function BookingRow({ booking, onPress, showDate = true, actions }: { booking: Booking; onPress?: () => void; showDate?: boolean; actions?: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors } = theme;
  const unit = unitText(booking, t);
  const muted = booking.status === 'CANCELLED' || booking.status === 'DECLINED' || booking.status === 'NO_SHOW';
  return (
    <Card onPress={onPress} padding={theme.spacing.md} style={{ gap: theme.spacing.md, opacity: muted ? 0.7 : 1 }}>
      <View style={styles.row}>
        <View style={[styles.timeBlock, { backgroundColor: booking.status === 'PENDING' ? colors.warningSoft : colors.surfaceAlt, borderRadius: theme.radius.lg }]}>
          {showDate ? (
            <Text variant="label" color="textMuted" numberOfLines={1}>
              {formatDate(booking.date, { weekday: 'short', day: 'numeric', month: 'short' })}
            </Text>
          ) : null}
          <Text variant="subheading" style={{ fontVariant: ['tabular-nums'] }}>
            {booking.startTime}
          </Text>
          <Text variant="caption" color="textMuted" style={{ fontVariant: ['tabular-nums'] }}>
            {booking.endTime}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
          <View style={styles.titleRow}>
            <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
              {booking.customerName || '—'}
            </Text>
            <BookingStatusBadge status={booking.status} />
          </View>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {[booking.venueName, unit].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.metaRow}>
            <Text variant="captionStrong" numberOfLines={1}>
              {booking.price != null ? formatMoney(booking.price, booking.currency ?? 'QAR', i18n.language) : t('platform.price.onRequest')}
            </Text>
            {booking.people ? (
              <Text variant="caption" color="textMuted">
                · {t('partner.bookings.people', { count: booking.people })}
              </Text>
            ) : null}
            {booking.note ? <Ionicons name="chatbox-ellipses-outline" size={14} color={colors.textMuted} /> : null}
          </View>
        </View>
      </View>
      {actions}
    </Card>
  );
}

/** Confirm / Decline buttons for a pending request (one tap). */
export function RequestActions({ onConfirm, onDecline, busy }: { onConfirm: () => void; onDecline: () => void; busy?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={styles.actions}>
      <Button title={t('partner.bookings.decline')} variant="outline" size="sm" icon="close" onPress={onDecline} disabled={busy} style={{ flex: 1 }} />
      <Button title={t('partner.bookings.confirm')} variant="success" size="sm" icon="checkmark" onPress={onConfirm} disabled={busy} style={{ flex: 1 }} />
    </View>
  );
}

/** Horizontal strip of days (with booking counts) starting at `start`. */
export function DateStrip({ start, days = 14, value, onChange, counts }: { start: string; days?: number; value: string; onChange: (d: string) => void; counts: Record<string, number> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors } = theme;
  const list = Array.from({ length: days }, (_, i) => addDays(start, i));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {list.map((d) => {
        const active = d === value;
        const n = counts[d] ?? 0;
        return (
          <Pressable
            key={d}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(d)}
            style={({ pressed }) => [
              styles.day,
              { borderRadius: theme.radius.lg, backgroundColor: active ? colors.inverse : pressed ? colors.surfaceAlt : colors.surface, borderColor: active ? colors.inverse : colors.border },
            ]}
          >
            <Text variant="label" style={{ color: active ? colors.onInverse : colors.textMuted }}>
              {t(`platform.weekdayShort.${weekdayOf(d)}`)}
            </Text>
            <Text variant="subheading" style={{ color: active ? colors.onInverse : colors.text }}>
              {Number(d.slice(8))}
            </Text>
            <View style={[styles.dot, { backgroundColor: n ? (active ? colors.accent : colors.primary) : 'transparent' }]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Customer avatar + name block used on the booking detail. */
export function CustomerHeader({ booking }: { booking: Booking }) {
  return (
    <View style={styles.customer}>
      <Avatar name={booking.customerName ?? '?'} size={52} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="subheading" numberOfLines={1}>
          {booking.customerName || '—'}
        </Text>
        {booking.customerPhone ? (
          <Text variant="caption" color="textMuted">
            {booking.customerPhone}
          </Text>
        ) : null}
        {booking.customerEmail ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {booking.customerEmail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Small venue thumbnail. */
export function VenueThumb({ photoKey, size = 56 }: { photoKey: string | null | undefined; size?: number }) {
  const theme = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: theme.radius.md, overflow: 'hidden', backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      {photoKey ? <StorageImage storageKey={photoKey} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="image-outline" size={size * 0.4} color={theme.colors.textFaint} />}
    </View>
  );
}

/** Trial / plan banner shown on the dashboard and in billing. */
export function SubscriptionBanner({ sub, today, onPress }: { sub: TenantSubscription | null | undefined; today: string; onPress?: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors } = theme;
  if (!sub) return null;
  let tone: 'primary' | 'warning' | 'danger' | 'success' = 'primary';
  let icon: keyof typeof Ionicons.glyphMap = 'sparkles';
  let text = sub.planName ? t('partner.sub.plan', { plan: sub.planName }) : t('partner.sub.active');
  if (sub.status === 'TRIAL') {
    const ended = !!sub.trialEndsAt && sub.trialEndsAt < today;
    tone = ended ? 'warning' : 'primary';
    text = ended ? t('partner.sub.trialEnded') : sub.trialEndsAt ? t('partner.sub.trialEnds', { date: formatDate(sub.trialEndsAt, { day: 'numeric', month: 'long' }) }) : t('partner.sub.trial');
    icon = 'gift-outline';
  } else if (sub.status === 'PAST_DUE') {
    tone = 'warning';
    text = t('partner.sub.pastDue');
    icon = 'alert-circle-outline';
  } else if (sub.status === 'SUSPENDED' || sub.status === 'CANCELLED') {
    tone = 'danger';
    text = sub.status === 'SUSPENDED' ? t('partner.sub.suspended') : t('partner.sub.cancelled');
    icon = 'pause-circle-outline';
  } else {
    tone = 'success';
    icon = 'checkmark-circle-outline';
  }
  const fg = { primary: colors.primary, warning: colors.warning, danger: colors.danger, success: colors.success }[tone];
  const bg = { primary: colors.primarySoft, warning: colors.warningSoft, danger: colors.dangerSoft, success: colors.successSoft }[tone];
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.banner, { backgroundColor: bg, borderRadius: theme.radius.xl, opacity: pressed ? 0.85 : 1 }]}>
      <Ionicons name={icon} size={20} color={fg} />
      <Text variant="bodyStrong" style={{ flex: 1, color: fg }} numberOfLines={2}>
        {text}
      </Text>
      <Text variant="captionStrong" style={{ color: fg }}>
        {t('partner.sub.manage')}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={fg} style={{ transform: [{ scaleX: theme.arabic ? -1 : 1 }] }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  timeBlock: { width: 78, paddingVertical: 10, alignItems: 'center', gap: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', gap: 10 },
  day: { width: 58, paddingVertical: 10, alignItems: 'center', gap: 2, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  customer: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
});
