import React, { useMemo, useState } from 'react';
import { Linking, RefreshControl, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import { Badge, Button, Chip, EmptyState, Input, KeyValue, ListItem, Screen, Sheet, SkeletonList, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { useAllBookings, useOwnerCancelBooking, useOwnerRespondBooking } from '../../features/owner';
import { BOOKING_TONE, formatMoney } from '../../features/platform';
import { matchesSearch } from '../../../amplify/functions/shared/tenancy';
import { formatDate, formatDateTime } from '../../lib/util/format';
import type { Booking, BookingStatus } from '../../lib/data/client';
import { ChipRow, IconTile } from '../../components/owner/kit';

const STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'DECLINED', 'NO_SHOW'];

/** Every booking on the platform, newest first, with owner actions. */
export default function OwnerBookings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const q = useAllBookings();
  const [status, setStatus] = useState<BookingStatus | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Booking | null>(null);
  const all = useMemo(() => q.data ?? [], [q.data]);
  const counts = useMemo(() => {
    const c: Partial<Record<BookingStatus, number>> = {};
    for (const b of all) if (b.status) c[b.status] = (c[b.status] ?? 0) + 1;
    return c;
  }, [all]);
  const items = useMemo(
    () => all.filter((b) => (!status || b.status === status) && matchesSearch(`${b.reference} ${b.customerName ?? ''} ${b.customerEmail ?? ''} ${b.venueName ?? ''} ${b.businessName ?? ''}`, query)),
    [all, status, query],
  );

  const header = (
    <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.sm, gap: theme.spacing.sm }}>
      <Input placeholder={t('owner.bookings.search')} value={query} onChangeText={setQuery} leftIcon="search" autoCapitalize="none" autoCorrect={false} />
      <ChipRow>
        <Chip label={t('owner.bookings.all')} count={all.length} selected={!status} onPress={() => setStatus(null)} />
        {STATUSES.map((s) => (
          <Chip key={s} label={t(`platform.bookingStatus.${s}`)} count={counts[s] ?? 0} selected={status === s} onPress={() => setStatus(status === s ? null : s)} />
        ))}
      </ChipRow>
    </View>
  );

  return (
    <Screen padded={false} title={t('owner.bookings.title')} subtitle={t('owner.bookings.subtitle')} maxWidth={1100}>
      {q.isLoading && !q.data ? (
        <>
          {header}
          <SkeletonList rows={7} />
        </>
      ) : (
        <FlashList
          data={items}
          keyExtractor={(b) => b.id}
          ListHeaderComponent={header}
          renderItem={({ item }) => <BookingRow booking={item} wide={width >= 700} onPress={() => setOpen(item)} />}
          ListEmptyComponent={all.length ? <EmptyState icon="filter-outline" title={t('owner.bookings.emptyFiltered')} compact /> : <EmptyState icon="calendar-outline" title={t('owner.bookings.empty')} />}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={theme.colors.primary} />}
          contentContainerStyle={{ paddingBottom: theme.spacing.xxxl }}
        />
      )}
      {open ? <BookingSheet booking={all.find((b) => b.id === open.id) ?? open} onClose={() => setOpen(null)} /> : null}
    </Screen>
  );
}

const BookingRow = React.memo(function BookingRow({ booking: b, wide, onPress }: { booking: Booking; wide: boolean; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  return (
    <ListItem
      title={`${b.venueName ?? ''} · ${formatDate(b.date, { weekday: 'short', day: 'numeric', month: 'short' })} ${b.startTime}`}
      subtitle={[b.customerName, wide ? b.businessName : null, b.reference].filter(Boolean).join(' · ')}
      left={<IconTile icon="calendar" color={theme.colors.primary} size={42} />}
      right={
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Badge label={t(`platform.bookingStatus.${b.status}`)} tone={BOOKING_TONE[b.status ?? 'PENDING'] ?? 'neutral'} size="sm" />
          {b.price != null ? (
            <Text variant="captionStrong" color="textMuted">
              {formatMoney(b.price, b.currency ?? 'QAR', i18n.language)}
            </Text>
          ) : null}
        </View>
      }
      onPress={onPress}
    />
  );
});

function BookingSheet({ booking: b, onClose }: { booking: Booking; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const respond = useOwnerRespondBooking();
  const cancel = useOwnerCancelBooking();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const active = b.status === 'PENDING' || b.status === 'CONFIRMED';
  const done = (msg: string) => {
    toast.success(msg);
    onClose();
  };
  const fail = (e: Error) => toast.error(e.message);

  return (
    <Sheet visible onClose={onClose} title={b.venueName ?? t('owner.bookings.title')}>
      <View style={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Badge label={t(`platform.bookingStatus.${b.status}`)} tone={BOOKING_TONE[b.status ?? 'PENDING'] ?? 'neutral'} />
          <Text variant="captionStrong" color="textMuted">
            {b.reference}
          </Text>
        </View>
        <KeyValue label={t('owner.bookings.when')} value={`${formatDate(b.date, { weekday: 'long', day: 'numeric', month: 'long' })} · ${b.startTime}–${b.endTime}`} />
        <KeyValue label={t('owner.bookings.duration')} value={t('platform.book.minutes', { count: b.durationMinutes })} />
        <KeyValue label={t('owner.bookings.business')} value={b.businessName} />
        <KeyValue label={t('owner.bookings.customer')} value={b.customerName} />
        {b.people ? <KeyValue label={t('owner.bookings.people')} value={String(b.people)} /> : null}
        <KeyValue label={t('owner.bookings.price')} value={b.price != null ? formatMoney(b.price, b.currency ?? 'QAR', i18n.language) : t('owner.bookings.noPrice')} />
        <KeyValue label={t('owner.bookings.bookedAt')} value={formatDateTime(b.bookedAt)} />
        {b.note ? <KeyValue label={t('owner.bookings.customerNote')} value={b.note} /> : null}
        {b.businessNote ? <KeyValue label={t('owner.bookings.venueNote')} value={b.businessNote} /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {b.customerPhone ? <Button title={t('common.call')} icon="call-outline" variant="outline" size="sm" onPress={() => void Linking.openURL(`tel:${b.customerPhone}`)} /> : null}
          {b.customerEmail ? <Button title={t('common.email')} icon="mail-outline" variant="outline" size="sm" onPress={() => void Linking.openURL(`mailto:${b.customerEmail}`)} /> : null}
        </View>

        {b.status === 'PENDING' ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: theme.spacing.md }}>
            <Button
              title={t('owner.bookings.decline')}
              variant="outline"
              style={{ flex: 1 }}
              loading={respond.isPending && respond.variables?.status === 'DECLINED'}
              onPress={() => respond.mutate({ bookingId: b.id, status: 'DECLINED' }, { onSuccess: () => done(t('owner.bookings.updated')), onError: fail })}
            />
            <Button
              title={t('owner.bookings.confirm')}
              variant="success"
              style={{ flex: 1 }}
              loading={respond.isPending && respond.variables?.status === 'CONFIRMED'}
              onPress={() => respond.mutate({ bookingId: b.id, status: 'CONFIRMED' }, { onSuccess: () => done(t('owner.bookings.updated')), onError: fail })}
            />
          </View>
        ) : null}
        {active ? (
          cancelling ? (
            <View style={{ gap: 10, marginTop: theme.spacing.sm }}>
              <Input label={t('owner.bookings.cancelReason')} value={reason} onChangeText={setReason} multiline />
              <Button
                title={t('owner.bookings.cancel')}
                variant="danger"
                loading={cancel.isPending}
                onPress={() => cancel.mutate({ bookingId: b.id, reason: reason.trim() || undefined }, { onSuccess: () => done(t('owner.bookings.updated')), onError: fail })}
                fullWidth
              />
            </View>
          ) : (
            <Button title={t('owner.bookings.cancel')} variant="ghost" icon="close-circle-outline" onPress={() => setCancelling(true)} style={{ marginTop: theme.spacing.sm }} />
          )
        ) : null}
      </View>
    </Sheet>
  );
}
