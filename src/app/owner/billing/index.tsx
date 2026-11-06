import React, { useMemo, useState } from 'react';
import { RefreshControl, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, Chip, EmptyState, ListItem, Screen, SkeletonList, Text, useTheme } from '../../../ui';
import { useInvoices, usePlans, useSubscriptions } from '../../../features/owner';
import { formatMoney, qatarNow } from '../../../features/platform';
import { useBranding } from '../../../features/branding';
import { formatDate } from '../../../lib/util/format';
import type { Invoice, InvoiceStatus, Plan, SubscriptionStatus, TenantSubscription } from '../../../lib/data/client';
import { ChipRow, Grid, INVOICE_TONE, KpiCard, SUB_TONE, Segmented, TenantLogo } from '../../../components/owner/kit';

type Tab = 'subs' | 'invoices' | 'plans';
const SUB_STATUSES: SubscriptionStatus[] = ['ACTIVE', 'TRIAL', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'];
const INVOICE_STATUSES: InvoiceStatus[] = ['ISSUED', 'OVERDUE', 'PAID', 'DRAFT', 'VOID'];

const monthly = (s: TenantSubscription) => {
  const p = s.price ?? 0;
  return s.cycle === 'YEARLY' ? p / 12 : s.cycle === 'QUARTERLY' ? p / 3 : p;
};

/** Subscriptions, invoices and plans. */
export default function OwnerBilling() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const branding = useBranding();
  const [tab, setTab] = useState<Tab>('subs');
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [invStatus, setInvStatus] = useState<InvoiceStatus | null>(null);
  const subs = useSubscriptions();
  const invoices = useInvoices();
  const plans = usePlans();
  const lang = i18n.language;
  const currency = subs.data?.[0]?.currency ?? branding.currency;
  const money = (v: number, cur = currency) => formatMoney(v, cur, lang);
  const today = qatarNow().date;
  const cols = width >= 900 ? 3 : 2;

  const subList = useMemo(() => (subs.data ?? []).filter((s) => !subStatus || s.status === subStatus).sort((a, b) => a.tenantName.localeCompare(b.tenantName)), [subs.data, subStatus]);
  const mrr = useMemo(() => (subs.data ?? []).filter((s) => s.status === 'ACTIVE' || s.status === 'PAST_DUE').reduce((sum, s) => sum + monthly(s), 0), [subs.data]);
  const subCount = (st: SubscriptionStatus) => (subs.data ?? []).filter((s) => s.status === st).length;

  const isOverdue = (i: Invoice) => i.status === 'OVERDUE' || (i.status === 'ISSUED' && !!i.dueDate && i.dueDate < today);
  const invList = useMemo(
    () => (invoices.data ?? []).filter((i) => !invStatus || (invStatus === 'OVERDUE' ? i.status === 'OVERDUE' || (i.status === 'ISSUED' && !!i.dueDate && i.dueDate < today) : i.status === invStatus)),
    [invoices.data, invStatus, today],
  );
  const outstanding = (invoices.data ?? []).filter((i) => i.status === 'ISSUED' || i.status === 'OVERDUE').reduce((s, i) => s + i.total, 0);
  const paidMonth = (invoices.data ?? []).filter((i) => i.status === 'PAID' && (i.paidAt ?? i.issueDate).slice(0, 7) === today.slice(0, 7)).reduce((s, i) => s + i.total, 0);

  const segmented = (
    <Segmented<Tab>
      value={tab}
      onChange={setTab}
      options={[
        { value: 'subs', label: t('owner.billing.subscriptions'), count: subs.data?.length },
        { value: 'invoices', label: t('owner.billing.invoices'), count: invoices.data?.length },
        { value: 'plans', label: t('owner.billing.plans'), count: plans.data?.length },
      ]}
    />
  );

  const action =
    tab === 'invoices' ? (
      <Button title={t('owner.billing.newInvoice')} icon="add" size="sm" onPress={() => router.push('/owner/billing/invoice' as never)} />
    ) : tab === 'plans' ? (
      <Button title={t('owner.billing.newPlan')} icon="add" size="sm" onPress={() => router.push('/owner/billing/plan' as never)} />
    ) : undefined;

  const pad = { paddingHorizontal: theme.spacing.lg };

  if (tab === 'subs') {
    const header = (
      <View style={[pad, { gap: theme.spacing.md, paddingBottom: theme.spacing.sm }]}>
        {segmented}
        <Grid columns={cols}>
          <KpiCard icon="trending-up" label={t('owner.billing.mrr')} value={money(mrr)} />
          <KpiCard icon="checkmark-circle" color={theme.colors.success} label={t('owner.billing.active')} value={String(subCount('ACTIVE'))} />
          <KpiCard icon="sparkles" color={theme.colors.accent} label={t('owner.billing.trials')} value={String(subCount('TRIAL'))} hint={subCount('PAST_DUE') ? `${t('owner.billing.pastDue')}: ${subCount('PAST_DUE')}` : null} hintTone="danger" />
        </Grid>
        <ChipRow>
          <Chip label={t('owner.tenants.all')} selected={!subStatus} onPress={() => setSubStatus(null)} />
          {SUB_STATUSES.map((s) => (
            <Chip key={s} label={t(`owner.subStatus.${s}`)} count={subCount(s)} selected={subStatus === s} onPress={() => setSubStatus(subStatus === s ? null : s)} />
          ))}
        </ChipRow>
      </View>
    );
    return (
      <Screen padded={false} title={t('owner.billing.title')} subtitle={t('owner.billing.subtitle')} maxWidth={1100}>
        {subs.isLoading && !subs.data ? (
          <>
            {header}
            <SkeletonList rows={6} />
          </>
        ) : (
          <FlashList
            data={subList}
            keyExtractor={(s) => s.tenantId}
            ListHeaderComponent={header}
            renderItem={({ item: s }) => (
              <ListItem
                title={s.tenantName}
                subtitle={[s.planName || t('owner.tenant.customPlan'), `${money(s.price ?? 0, s.currency ?? currency)} ${t(`owner.perCycle.${s.cycle ?? 'MONTHLY'}`)}`, s.status === 'TRIAL' && s.trialEndsAt ? t('owner.tenant.trialUntil', { date: formatDate(s.trialEndsAt) }) : null]
                  .filter(Boolean)
                  .join(' · ')}
                left={<TenantLogo name={s.tenantName} size={42} />}
                right={<Badge label={t(`owner.subStatus.${s.status}`)} tone={SUB_TONE[s.status] ?? 'neutral'} size="sm" />}
                chevron
                onPress={() => router.push({ pathname: '/owner/tenants/[tenantId]', params: { tenantId: s.tenantId, type: s.tenantType } } as never)}
              />
            )}
            ListEmptyComponent={<EmptyState icon="card-outline" title={t('owner.billing.noSubscriptions')} body={t('owner.billing.noSubscriptionsBody')} />}
            refreshControl={<RefreshControl refreshing={subs.isRefetching} onRefresh={() => void subs.refetch()} tintColor={theme.colors.primary} />}
            contentContainerStyle={{ paddingBottom: theme.spacing.xxxl }}
          />
        )}
      </Screen>
    );
  }

  if (tab === 'invoices') {
    const header = (
      <View style={[pad, { gap: theme.spacing.md, paddingBottom: theme.spacing.sm }]}>
        {segmented}
        <Grid columns={2}>
          <KpiCard icon="hourglass" color={theme.colors.warning} label={t('owner.billing.outstanding')} value={money(outstanding)} />
          <KpiCard icon="checkmark-done" color={theme.colors.success} label={t('owner.overview.paidThisMonth')} value={money(paidMonth)} />
        </Grid>
        <ChipRow>
          <Chip label={t('owner.tenants.all')} selected={!invStatus} onPress={() => setInvStatus(null)} />
          {INVOICE_STATUSES.map((s) => (
            <Chip key={s} label={t(`owner.invoiceStatus.${s}`)} selected={invStatus === s} onPress={() => setInvStatus(invStatus === s ? null : s)} />
          ))}
        </ChipRow>
      </View>
    );
    return (
      <Screen padded={false} title={t('owner.billing.title')} subtitle={t('owner.billing.subtitle')} right={action} maxWidth={1100}>
        {invoices.isLoading && !invoices.data ? (
          <>
            {header}
            <SkeletonList rows={6} />
          </>
        ) : (
          <FlashList
            data={invList}
            keyExtractor={(i) => i.id}
            ListHeaderComponent={header}
            renderItem={({ item: inv }) => {
              const overdue = isOverdue(inv);
              const st = overdue && inv.status === 'ISSUED' ? 'OVERDUE' : inv.status;
              return (
                <ListItem
                  title={`${inv.number} · ${inv.tenantName}`}
                  subtitle={[money(inv.total, inv.currency ?? currency), inv.status === 'PAID' && inv.paidAt ? t('owner.billing.paidOn', { date: formatDate(inv.paidAt) }) : inv.dueDate ? t('owner.billing.due', { date: formatDate(inv.dueDate) }) : t('owner.billing.issued', { date: formatDate(inv.issueDate) })].join(' · ')}
                  left={<TenantLogo name={inv.tenantName} size={42} />}
                  right={<Badge label={t(`owner.invoiceStatus.${st}`)} tone={INVOICE_TONE[st] ?? 'neutral'} size="sm" />}
                  chevron
                  onPress={() => router.push({ pathname: '/owner/billing/invoice', params: { id: inv.id } } as never)}
                />
              );
            }}
            ListEmptyComponent={<EmptyState icon="receipt-outline" title={t('owner.billing.noInvoices')} actionLabel={t('owner.billing.newInvoice')} onAction={() => router.push('/owner/billing/invoice' as never)} />}
            refreshControl={<RefreshControl refreshing={invoices.isRefetching} onRefresh={() => void invoices.refetch()} tintColor={theme.colors.primary} />}
            contentContainerStyle={{ paddingBottom: theme.spacing.xxxl }}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen title={t('owner.billing.title')} subtitle={t('owner.billing.subtitle')} right={action} scroll maxWidth={1100} refreshing={plans.isRefetching} onRefresh={() => void plans.refetch()}>
      <View style={{ gap: theme.spacing.md }}>
        {segmented}
        {plans.isLoading ? (
          <SkeletonList rows={3} avatar={false} />
        ) : plans.data?.length ? (
          <Grid columns={width >= 900 ? 3 : width >= 600 ? 2 : 1}>
            {plans.data.map((p) => (
              <PlanCard key={p.id} plan={p} onPress={() => router.push({ pathname: '/owner/billing/plan', params: { id: p.id } } as never)} />
            ))}
          </Grid>
        ) : (
          <EmptyState icon="layers-outline" title={t('owner.billing.noPlans')} body={t('owner.billing.noPlansBody')} actionLabel={t('owner.billing.newPlan')} onAction={() => router.push('/owner/billing/plan' as never)} />
        )}
      </View>
    </Screen>
  );
}

function PlanCard({ plan: p, onPress }: { plan: Plan; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const ar = i18n.language === 'ar';
  const features = (ar && p.featuresAr?.length ? p.featuresAr : p.features) ?? [];
  return (
    <Card onPress={onPress} elevation={p.highlight ? 'raised' : 'card'} style={[{ gap: theme.spacing.md, flex: 1 }, p.highlight ? { borderWidth: 2, borderColor: theme.colors.primary } : null]}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Badge label={t(`owner.billing.planFor.${p.tenantType === 'SCHOOL' || p.tenantType === 'BUSINESS' ? p.tenantType : 'ANY'}`)} tone="primary" size="sm" />
        {p.highlight ? <Badge label={t('owner.billing.highlight')} tone="accent" size="sm" icon="star" /> : null}
        {p.active === false ? <Badge label={t('owner.billing.inactive')} size="sm" /> : null}
      </View>
      <Text variant="heading">{(ar ? p.nameAr : null) || p.name}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text variant="numeric">{formatMoney(p.priceMonthly ?? 0, p.currency ?? 'QAR', i18n.language)}</Text>
        <Text color="textMuted">{t('owner.billing.perMonth')}</Text>
      </View>
      {p.priceYearly ? (
        <Text variant="caption" color="textMuted">
          {formatMoney(p.priceYearly, p.currency ?? 'QAR', i18n.language)} {t('owner.billing.perYear')}
        </Text>
      ) : null}
      <View style={{ gap: 6 }}>
        {features.filter(Boolean).slice(0, 6).map((f) => (
          <View key={f} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
            <Text variant="caption" style={{ flex: 1 }}>
              {f}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="caption" color="textMuted">
        {[p.trialDays ? t('owner.billing.trialDays', { count: p.trialDays }) : null, p.commissionPercent ? t('owner.billing.commission', { value: p.commissionPercent }) : null].filter(Boolean).join(' · ')}
      </Text>
    </Card>
  );
}
