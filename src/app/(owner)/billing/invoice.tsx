import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, Chip, ConfirmSheet, Divider, EmptyState, Input, KeyValue, Screen, Select, Sheet, Skeleton, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import {
  invoiceTotals,
  nextInvoiceNumber,
  parseInvoiceItems,
  useInvoices,
  useSaveInvoice,
  useSetInvoiceStatus,
  useSubscriptions,
  useTenants,
  type InvoiceItem,
  type TenantType,
} from '../../../features/owner';
import { formatMoney, qatarNow } from '../../../features/platform';
import { addDays, formatDate, formatDateTime } from '../../../lib/util/format';
import type { Invoice } from '../../../lib/data/client';
import { INVOICE_TONE, TenantLogo, YMD, parseAmount } from '../../../components/owner/kit';

const METHODS = ['BANK_TRANSFER', 'CASH', 'CARD', 'OTHER'] as const;

/** Create / edit (drafts) / view an invoice; record payments and void. */
export default function OwnerInvoice() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; tenantId?: string; type?: string }>();
  const invoices = useInvoices();
  const id = params.id ? String(params.id) : null;
  const existing = id ? invoices.data?.find((i) => i.id === id) : undefined;
  const [editing, setEditing] = useState(!id);

  // New invoices wait for the list too: the next number is derived from the existing ones.
  if (invoices.isLoading && !existing) {
    return (
      <Screen back title=" " scroll maxWidth={820}>
        <Skeleton height={220} radius={24} />
      </Screen>
    );
  }
  if (id && !existing) {
    return (
      <Screen back title=" " maxWidth={820}>
        <EmptyState icon="receipt-outline" title={t('owner.invoice.notFound')} actionLabel={t('common.back')} onAction={() => (router.canGoBack() ? router.back() : router.replace('/(owner)/billing' as never))} />
      </Screen>
    );
  }
  if (existing && !editing) return <InvoiceView invoice={existing} onEdit={() => setEditing(true)} />;
  return (
    <InvoiceForm
      key={existing?.id ?? 'new'}
      initial={existing ?? null}
      defaultTenant={params.tenantId ? { id: String(params.tenantId), type: (params.type === 'BUSINESS' ? 'BUSINESS' : 'SCHOOL') as TenantType } : null}
      existingNumbers={invoices.data ?? []}
    />
  );
}

type ItemDraft = { description: string; quantity: string; unitPrice: string };

function InvoiceForm({ initial, defaultTenant, existingNumbers }: { initial: Invoice | null; defaultTenant: { id: string; type: TenantType } | null; existingNumbers: Invoice[] }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const tenants = useTenants();
  const subs = useSubscriptions();
  const save = useSaveInvoice();
  const today = qatarNow().date;
  const [form, setForm] = useState(() => ({
    tenant: initial ? `${initial.tenantType}:${initial.tenantId}` : defaultTenant ? `${defaultTenant.type}:${defaultTenant.id}` : '',
    number: initial?.number ?? nextInvoiceNumber(existingNumbers, Number(today.slice(0, 4))),
    issueDate: initial?.issueDate ?? today,
    dueDate: initial?.dueDate ?? addDays(today, 14),
    periodStart: initial?.periodStart ?? '',
    periodEnd: initial?.periodEnd ?? '',
    currency: initial?.currency ?? 'QAR',
    discount: initial?.discount ? String(initial.discount) : '',
    taxPercent: initial?.tax && initial.subtotal ? String(Math.round((initial.tax / Math.max(1, initial.subtotal - (initial.discount ?? 0))) * 10000) / 100) : '',
    notes: initial?.notes ?? '',
  }));
  const [items, setItems] = useState<ItemDraft[]>(() => {
    const parsed = initial ? parseInvoiceItems(initial.items) : [];
    return parsed.length ? parsed.map((i) => ({ description: i.description, quantity: String(i.quantity), unitPrice: String(i.unitPrice) })) : [{ description: '', quantity: '1', unitPrice: '' }];
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const tenantOptions = tenants.rows.map((r) => ({ value: `${r.type}:${r.id}`, label: r.name, subtitle: t(`owner.tenants.type${r.type}`) }));
  const selected = tenants.rows.find((r) => `${r.type}:${r.id}` === form.tenant);
  const sub = selected ? subs.data?.find((s) => s.tenantId === selected.id) : undefined;

  const parsedItems: InvoiceItem[] = useMemo(
    () =>
      items
        .map((i) => {
          const quantity = parseAmount(i.quantity) ?? 1;
          const unitPrice = parseAmount(i.unitPrice) ?? 0;
          return { description: i.description.trim(), quantity: Number.isFinite(quantity) ? quantity : 0, unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0, total: 0 };
        })
        .map((i) => ({ ...i, total: Math.round(i.quantity * i.unitPrice * 100) / 100 })),
    [items],
  );
  const discount = parseAmount(form.discount) ?? 0;
  const taxPercent = parseAmount(form.taxPercent) ?? 0;
  const totals = invoiceTotals(parsedItems, Number.isFinite(discount) ? discount : 0, Number.isFinite(taxPercent) ? taxPercent : 0);
  const money = (v: number) => formatMoney(v, form.currency || 'QAR', i18n.language);

  const fromSubscription = () => {
    if (!sub) return;
    setForm((f) => ({ ...f, currency: sub.currency ?? f.currency, periodStart: sub.currentPeriodStart ?? f.periodStart, periodEnd: sub.currentPeriodEnd ?? f.periodEnd }));
    setItems([{ description: `${sub.planName || t('owner.tenant.subscription')} – ${t(`owner.cycle.${sub.cycle ?? 'MONTHLY'}`)}`, quantity: '1', unitPrice: String(sub.price ?? 0) }]);
  };

  const submit = (status: 'DRAFT' | 'ISSUED') => {
    const e: Record<string, string> = {};
    if (!selected) e.tenant = t('owner.invoice.errorTenant');
    const valid = parsedItems.filter((i) => i.description && i.quantity > 0);
    if (!valid.length || totals.subtotal <= 0) e.items = t('owner.invoice.errorItems');
    for (const k of ['issueDate', 'dueDate', 'periodStart', 'periodEnd'] as const) if (form[k] && !YMD.test(form[k])) e[k] = t('owner.invoice.errorDate');
    if (!form.issueDate) e.issueDate = t('owner.invoice.errorDate');
    setErrors(e);
    if (Object.keys(e).length || !selected) return;
    save.mutate(
      {
        id: initial?.id,
        number: form.number.trim() || nextInvoiceNumber(existingNumbers, Number(today.slice(0, 4))),
        tenantId: selected.id,
        tenantType: selected.type,
        tenantName: selected.name,
        issueDate: form.issueDate,
        dueDate: form.dueDate || null,
        periodStart: form.periodStart || null,
        periodEnd: form.periodEnd || null,
        items: valid,
        subtotal: totals.subtotal,
        discount: Number.isFinite(discount) ? discount : 0,
        tax: totals.tax,
        total: totals.total,
        currency: form.currency || 'QAR',
        status,
        notes: form.notes.trim() || null,
        paidAt: null,
        paymentMethod: null,
        paymentReference: null,
      },
      {
        onSuccess: () => {
          toast.success(t('owner.invoice.saved'));
          if (router.canGoBack()) router.back();
          else router.replace('/(owner)/billing' as never);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Screen back title={initial ? t('owner.invoice.editTitle', { number: initial.number }) : t('owner.invoice.newTitle')} scroll keyboard maxWidth={820}>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.sm }}>
        <Card style={{ gap: theme.spacing.md }}>
          <Select label={t('owner.invoice.tenant')} placeholder={t('owner.invoice.chooseTenant')} options={tenantOptions} value={form.tenant || null} onChange={(v) => set('tenant', (v as string) ?? '')} searchable required error={errors.tenant} />
          {sub ? <Button title={t('owner.invoice.fromSubscription')} icon="sync-outline" variant="secondary" size="sm" onPress={fromSubscription} style={{ alignSelf: 'flex-start' }} /> : null}
          <View style={styles.row2}>
            <Input containerStyle={styles.flex} label={t('owner.invoice.number')} value={form.number} onChangeText={(v) => set('number', v)} autoCapitalize="characters" />
            <Input containerStyle={{ width: 110 }} label={t('owner.invoice.currency')} value={form.currency} onChangeText={(v) => set('currency', v.toUpperCase())} autoCapitalize="characters" maxLength={3} />
          </View>
          <View style={styles.row2}>
            <Input containerStyle={styles.flex} label={t('owner.invoice.issueDate')} value={form.issueDate} onChangeText={(v) => set('issueDate', v)} error={errors.issueDate} />
            <Input containerStyle={styles.flex} label={t('owner.invoice.dueDate')} value={form.dueDate} onChangeText={(v) => set('dueDate', v)} error={errors.dueDate} />
          </View>
          <View style={styles.row2}>
            <Input containerStyle={styles.flex} label={t('owner.invoice.periodStart')} value={form.periodStart} onChangeText={(v) => set('periodStart', v)} placeholder="2026-11-01" error={errors.periodStart} />
            <Input containerStyle={styles.flex} label={t('owner.invoice.periodEnd')} value={form.periodEnd} onChangeText={(v) => set('periodEnd', v)} placeholder="2026-11-30" error={errors.periodEnd} />
          </View>
        </Card>

        <Card style={{ gap: theme.spacing.md }}>
          <Text variant="subheading">{t('owner.invoice.items')}</Text>
          {items.map((it, idx) => (
            <View key={idx} style={{ gap: 8, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <Input containerStyle={styles.flex} label={t('owner.invoice.description')} value={it.description} onChangeText={(v) => setItems((all) => all.map((x, i) => (i === idx ? { ...x, description: v } : x)))} />
                {items.length > 1 ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={t('owner.invoice.removeItem')} onPress={() => setItems((all) => all.filter((_, i) => i !== idx))} hitSlop={8} style={[styles.remove, { backgroundColor: theme.colors.dangerSoft }]}>
                    <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.row2}>
                <Input containerStyle={{ width: 90 }} label={t('owner.invoice.quantity')} value={it.quantity} onChangeText={(v) => setItems((all) => all.map((x, i) => (i === idx ? { ...x, quantity: v } : x)))} keyboardType="decimal-pad" />
                <Input containerStyle={styles.flex} label={t('owner.invoice.unitPrice')} value={it.unitPrice} onChangeText={(v) => setItems((all) => all.map((x, i) => (i === idx ? { ...x, unitPrice: v } : x)))} keyboardType="decimal-pad" />
                <View style={{ justifyContent: 'flex-end', paddingBottom: 14, minWidth: 90, alignItems: 'flex-end' }}>
                  <Text variant="bodyStrong">{money(parsedItems[idx]?.total ?? 0)}</Text>
                </View>
              </View>
            </View>
          ))}
          {errors.items ? (
            <Text variant="caption" color="danger">
              {errors.items}
            </Text>
          ) : null}
          <Button title={t('owner.invoice.addItem')} icon="add" variant="ghost" size="sm" onPress={() => setItems((all) => [...all, { description: '', quantity: '1', unitPrice: '' }])} style={{ alignSelf: 'flex-start' }} />
          <View style={styles.row2}>
            <Input containerStyle={styles.flex} label={t('owner.invoice.discount')} value={form.discount} onChangeText={(v) => set('discount', v)} keyboardType="decimal-pad" />
            <Input containerStyle={styles.flex} label={t('owner.invoice.taxPercent')} value={form.taxPercent} onChangeText={(v) => set('taxPercent', v)} keyboardType="decimal-pad" />
          </View>
          <Divider />
          <KeyValue label={t('owner.invoice.subtotal')} value={money(totals.subtotal)} />
          {discount ? <KeyValue label={t('owner.invoice.discount')} value={`− ${money(discount)}`} /> : null}
          {totals.tax ? <KeyValue label={t('owner.invoice.tax')} value={money(totals.tax)} /> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
            <Text variant="subheading">{t('owner.invoice.total')}</Text>
            <Text variant="title" color="primary">
              {money(totals.total)}
            </Text>
          </View>
        </Card>

        <Input label={t('owner.invoice.notes')} value={form.notes} onChangeText={(v) => set('notes', v)} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />

        <View style={styles.row2}>
          <Button title={t('owner.invoice.saveDraft')} variant="outline" onPress={() => submit('DRAFT')} loading={save.isPending && save.variables?.status === 'DRAFT'} style={styles.flex} />
          <Button title={t('owner.invoice.issue')} icon="send" onPress={() => submit('ISSUED')} loading={save.isPending && save.variables?.status === 'ISSUED'} style={styles.flex} />
        </View>
      </View>
    </Screen>
  );
}

function InvoiceView({ invoice: inv, onEdit }: { invoice: Invoice; onEdit: () => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const setStatus = useSetInvoiceStatus();
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<(typeof METHODS)[number]>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [voidOpen, setVoidOpen] = useState(false);
  const items = parseInvoiceItems(inv.items);
  const money = (v: number) => formatMoney(v, inv.currency ?? 'QAR', i18n.language);
  const today = qatarNow().date;
  const status = inv.status === 'ISSUED' && inv.dueDate && inv.dueDate < today ? 'OVERDUE' : inv.status;
  const open = inv.status === 'ISSUED' || inv.status === 'OVERDUE';

  const change = (next: 'PAID' | 'VOID' | 'ISSUED' | 'OVERDUE', msg: string, extra?: { paymentMethod?: string; paymentReference?: string }) =>
    setStatus.mutate(
      { id: inv.id, status: next, ...extra },
      {
        onSuccess: () => {
          toast.success(msg);
          setPayOpen(false);
          setVoidOpen(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <Screen back title={inv.number} subtitle={inv.tenantName} scroll maxWidth={820}>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.sm }}>
        <Card elevation="raised" style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <TenantLogo name={inv.tenantName} size={52} />
            <View style={{ flex: 1 }}>
              <Text variant="subheading" numberOfLines={1}>
                {inv.tenantName}
              </Text>
              <Text variant="caption" color="textMuted">
                {t(`owner.tenants.type${inv.tenantType === 'BUSINESS' ? 'BUSINESS' : 'SCHOOL'}`)}
              </Text>
            </View>
            <Badge label={t(`owner.invoiceStatus.${status}`)} tone={INVOICE_TONE[status] ?? 'neutral'} />
          </View>
          <Text variant="hero" color={status === 'PAID' ? 'success' : 'text'}>
            {money(inv.total)}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg }}>
            <Meta label={t('owner.invoice.issueDate').replace(/\s*\(.*\)/, '')} value={formatDate(inv.issueDate, { day: 'numeric', month: 'short', year: 'numeric' })} />
            {inv.dueDate ? <Meta label={t('owner.invoice.dueDate').replace(/\s*\(.*\)/, '')} value={formatDate(inv.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })} /> : null}
            {inv.periodStart && inv.periodEnd ? <Meta label={t('owner.invoice.periodStart').replace(/\s*\(.*\)/, '')} value={`${formatDate(inv.periodStart)} – ${formatDate(inv.periodEnd)}`} /> : null}
          </View>
        </Card>

        <Card style={{ gap: theme.spacing.sm }}>
          <Text variant="subheading">{t('owner.invoice.items')}</Text>
          {items.map((i, idx) => (
            <View key={idx} style={{ flexDirection: 'row', gap: 12, paddingVertical: 6 }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{i.description}</Text>
                <Text variant="caption" color="textMuted">
                  {i.quantity} × {money(i.unitPrice)}
                </Text>
              </View>
              <Text variant="bodyStrong">{money(i.total || i.quantity * i.unitPrice)}</Text>
            </View>
          ))}
          <Divider />
          <KeyValue label={t('owner.invoice.subtotal')} value={money(inv.subtotal ?? inv.total)} />
          {inv.discount ? <KeyValue label={t('owner.invoice.discount')} value={`− ${money(inv.discount)}`} /> : null}
          {inv.tax ? <KeyValue label={t('owner.invoice.tax')} value={money(inv.tax)} /> : null}
          <KeyValue label={t('owner.invoice.total')} value={money(inv.total)} />
        </Card>

        {inv.status === 'PAID' ? (
          <Card tone="success" style={{ gap: 4 }}>
            <Text variant="subheading">{t('owner.invoice.paymentInfo')}</Text>
            <Text color="textMuted">
              {[inv.paidAt ? formatDateTime(inv.paidAt) : null, inv.paymentMethod ? t(`owner.paymentMethod.${inv.paymentMethod}`) : null, inv.paymentReference].filter(Boolean).join(' · ')}
            </Text>
          </Card>
        ) : null}
        {inv.notes ? (
          <Card>
            <Text color="textMuted">{inv.notes}</Text>
          </Card>
        ) : null}

        <View style={{ gap: theme.spacing.sm }}>
          {inv.status === 'DRAFT' ? (
            <>
              <Button title={t('owner.invoice.issue')} icon="send" onPress={() => change('ISSUED', t('owner.invoice.saved'))} loading={setStatus.isPending} fullWidth />
              <Button title={t('common.edit')} icon="create-outline" variant="outline" onPress={onEdit} fullWidth />
            </>
          ) : null}
          {open ? <Button title={t('owner.invoice.markPaid')} icon="checkmark-done" variant="success" onPress={() => setPayOpen(true)} fullWidth size="lg" /> : null}
          {inv.status === 'ISSUED' && status === 'OVERDUE' ? (
            <Button title={t('owner.invoice.markOverdue')} icon="alert-circle-outline" variant="outline" onPress={() => change('OVERDUE', t('owner.invoice.saved'))} fullWidth />
          ) : null}
          {inv.status !== 'VOID' && inv.status !== 'PAID' ? <Button title={t('owner.invoice.void')} icon="close-circle-outline" variant="ghost" onPress={() => setVoidOpen(true)} /> : null}
        </View>
      </View>

      <Sheet
        visible={payOpen}
        onClose={() => setPayOpen(false)}
        title={t('owner.invoice.markPaidTitle')}
        footer={
          <Button
            title={t('owner.invoice.markPaid')}
            variant="success"
            onPress={() => change('PAID', t('owner.invoice.markedPaid'), { paymentMethod: method, paymentReference: reference.trim() || undefined })}
            loading={setStatus.isPending}
            fullWidth
            size="lg"
          />
        }
      >
        <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
          <Text variant="title">{money(inv.total)}</Text>
          <Text variant="captionStrong" color="textMuted">
            {t('owner.invoice.paymentMethod')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {METHODS.map((m) => (
              <Chip key={m} label={t(`owner.paymentMethod.${m}`)} selected={method === m} onPress={() => setMethod(m)} />
            ))}
          </View>
          <Input label={t('owner.invoice.paymentReference')} value={reference} onChangeText={setReference} />
        </View>
      </Sheet>

      <ConfirmSheet
        visible={voidOpen}
        title={t('owner.invoice.voidTitle')}
        body={t('owner.invoice.voidBody')}
        confirmLabel={t('owner.invoice.void')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={setStatus.isPending}
        onCancel={() => setVoidOpen(false)}
        onConfirm={() => change('VOID', t('owner.invoice.voided'))}
      />
    </Screen>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="overline" color="textFaint">
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row2: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  remove: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
