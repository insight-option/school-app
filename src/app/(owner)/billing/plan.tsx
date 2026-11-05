import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Chip, ConfirmSheet, Input, Screen, Skeleton, SwitchRow, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { useDeletePlan, usePlans, useSavePlan } from '../../../features/owner';
import type { Plan } from '../../../lib/data/client';
import { parseAmount } from '../../../components/owner/kit';

const TYPES = ['SCHOOL', 'BUSINESS', 'ANY'] as const;

/** Create or edit a billing plan. */
export default function OwnerPlan() {
  const params = useLocalSearchParams<{ id?: string }>();
  const plans = usePlans();
  const id = params.id ? String(params.id) : null;
  const existing = id ? plans.data?.find((p) => p.id === id) : undefined;
  if (id && plans.isLoading && !existing) {
    return (
      <Screen back title=" " scroll maxWidth={760}>
        <Skeleton height={320} radius={24} />
      </Screen>
    );
  }
  return <PlanForm key={existing?.id ?? 'new'} initial={existing ?? null} nextOrder={(plans.data?.length ?? 0) + 1} />;
}

function PlanForm({ initial, nextOrder }: { initial: Plan | null; nextOrder: number }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const save = useSavePlan();
  const del = useDeletePlan();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState(() => ({
    name: initial?.name ?? '',
    nameAr: initial?.nameAr ?? '',
    tenantType: (TYPES.includes(initial?.tenantType as (typeof TYPES)[number]) ? initial?.tenantType : 'ANY') as (typeof TYPES)[number],
    priceMonthly: initial?.priceMonthly != null ? String(initial.priceMonthly) : '',
    priceYearly: initial?.priceYearly != null ? String(initial.priceYearly) : '',
    currency: initial?.currency ?? 'QAR',
    commission: initial?.commissionPercent != null ? String(initial.commissionPercent) : '',
    features: (initial?.features ?? []).filter(Boolean).join('\n'),
    featuresAr: (initial?.featuresAr ?? []).filter(Boolean).join('\n'),
    trialDays: initial?.trialDays != null ? String(initial.trialDays) : '30',
    active: initial?.active !== false,
    highlight: !!initial?.highlight,
    order: String(initial?.order ?? nextOrder),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const e: Record<string, string> = {};
    const nums = {
      priceMonthly: parseAmount(form.priceMonthly),
      priceYearly: parseAmount(form.priceYearly),
      commission: parseAmount(form.commission),
      trialDays: parseAmount(form.trialDays),
      order: parseAmount(form.order),
    };
    if (!form.name.trim()) e.name = t('owner.plan.errorName');
    for (const [k, v] of Object.entries(nums)) if (v !== null && (Number.isNaN(v) || v < 0)) e[k] = t('owner.errors.number');
    setErrors(e);
    if (Object.keys(e).length) return;
    const lines = (s: string) =>
      s
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
    save.mutate(
      {
        id: initial?.id,
        name: form.name.trim(),
        nameAr: form.nameAr.trim() || null,
        tenantType: form.tenantType,
        priceMonthly: nums.priceMonthly ?? 0,
        priceYearly: nums.priceYearly,
        currency: form.currency || 'QAR',
        commissionPercent: nums.commission ?? 0,
        features: lines(form.features),
        featuresAr: lines(form.featuresAr),
        trialDays: nums.trialDays != null ? Math.round(nums.trialDays) : 0,
        active: form.active,
        highlight: form.highlight,
        order: nums.order != null ? Math.round(nums.order) : nextOrder,
      },
      {
        onSuccess: () => {
          toast.success(t('owner.plan.saved'));
          if (router.canGoBack()) router.back();
          else router.replace('/(owner)/billing' as never);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Screen back title={initial ? t('owner.plan.editTitle') : t('owner.plan.newTitle')} scroll keyboard maxWidth={760}>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.sm }}>
        <Card style={{ gap: theme.spacing.md }}>
          <Input label={t('owner.plan.name')} value={form.name} onChangeText={(v) => set('name', v)} required error={errors.name} />
          <Input label={t('owner.plan.nameAr')} value={form.nameAr} onChangeText={(v) => set('nameAr', v)} />
          <View style={{ gap: 8 }}>
            <Text variant="captionStrong" color="textMuted">
              {t('owner.plan.tenantType')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {TYPES.map((tt) => (
                <Chip key={tt} label={t(`owner.billing.planFor.${tt}`)} selected={form.tenantType === tt} onPress={() => set('tenantType', tt)} />
              ))}
            </View>
          </View>
        </Card>
        <Card style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Input containerStyle={{ flex: 1 }} label={t('owner.plan.priceMonthly')} value={form.priceMonthly} onChangeText={(v) => set('priceMonthly', v)} keyboardType="decimal-pad" error={errors.priceMonthly} />
            <Input containerStyle={{ width: 100 }} label={t('owner.plan.currency')} value={form.currency} onChangeText={(v) => set('currency', v.toUpperCase())} autoCapitalize="characters" maxLength={3} />
          </View>
          <Input label={t('owner.plan.priceYearly')} value={form.priceYearly} onChangeText={(v) => set('priceYearly', v)} keyboardType="decimal-pad" error={errors.priceYearly} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Input containerStyle={{ flex: 1 }} label={t('owner.plan.commission')} value={form.commission} onChangeText={(v) => set('commission', v)} keyboardType="decimal-pad" error={errors.commission} />
            <Input containerStyle={{ flex: 1 }} label={t('owner.plan.trialDays')} value={form.trialDays} onChangeText={(v) => set('trialDays', v)} keyboardType="number-pad" error={errors.trialDays} />
          </View>
        </Card>
        <Card style={{ gap: theme.spacing.md }}>
          <Input label={t('owner.plan.features')} value={form.features} onChangeText={(v) => set('features', v)} multiline style={{ minHeight: 110, textAlignVertical: 'top' }} />
          <Input label={t('owner.plan.featuresAr')} value={form.featuresAr} onChangeText={(v) => set('featuresAr', v)} multiline style={{ minHeight: 110, textAlignVertical: 'top' }} />
        </Card>
        <Card>
          <SwitchRow label={t('owner.plan.active')} description={t('owner.plan.activeHint')} value={form.active} onValueChange={(v) => set('active', v)} />
          <SwitchRow label={t('owner.plan.highlight')} value={form.highlight} onValueChange={(v) => set('highlight', v)} />
          <Input label={t('owner.plan.order')} value={form.order} onChangeText={(v) => set('order', v)} keyboardType="number-pad" containerStyle={{ marginTop: 8 }} error={errors.order} />
        </Card>
        <Button title={t('common.save')} icon="checkmark" onPress={submit} loading={save.isPending} fullWidth size="lg" />
        {initial ? <Button title={t('owner.plan.delete')} icon="trash-outline" variant="ghost" onPress={() => setConfirmDelete(true)} /> : null}
      </View>
      {initial ? (
        <ConfirmSheet
          visible={confirmDelete}
          title={t('owner.plan.deleteTitle')}
          body={t('owner.plan.deleteBody')}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          destructive
          loading={del.isPending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() =>
            del.mutate(initial.id, {
              onSuccess: () => {
                toast.success(t('owner.plan.deleted'));
                setConfirmDelete(false);
                if (router.canGoBack()) router.back();
                else router.replace('/(owner)/billing' as never);
              },
              onError: (e) => toast.error(e.message),
            })
          }
        />
      ) : null}
    </Screen>
  );
}
