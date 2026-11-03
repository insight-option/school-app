import React, { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Input, Select, Sheet, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { usePlans, useSaveSubscription, type SubscriptionInput, type TenantType } from '../../features/owner';
import type { TenantSubscription } from '../../lib/data/client';
import { addDays } from '../../lib/util/format';
import { qatarNow } from '../../features/platform';
import { parseAmount, YMD } from './kit';

const STATUSES = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'] as const;
const CYCLES = ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const;

type Props = {
  visible: boolean;
  onClose: () => void;
  tenant: { id: string; type: TenantType; name: string; email?: string | null; phone?: string | null };
  existing: TenantSubscription | null;
};

/** Create or edit a tenant's subscription (plan, status, price, commission, period, billing contact). */
export function SubscriptionSheet({ visible, onClose, tenant, existing }: Props) {
  // Remount the form whenever the sheet opens so it always starts from the saved values.
  return visible ? <SubscriptionForm onClose={onClose} tenant={tenant} existing={existing} /> : null;
}

function SubscriptionForm({ onClose, tenant, existing }: Omit<Props, 'visible'>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const plans = usePlans();
  const save = useSaveSubscription();
  const today = qatarNow().date;
  const [form, setForm] = useState(() => ({
    planId: existing?.planId ?? '',
    planName: existing?.planName ?? '',
    status: (existing?.status ?? 'TRIAL') as SubscriptionInput['status'],
    cycle: (existing?.cycle ?? 'MONTHLY') as SubscriptionInput['cycle'],
    price: existing?.price != null ? String(existing.price) : '',
    currency: existing?.currency ?? 'QAR',
    commission: existing?.commissionPercent != null ? String(existing.commissionPercent) : '',
    trialEndsAt: existing?.trialEndsAt ?? addDays(today, 30),
    periodStart: existing?.currentPeriodStart ?? today,
    periodEnd: existing?.currentPeriodEnd ?? '',
    billingName: existing?.billingName ?? '',
    billingEmail: existing?.billingEmail ?? tenant.email ?? '',
    billingPhone: existing?.billingPhone ?? tenant.phone ?? '',
    notes: existing?.notes ?? '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const applicable = (plans.data ?? []).filter((p) => p.tenantType === tenant.type || p.tenantType === 'ANY');
  const pickPlan = (id: string | null) => {
    const plan = applicable.find((p) => p.id === id);
    if (!plan) {
      setForm((f) => ({ ...f, planId: '', planName: '' }));
      return;
    }
    setForm((f) => ({
      ...f,
      planId: plan.id,
      planName: plan.name,
      price: String((f.cycle === 'YEARLY' ? plan.priceYearly : plan.priceMonthly) ?? plan.priceMonthly ?? 0),
      currency: plan.currency ?? f.currency,
      commission: plan.commissionPercent != null ? String(plan.commissionPercent) : f.commission,
      trialEndsAt: !existing && plan.trialDays ? addDays(today, plan.trialDays) : f.trialEndsAt,
    }));
  };

  const submit = () => {
    const e: Record<string, string> = {};
    const price = parseAmount(form.price);
    const commission = parseAmount(form.commission);
    if (price !== null && Number.isNaN(price)) e.price = t('owner.errors.number');
    if (commission !== null && (Number.isNaN(commission) || commission < 0 || commission > 100)) e.commission = t('owner.errors.number');
    for (const k of ['trialEndsAt', 'periodStart', 'periodEnd'] as const) if (form[k] && !YMD.test(form[k])) e[k] = t('owner.invoice.errorDate');
    setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate(
      {
        isNew: !existing,
        tenantId: tenant.id,
        tenantType: tenant.type,
        tenantName: tenant.name,
        planId: form.planId || null,
        planName: form.planName || null,
        status: form.status,
        cycle: form.cycle,
        price: price ?? 0,
        currency: form.currency || 'QAR',
        commissionPercent: commission ?? 0,
        trialEndsAt: form.trialEndsAt || null,
        currentPeriodStart: form.periodStart || null,
        currentPeriodEnd: form.periodEnd || null,
        billingName: form.billingName.trim() || null,
        billingEmail: form.billingEmail.trim() || null,
        billingPhone: form.billingPhone.trim() || null,
        notes: form.notes.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success(t('owner.tenant.subscriptionSaved'));
          onClose();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={existing ? t('owner.tenant.editSubscription') : t('owner.tenant.createSubscription')}
      footer={<Button title={t('common.save')} onPress={submit} loading={save.isPending} fullWidth size="lg" />}
    >
      <View style={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.md }}>
        <Text variant="caption" color="textMuted">
          {tenant.name}
        </Text>
        <Select
          label={t('owner.tenant.plan')}
          placeholder={t('owner.tenant.customPlan')}
          value={form.planId || null}
          onChange={(v) => pickPlan((v as string | null) ?? null)}
          options={applicable.map((p) => ({ value: p.id, label: p.name, subtitle: p.priceMonthly != null ? `${p.priceMonthly} ${p.currency ?? 'QAR'} ${t('owner.billing.perMonth')}` : undefined }))}
        />
        <View style={{ gap: 8 }}>
          <Text variant="captionStrong" color="textMuted">
            {t('owner.tenant.status')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {STATUSES.map((s) => (
              <Chip key={s} label={t(`owner.subStatus.${s}`)} selected={form.status === s} onPress={() => set('status', s)} />
            ))}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Text variant="captionStrong" color="textMuted">
            {t('owner.tenant.cycle')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CYCLES.map((c) => (
              <Chip key={c} label={t(`owner.cycle.${c}`)} selected={form.cycle === c} onPress={() => set('cycle', c)} />
            ))}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Input containerStyle={{ flex: 2 }} label={t('owner.tenant.price')} value={form.price} onChangeText={(v) => set('price', v)} keyboardType="decimal-pad" error={errors.price} />
          <Input containerStyle={{ flex: 1 }} label={t('owner.invoice.currency')} value={form.currency} onChangeText={(v) => set('currency', v.toUpperCase())} autoCapitalize="characters" maxLength={3} />
        </View>
        <Input label={t('owner.tenant.commission')} value={form.commission} onChangeText={(v) => set('commission', v)} keyboardType="decimal-pad" error={errors.commission} />
        {form.status === 'TRIAL' ? <Input label={t('owner.tenant.trialEnds')} value={form.trialEndsAt} onChangeText={(v) => set('trialEndsAt', v)} placeholder="2026-12-31" error={errors.trialEndsAt} /> : null}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Input containerStyle={{ flex: 1 }} label={t('owner.tenant.periodStart')} value={form.periodStart} onChangeText={(v) => set('periodStart', v)} placeholder="2026-11-01" error={errors.periodStart} />
          <Input containerStyle={{ flex: 1 }} label={t('owner.tenant.periodEnd')} value={form.periodEnd} onChangeText={(v) => set('periodEnd', v)} placeholder="2026-11-30" error={errors.periodEnd} />
        </View>
        <Input label={t('owner.tenant.billingName')} value={form.billingName} onChangeText={(v) => set('billingName', v)} />
        <Input label={t('owner.tenant.billingEmail')} value={form.billingEmail} onChangeText={(v) => set('billingEmail', v)} keyboardType="email-address" autoCapitalize="none" />
        <Input label={t('owner.tenant.billingPhone')} value={form.billingPhone} onChangeText={(v) => set('billingPhone', v)} keyboardType="phone-pad" />
        <Input label={t('owner.tenant.notes')} value={form.notes} onChangeText={(v) => set('notes', v)} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
      </View>
    </Sheet>
  );
}
