import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, EmptyState, SectionHeader, Skeleton, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { SchoolLogo } from '../../components/media/StorageImage';
import { StatTile } from '../../components/partner/fields';
import { BookingRow, RequestActions, SubscriptionBanner } from '../../components/partner/bookings';
import {
  dashboardStats,
  hasEnded,
  useBusinessBookings,
  useMyBusiness,
  useMySubscription,
  useMyVenues,
  useQatarClock,
  useRespondBooking,
  useSaveBusinessProfile,
} from '../../features/partner';
import { formatMoney } from '../../features/platform';
import { useSession } from '../../lib/auth/session';
import { haptic } from '../../lib/util/device';
import { toMinutes } from '../../../amplify/functions/shared/booking';

/** Partner home: today at a glance, requests to answer, schedule and quick actions. */
export default function PartnerDashboard() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors, spacing } = theme;
  const router = useRouter();
  const { width } = useWindowDimensions();
  const session = useSession();
  const now = useQatarClock();
  const business = useMyBusiness();
  const venues = useMyVenues();
  const bookings = useBusinessBookings();
  const sub = useMySubscription();
  const respond = useRespondBooking();
  const saveProfile = useSaveBusinessProfile();
  const [refreshing, setRefreshing] = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);

  const all = useMemo(() => bookings.data ?? [], [bookings.data]);
  const stats = useMemo(() => dashboardStats(all, now), [all, now]);
  const pending = useMemo(() => all.filter((b) => b.status === 'PENDING' && !hasEnded(b, now)), [all, now]);
  const today = useMemo(() => all.filter((b) => b.date === now.date && (b.status === 'CONFIRMED' || b.status === 'COMPLETED' || b.status === 'PENDING')), [all, now.date]);
  const upcoming = useMemo(() => all.filter((b) => b.status === 'CONFIRMED' && b.date > now.date).slice(0, 5), [all, now.date]);
  const venueList = venues.data ?? [];
  const listed = venueList.filter((v) => v.directory === 'PUBLIC').length;
  const wide = width >= 900;
  const name = business.data?.name ?? t('partner.brandFallback');
  const firstName = (session.name ?? '').trim().split(' ')[0];
  const hour = Math.floor(now.minutes / 60);
  const greeting = hour < 12 ? t('platform.explore.greetingMorning') : hour < 17 ? t('platform.explore.greetingAfternoon') : t('platform.explore.greetingEvening');

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([bookings.refetch(), venues.refetch(), business.refetch(), sub.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const answer = (bookingId: string, status: 'CONFIRMED' | 'DECLINED') => {
    setAnswering(bookingId);
    respond.mutate(
      { bookingId, status },
      {
        onSuccess: () => {
          haptic('success');
          toast.success(status === 'CONFIRMED' ? t('partner.bookings.confirmed') : t('partner.bookings.declined'));
        },
        onError: (e) => toast.error(e.message),
        onSettled: () => setAnswering(null),
      },
    );
  };

  const hidden = business.data && business.data.directory !== 'PUBLIC';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.huge, paddingTop: spacing.md, gap: spacing.lg, width: '100%', maxWidth: 1180, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          {!wide ? <SchoolLogo logoKey={business.data?.logoKey} name={name} color={business.data?.primaryColor} size={48} radius={16} /> : null}
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="textMuted">
              {greeting}
              {firstName ? `, ${firstName}` : ''}
            </Text>
            <Text variant="title" numberOfLines={1}>
              {name}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('notifications.title')} onPress={() => router.push('/notifications')} hitSlop={8} style={[styles.roundBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
          </Pressable>
        </View>

        <SubscriptionBanner sub={sub.data} today={now.date} onPress={() => router.push('/(partner)/billing' as never)} />

        {hidden ? (
          <Card tone="warning" style={{ gap: spacing.sm }}>
            <View style={styles.inline}>
              <Ionicons name="eye-off-outline" size={20} color={colors.warning} />
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {t('partner.dashboard.hiddenTitle')}
              </Text>
            </View>
            <Text variant="caption" color="textMuted">
              {t('partner.dashboard.hiddenBody')}
            </Text>
            <Button
              title={t('partner.dashboard.showNow')}
              size="sm"
              variant="inverse"
              icon="eye-outline"
              loading={saveProfile.isPending}
              onPress={() => saveProfile.mutate({ listed: true }, { onSuccess: () => toast.success(t('partner.business.saved')), onError: (e) => toast.error(e.message) })}
              style={{ alignSelf: 'flex-start' }}
            />
          </Card>
        ) : null}

        {/* KPIs */}
        {bookings.isLoading ? (
          <View style={styles.stats}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={118} radius={24} style={{ flexGrow: 1, flexBasis: 150 }} />
            ))}
          </View>
        ) : (
          <View style={styles.stats}>
            <StatTile icon="today-outline" label={t('partner.dashboard.today')} value={String(stats.today)} onPress={() => router.push('/(partner)/bookings' as never)} />
            <StatTile icon="hourglass-outline" tone="warning" label={t('partner.dashboard.pending')} value={String(stats.pending)} onPress={() => router.push('/(partner)/bookings' as never)} />
            <StatTile icon="calendar-number-outline" tone="accent" label={t('partner.dashboard.week')} value={String(stats.week)} />
            <StatTile icon="wallet-outline" tone="success" label={t('partner.dashboard.revenue')} value={formatMoney(stats.revenueMonth, stats.currency, i18n.language)} />
            <StatTile
              icon="football-outline"
              tone="neutral"
              label={t('partner.dashboard.venuesListed')}
              value={String(listed)}
              hint={venueList.length ? t('partner.dashboard.venuesListedOf', { listed, total: venueList.length }) : undefined}
              onPress={() => router.push('/(partner)/venues' as never)}
            />
          </View>
        )}

        {!venues.isLoading && !venueList.length ? (
          <Card elevation="raised" style={{ overflow: 'hidden' }} padding={0}>
            <View style={[styles.firstVenue, { backgroundColor: colors.inverse }]}>
              <View style={[styles.firstIcon, { backgroundColor: colors.primary }]}>
                <Ionicons name="football" size={26} color={colors.onPrimary} />
              </View>
              <Text variant="heading" style={{ color: colors.onInverse }}>
                {t('partner.dashboard.firstVenueTitle')}
              </Text>
              <Text style={{ color: colors.onInverse, opacity: 0.8 }}>{t('partner.dashboard.firstVenueBody')}</Text>
              <Button title={t('partner.dashboard.addVenue')} icon="add" onPress={() => router.push('/(partner)/venues/new' as never)} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
            </View>
          </Card>
        ) : null}

        <View style={[styles.columns, wide ? styles.columnsWide : null]}>
          <View style={[styles.column, wide ? { flex: 1.25 } : null]}>
            {/* Requests */}
            <SectionHeader title={t('partner.dashboard.needsAnswer')} action={pending.length ? t('partner.dashboard.seeAll') : undefined} onAction={() => router.push('/(partner)/bookings' as never)} />
            {bookings.isLoading ? (
              <Skeleton height={120} radius={24} />
            ) : pending.length ? (
              <View style={{ gap: spacing.md }}>
                {pending.slice(0, 4).map((b) => (
                  <BookingRow
                    key={b.id}
                    booking={b}
                    onPress={() => router.push(`/(partner)/bookings/${b.id}` as never)}
                    actions={<RequestActions busy={answering === b.id} onConfirm={() => answer(b.id, 'CONFIRMED')} onDecline={() => answer(b.id, 'DECLINED')} />}
                  />
                ))}
              </View>
            ) : (
              <Card tone="muted" style={styles.inline}>
                <Ionicons name="checkmark-done-circle-outline" size={22} color={colors.success} />
                <Text color="textMuted" style={{ flex: 1 }}>
                  {t('partner.dashboard.needsAnswerEmpty')}
                </Text>
              </Card>
            )}

            {/* Today */}
            <SectionHeader title={t('partner.dashboard.timeline')} />
            {today.length ? (
              <Card padding={spacing.md} style={{ gap: 0 }}>
                {today.map((b, i) => {
                  const done = hasEnded(b, now);
                  const live = !done && toMinutes(b.startTime) <= now.minutes;
                  return (
                    <Pressable key={b.id} accessibilityRole="button" onPress={() => router.push(`/(partner)/bookings/${b.id}` as never)} style={({ pressed }) => [styles.timelineRow, { opacity: pressed ? 0.7 : done ? 0.55 : 1 }]}>
                      <View style={styles.timelineRail}>
                        <View style={[styles.timelineDot, { backgroundColor: live ? colors.success : b.status === 'PENDING' ? colors.warning : colors.primary }]} />
                        {i < today.length - 1 ? <View style={[styles.timelineLine, { backgroundColor: colors.border }]} /> : null}
                      </View>
                      <Text variant="bodyStrong" style={{ width: 54, fontVariant: ['tabular-nums'] }}>
                        {b.startTime}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyStrong" numberOfLines={1}>
                          {b.customerName || '—'}
                        </Text>
                        <Text variant="caption" color="textMuted" numberOfLines={1}>
                          {b.venueName} · {b.startTime}–{b.endTime}
                        </Text>
                      </View>
                      {live ? (
                        <View style={[styles.livePill, { backgroundColor: colors.successSoft }]}>
                          <Text variant="label" color="success">
                            {t('partner.dashboard.now')}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </Card>
            ) : (
              <Card tone="muted" style={styles.inline}>
                <Ionicons name="sunny-outline" size={22} color={colors.textMuted} />
                <Text color="textMuted" style={{ flex: 1 }}>
                  {t('partner.dashboard.timelineEmpty')}
                </Text>
              </Card>
            )}
          </View>

          <View style={styles.column}>
            {/* Quick actions */}
            <SectionHeader title={t('partner.dashboard.quick')} />
            <Card padding={spacing.sm} style={{ gap: 2 }}>
              <QuickAction icon="add-circle-outline" label={t('partner.dashboard.addVenue')} onPress={() => router.push('/(partner)/venues/new' as never)} />
              <QuickAction icon="create-outline" label={t('partner.dashboard.editBusiness')} onPress={() => router.push('/(partner)/business' as never)} />
              {business.data ? <QuickAction icon="open-outline" label={t('partner.dashboard.viewPublic')} onPress={() => router.push(`/businesses/${business.data!.businessId}` as never)} /> : null}
            </Card>

            {/* Coming up */}
            {upcoming.length ? (
              <>
                <SectionHeader title={t('partner.dashboard.upcoming')} action={t('partner.dashboard.seeAll')} onAction={() => router.push('/(partner)/bookings' as never)} />
                <View style={{ gap: spacing.md }}>
                  {upcoming.map((b) => (
                    <BookingRow key={b.id} booking={b} onPress={() => router.push(`/(partner)/bookings/${b.id}` as never)} />
                  ))}
                </View>
              </>
            ) : null}
            {!bookings.isLoading && !all.length && venueList.length ? <EmptyState compact icon="calendar-outline" title={t('partner.bookings.emptyUpcoming')} body={t('partner.bookings.emptyBody')} /> : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const theme = useTheme();
  const { colors } = theme;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quick, { backgroundColor: pressed ? colors.surfaceAlt : 'transparent', borderRadius: theme.radius.lg }]}>
      <View style={[styles.quickIcon, { backgroundColor: colors.primarySoft, borderRadius: theme.radius.md }]}>
        <Ionicons name={icon} size={19} color={colors.primary} />
      </View>
      <Text variant="bodyStrong" style={{ flex: 1 }}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={17} color={colors.textFaint} style={{ transform: [{ scaleX: theme.arabic ? -1 : 1 }] }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  firstVenue: { padding: 22, gap: 10 },
  firstIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  columns: { gap: 8 },
  columnsWide: { flexDirection: 'row', gap: 24, alignItems: 'flex-start' },
  column: { flex: 1, minWidth: 0 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  timelineRail: { width: 14, alignItems: 'center', alignSelf: 'stretch' },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  timelineLine: { width: 2, flex: 1, marginTop: 4, marginBottom: -14 },
  livePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, minHeight: 52 },
  quickIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
