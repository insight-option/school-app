import React, { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, ErrorState, SectionHeader, Skeleton, Text, useTheme } from '../../ui';
import { useBranding } from '../../features/branding';
import { formatMoney, qatarNow } from '../../features/platform';
import { useInvoices, useOwnerOverview, usePlatformEvents, useSubscriptions } from '../../features/owner';
import { addDays } from '../../lib/util/format';
import { BarChart, Grid, IconTile, KpiCard } from '../../components/owner/kit';
import { EventRow } from '../../components/owner/EventRow';

const nf = (n: number, lang: string) => new Intl.NumberFormat(lang === 'ar' ? 'ar-QA' : 'en-QA').format(n);

/** Owner home: money, platform size, people, trends, alerts and the latest activity. */
export default function OwnerOverview() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const branding = useBranding();
  const overview = useOwnerOverview();
  const subs = useSubscriptions();
  const invoices = useInvoices();
  const events = usePlatformEvents(15);
  const lang = i18n.language;
  const cols = width >= 1180 ? 4 : width >= 720 ? 3 : 2;
  const d = overview.data;
  const currency = d?.billing.currency ?? branding.currency;
  const money = (v: number) => formatMoney(v, currency, lang);

  const now = qatarNow();
  const hour = Math.floor(now.minutes / 60);
  const greeting = hour < 12 ? t('owner.overview.greetingMorning') : hour < 18 ? t('owner.overview.greetingAfternoon') : t('owner.overview.greetingEvening');
  const today = now.date;

  const trialsEnding = useMemo(() => {
    const limit = addDays(today, 7);
    return (subs.data ?? []).filter((s) => s.status === 'TRIAL' && s.trialEndsAt && s.trialEndsAt >= today && s.trialEndsAt <= limit).sort((a, b) => (a.trialEndsAt ?? '').localeCompare(b.trialEndsAt ?? ''));
  }, [subs.data, today]);
  const overdue = useMemo(() => (invoices.data ?? []).filter((i) => i.status === 'OVERDUE' || (i.status === 'ISSUED' && !!i.dueDate && i.dueDate < today)), [invoices.data, today]);

  const monthLabel = (ym: string) => {
    try {
      return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-QA' : 'en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(`${ym}-15T00:00:00Z`));
    } catch {
      return ym.slice(5);
    }
  };
  const revenueSeries = d ? Object.entries(d.billing.revenueByMonth).map(([k, v]) => ({ label: monthLabel(k), value: v })) : [];
  const bookingSeries = d ? Object.entries(d.bookings.byDay).map(([k, v]) => ({ label: String(Number(k.slice(8))), value: v })) : [];
  const recent = events.data?.pages[0]?.items ?? [];

  const refreshing = overview.isRefetching || subs.isRefetching || events.isRefetching;
  const refresh = () => {
    void overview.refetch();
    void subs.refetch();
    void invoices.refetch();
    void events.refetch();
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.huge }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />}
      >
        <View style={{ width: '100%', maxWidth: 1240, alignSelf: 'center', gap: theme.spacing.md }}>
          <View style={{ gap: 2, paddingTop: theme.spacing.sm }}>
            <Text variant="overline" color="primary">
              {greeting}
            </Text>
            <Text variant="display">{t('owner.overview.title')}</Text>
            <Text color="textMuted">{t('owner.overview.subtitle', { app: branding.appName })}</Text>
          </View>

          {overview.isError && !d ? <ErrorState message={t('owner.overview.loadError')} onRetry={() => void overview.refetch()} retryLabel={t('common.retry')} /> : null}

          <SectionHeader title={t('owner.overview.revenue')} />
          {d ? (
            <Grid columns={cols}>
              <KpiCard icon="trending-up" label={t('owner.overview.mrr')} value={money(d.billing.mrr)} hint={t('owner.overview.mrrHint')} onPress={() => router.push('/(owner)/billing' as never)} />
              <KpiCard icon="checkmark-done" color={theme.colors.success} label={t('owner.overview.paidThisMonth')} value={money(d.billing.paidThisMonth)} />
              <KpiCard
                icon="hourglass"
                color={theme.colors.warning}
                label={t('owner.overview.outstanding')}
                value={money(d.billing.outstanding)}
                hint={d.billing.overdueCount ? t('owner.overview.overdue', { count: d.billing.overdueCount }) : t('owner.overview.noneOverdue')}
                hintTone={d.billing.overdueCount ? 'danger' : 'textMuted'}
                onPress={() => router.push('/(owner)/billing' as never)}
              />
              <KpiCard icon="cash" color="#0C8599" label={t('owner.overview.gmv30')} value={money(d.bookings.gmv30)} hint={t('owner.overview.last30')} />
              <KpiCard icon="pie-chart" color={theme.colors.accent} label={t('owner.overview.commission30')} value={money(d.bookings.commission30)} hint={t('owner.overview.last30')} />
            </Grid>
          ) : (
            <KpiSkeleton cols={cols} />
          )}

          <SectionHeader title={t('owner.overview.platform')} />
          {d ? (
            <Grid columns={cols}>
              <KpiCard
                icon="school"
                label={t('owner.overview.schools')}
                value={nf(d.tenants.schools, lang)}
                hint={d.tenants.schoolsSuspended ? t('owner.overview.suspended', { count: d.tenants.schoolsSuspended }) : t('owner.overview.newTenants', { count: d.tenants.newLast30 })}
                hintTone={d.tenants.schoolsSuspended ? 'warning' : 'textMuted'}
                onPress={() => router.push('/(owner)/tenants' as never)}
              />
              <KpiCard
                icon="storefront"
                color="#0C8599"
                label={t('owner.overview.businesses')}
                value={nf(d.tenants.businesses, lang)}
                hint={d.tenants.businessesSuspended ? t('owner.overview.suspended', { count: d.tenants.businessesSuspended }) : null}
                hintTone="warning"
                onPress={() => router.push('/(owner)/tenants' as never)}
              />
              <KpiCard icon="location" color="#6E56CF" label={t('owner.overview.venues')} value={nf(d.tenants.venues, lang)} hint={t('owner.overview.venuesListed', { count: d.tenants.venuesListed })} />
              <KpiCard
                icon="calendar"
                color={theme.colors.success}
                label={t('owner.overview.bookings30')}
                value={nf(d.bookings.last30, lang)}
                hint={t('owner.overview.bookingsTotal', { count: d.bookings.total })}
                onPress={() => router.push('/(owner)/bookings' as never)}
              />
            </Grid>
          ) : (
            <KpiSkeleton cols={cols} />
          )}

          <SectionHeader title={t('owner.overview.people')} />
          {d ? (
            <Card padding={0}>
              <View style={[styles.peopleRow, { flexWrap: 'wrap' }]}>
                {(
                  [
                    ['CUSTOMER', 'owner.overview.customers', 'person', '#3E63DD'],
                    ['PARTNER', 'owner.overview.partners', 'briefcase', '#0C8599'],
                    ['STUDENT', 'owner.overview.students', 'happy', '#8A1538'],
                    ['TEACHER', 'owner.overview.teachers', 'easel', '#6E56CF'],
                    ['DRIVER', 'owner.overview.drivers', 'bus', '#E8590C'],
                    ['ADMIN', 'owner.overview.officeAdmins', 'business', '#5E5862'],
                  ] as const
                ).map(([role, key, icon, color]) => (
                  <View key={role} style={[styles.person, { width: cols >= 3 ? '33.33%' : '50%' }]}>
                    <IconTile icon={icon} color={color} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text variant="heading">{nf(d.people[role] ?? 0, lang)}</Text>
                      <Text variant="caption" color="textMuted" numberOfLines={1}>
                        {t(key)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          ) : (
            <Skeleton height={140} radius={24} />
          )}

          <View style={{ flexDirection: cols >= 3 ? 'row' : 'column', gap: theme.spacing.md, marginTop: theme.spacing.md }}>
            <Card style={{ flex: 1, gap: theme.spacing.md }}>
              <Text variant="subheading">{t('owner.overview.revenueChart')}</Text>
              {d ? <BarChart data={revenueSeries} formatValue={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v)))} /> : <Skeleton height={140} />}
            </Card>
            <Card style={{ flex: 1, gap: theme.spacing.md }}>
              <Text variant="subheading">{t('owner.overview.bookingsChart')}</Text>
              {d ? <BarChart data={bookingSeries} color={theme.colors.success} /> : <Skeleton height={140} />}
            </Card>
          </View>

          <View style={{ flexDirection: cols >= 3 ? 'row' : 'column', gap: theme.spacing.md }}>
            <View style={{ flex: 1 }}>
              <SectionHeader title={t('owner.overview.alerts')} />
              <Card padding={0}>
                {d && !d.tenants.withoutSubscription && !overdue.length && !trialsEnding.length ? (
                  <View style={styles.allGood}>
                    <IconTile icon="checkmark-circle" color={theme.colors.success} size={40} />
                    <Text color="textMuted" style={{ flex: 1 }}>
                      {t('owner.overview.noAlerts')}
                    </Text>
                  </View>
                ) : null}
                {d && d.tenants.withoutSubscription ? (
                  <AlertRow
                    icon="alert-circle"
                    color={theme.colors.warning}
                    title={t('owner.overview.alertNoSub', { count: d.tenants.withoutSubscription })}
                    body={t('owner.overview.alertNoSubBody')}
                    onPress={() => router.push('/(owner)/tenants' as never)}
                  />
                ) : null}
                {overdue.length ? (
                  <AlertRow
                    icon="time"
                    color={theme.colors.danger}
                    title={t('owner.overview.alertOverdue', { count: overdue.length })}
                    body={t('owner.overview.alertOverdueBody', { amount: money(overdue.reduce((s, i) => s + i.total, 0)) })}
                    onPress={() => router.push('/(owner)/billing' as never)}
                  />
                ) : null}
                {trialsEnding.slice(0, 5).map((s) => (
                  <AlertRow
                    key={s.tenantId}
                    icon="sparkles"
                    color={theme.colors.accent}
                    title={s.tenantName}
                    body={t('owner.overview.alertTrial', { date: s.trialEndsAt })}
                    onPress={() => router.push({ pathname: '/(owner)/tenants/[tenantId]', params: { tenantId: s.tenantId, type: s.tenantType } } as never)}
                  />
                ))}
              </Card>
            </View>
            <View style={{ flex: 1.3 }}>
              <SectionHeader title={t('owner.overview.recentActivity')} action={t('owner.overview.viewAll')} onAction={() => router.push('/(owner)/activity' as never)} />
              <Card style={{ paddingVertical: 4 }}>
                {events.isLoading ? (
                  <View style={{ gap: 14, paddingVertical: 12 }}>
                    <Skeleton height={14} width="70%" />
                    <Skeleton height={14} width="55%" />
                    <Skeleton height={14} width="62%" />
                  </View>
                ) : recent.length ? (
                  recent.map((e, i) => <EventRow key={e.id} event={e} last={i === recent.length - 1} />)
                ) : (
                  <Text color="textMuted" style={{ paddingVertical: 16 }}>
                    {t('owner.activity.empty')}
                  </Text>
                )}
              </Card>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AlertRow({ icon, color, title, body, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; title: string; body: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.alert, { borderBottomColor: theme.colors.border, backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent' }]}>
      <IconTile icon={icon} color={color} size={38} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {body}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textFaint} style={{ transform: [{ scaleX: theme.arabic ? -1 : 1 }] }} />
    </Pressable>
  );
}

function KpiSkeleton({ cols }: { cols: number }) {
  return (
    <Grid columns={cols}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} height={132} radius={24} />
      ))}
    </Grid>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  peopleRow: { flexDirection: 'row', padding: 8 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  allGood: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
});
