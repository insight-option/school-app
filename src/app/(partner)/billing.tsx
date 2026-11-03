import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, EmptyState, KeyValue, Screen, SectionHeader, SkeletonCard, Text, useTheme } from '../../ui';
import { SubscriptionBanner } from '../../components/partner/bookings';
import { useMyInvoices, useMySubscription, usePlans, useQatarClock } from '../../features/partner';
import { formatMoney } from '../../features/platform';
import { useBranding } from '../../features/branding';
import { formatDate } from '../../lib/util/format';
import type { Invoice, Plan } from '../../lib/data/client';

const INVOICE_TONE: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = { DRAFT: 'neutral', ISSUED: 'warning', PAID: 'success', OVERDUE: 'danger', VOID: 'neutral' };

/** Subscription, invoices and the plans on offer (plan changes go through the platform team). */
export default function PartnerBilling() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors, spacing } = theme;
  const now = useQatarClock();
  const sub = useMySubscription();
  const invoices = useMyInvoices();
  const plans = usePlans();
  const branding = useBranding();
  const s = sub.data;
  const money = (n: number | null | undefined, cur?: string | null) => formatMoney(n ?? 0, cur || s?.currency || 'QAR', i18n.language);
  const contactUrl = branding.whatsapp ? `https://wa.me/${branding.whatsapp.replace(/\D/g, '')}` : branding.supportEmail ? `mailto:${branding.supportEmail}` : branding.supportPhone ? `tel:${branding.supportPhone}` : null;
  const refreshing = sub.isRefetching || invoices.isRefetching || plans.isRefetching;

  return (
    <Screen
      title={t('partner.billing.title')}
      subtitle={t('partner.billing.subtitle')}
      scroll
      maxWidth={880}
      refreshing={refreshing}
      onRefresh={() => void Promise.all([sub.refetch(), invoices.refetch(), plans.refetch()])}
    >
      <View style={{ gap: spacing.lg }}>
        {sub.isLoading ? (
          <SkeletonCard lines={5} />
        ) : s ? (
          <>
            <SubscriptionBanner sub={s} today={now.date} />
            <Card elevation="raised" style={{ gap: spacing.sm }}>
              <Text variant="overline" color="textMuted">
                {t('partner.billing.current')}
              </Text>
              <View style={styles.planHead}>
                <Text variant="title" style={{ flex: 1 }} numberOfLines={1}>
                  {s.planName || t('partner.sub.noPlan')}
                </Text>
                <Badge label={t(`partner.subStatus.${s.status}`)} tone={s.status === 'ACTIVE' ? 'success' : s.status === 'TRIAL' ? 'primary' : s.status === 'PAST_DUE' ? 'warning' : 'danger'} />
              </View>
              <KeyValue label={t('partner.billing.price')} value={s.price ? t('partner.billing.perCycle', { amount: money(s.price, s.currency), cycle: t(`partner.cycle.${s.cycle ?? 'MONTHLY'}`) }) : t('partner.billing.free')} />
              {s.status === 'TRIAL' && s.trialEndsAt ? <KeyValue label={t('partner.billing.trialEnds')} value={formatDate(s.trialEndsAt, { day: 'numeric', month: 'long', year: 'numeric' })} /> : null}
              {s.currentPeriodStart && s.currentPeriodEnd ? (
                <KeyValue label={t('partner.billing.period')} value={t('partner.billing.periodValue', { from: formatDate(s.currentPeriodStart), to: formatDate(s.currentPeriodEnd, { day: 'numeric', month: 'short', year: 'numeric' }) })} />
              ) : null}
              {s.commissionPercent ? <KeyValue label={t('partner.billing.commission')} value={t('partner.billing.commissionValue', { value: s.commissionPercent })} /> : null}
              {s.notes ? (
                <Text variant="caption" color="textMuted" style={{ marginTop: 4 }}>
                  {s.notes}
                </Text>
              ) : null}
            </Card>
          </>
        ) : (
          <Card tone="muted">
            <EmptyState compact icon="card-outline" title={t('partner.billing.noSubscription')} body={t('partner.billing.noSubscriptionBody')} />
          </Card>
        )}

        <SectionHeader title={t('partner.billing.invoices')} />
        {invoices.isLoading ? (
          <SkeletonCard lines={3} />
        ) : invoices.data?.length ? (
          <Card padding={0}>
            {invoices.data.map((inv, i) => (
              <InvoiceRow key={inv.id} invoice={inv} last={i === invoices.data!.length - 1} money={money} />
            ))}
          </Card>
        ) : (
          <Card tone="muted">
            <EmptyState compact icon="receipt-outline" title={t('partner.billing.noInvoices')} body={t('partner.billing.noInvoicesBody')} />
          </Card>
        )}

        {plans.data?.length ? (
          <>
            <SectionHeader title={t('partner.billing.plans')} />
            <View style={styles.plans}>
              {plans.data.map((p) => (
                <PlanCard key={p.id} plan={p} current={!!s?.planId && s.planId === p.id} money={money} />
              ))}
            </View>
          </>
        ) : null}

        <Card tone="primary" style={{ gap: spacing.sm }}>
          <View style={styles.inline}>
            <Ionicons name="chatbubbles-outline" size={20} color={colors.primary} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {t('partner.billing.contact')}
            </Text>
          </View>
          <Text variant="caption" color="textMuted">
            {contactUrl ? t('partner.billing.contactBody') : t('partner.billing.noContact')}
          </Text>
          {contactUrl ? <Button title={t('partner.billing.contact')} icon={branding.whatsapp ? 'logo-whatsapp' : 'mail-outline'} size="sm" onPress={() => void Linking.openURL(contactUrl)} style={{ alignSelf: 'flex-start' }} /> : null}
        </Card>
      </View>
    </Screen>
  );
}

function InvoiceRow({ invoice, last, money }: { invoice: Invoice; last: boolean; money: (n: number | null | undefined, cur?: string | null) => string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors } = theme;
  const sub = invoice.status === 'PAID' && invoice.paidAt ? t('partner.billing.paidOn', { date: formatDate(invoice.paidAt) }) : invoice.dueDate ? t('partner.billing.due', { date: formatDate(invoice.dueDate) }) : t('partner.billing.issued', { date: formatDate(invoice.issueDate) });
  return (
    <View style={[styles.invoice, !last ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border } : null]}>
      <View style={[styles.invoiceIcon, { backgroundColor: colors.surfaceAlt, borderRadius: theme.radius.md }]}>
        <Ionicons name="receipt-outline" size={18} color={colors.text} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {invoice.number}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text variant="bodyStrong">{money(invoice.total, invoice.currency)}</Text>
        <Badge label={t(`partner.invoiceStatus.${invoice.status}`)} tone={INVOICE_TONE[invoice.status] ?? 'neutral'} size="sm" />
      </View>
    </View>
  );
}

function PlanCard({ plan, current, money }: { plan: Plan; current: boolean; money: (n: number | null | undefined, cur?: string | null) => string }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors } = theme;
  const arabic = i18n.language === 'ar';
  const features = ((arabic ? plan.featuresAr : plan.features) ?? plan.features ?? []).filter((f): f is string => !!f);
  const highlight = plan.highlight || current;
  return (
    <Card elevation={highlight ? 'raised' : 'card'} style={[styles.plan, highlight ? { borderWidth: 2, borderColor: colors.primary } : null]}>
      <View style={styles.inline}>
        <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>
          {(arabic ? plan.nameAr : plan.name) || plan.name}
        </Text>
        {current ? <Badge label={t('partner.billing.yourPlan')} tone="primary" size="sm" /> : plan.highlight ? <Badge label={t('partner.billing.popular')} tone="accent" size="sm" /> : null}
      </View>
      <Text variant="numeric">{plan.priceMonthly ? t('partner.billing.perMonth', { amount: money(plan.priceMonthly, plan.currency) }) : t('partner.billing.free')}</Text>
      {plan.priceYearly ? (
        <Text variant="caption" color="textMuted">
          {t('partner.billing.perYear', { amount: money(plan.priceYearly, plan.currency) })}
        </Text>
      ) : null}
      <View style={{ gap: 6, marginTop: 6 }}>
        {plan.commissionPercent ? <Feature text={t('partner.billing.commissionNote', { value: plan.commissionPercent })} /> : null}
        {plan.trialDays ? <Feature text={t('partner.billing.trialDays', { count: plan.trialDays })} /> : null}
        {features.map((f) => (
          <Feature key={f} text={f} />
        ))}
      </View>
    </Card>
  );
}

function Feature({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.inline}>
      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
      <Text variant="caption" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  invoice: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  invoiceIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  plans: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  plan: { flexGrow: 1, flexBasis: 240, gap: 4 },
});
