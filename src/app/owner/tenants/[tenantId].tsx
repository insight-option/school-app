import React, { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, ConfirmSheet, EmptyState, Input, KeyValue, ListItem, Screen, SectionHeader, Skeleton, SwitchRow, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import {
  useBusinessBookings,
  useBusinessVenues,
  useDeleteTenant,
  useOwnerBusinesses,
  useOwnerSchools,
  useSetBusinessListed,
  useSetBusinessVerified,
  useSetSchoolListed,
  useSetTenantStatus,
  useSetVenueFeatured,
  useSubscriptions,
  useTenantInvoices,
  useTenantPeople,
  type TenantType,
} from '../../../features/owner';
import { BOOKING_TONE, formatMoney } from '../../../features/platform';
import { formatDate } from '../../../lib/util/format';
import { INVOICE_TONE, IconTile, SUB_TONE, TenantLogo } from '../../../components/owner/kit';
import { SubscriptionSheet } from '../../../components/owner/SubscriptionSheet';

/** One school or business: listing, subscription, invoices, venues / people, suspend & delete. */
export default function OwnerTenantDetail() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ tenantId: string; type?: string }>();
  const tenantId = String(params.tenantId ?? '');
  const type: TenantType = params.type === 'BUSINESS' || tenantId.startsWith('biz-') ? 'BUSINESS' : 'SCHOOL';
  const lang = i18n.language;

  const schools = useOwnerSchools();
  const businesses = useOwnerBusinesses();
  const subs = useSubscriptions();
  const invoices = useTenantInvoices(tenantId);
  const school = type === 'SCHOOL' ? schools.data?.find((s) => s.schoolId === tenantId) : undefined;
  const business = type === 'BUSINESS' ? businesses.data?.find((b) => b.businessId === tenantId) : undefined;
  const people = useTenantPeople(tenantId, type === 'SCHOOL');
  const venues = useBusinessVenues(type === 'BUSINESS' ? tenantId : null);
  const bookings = useBusinessBookings(type === 'BUSINESS' ? tenantId : null);
  const sub = subs.data?.find((s) => s.tenantId === tenantId) ?? null;

  const setStatus = useSetTenantStatus();
  const del = useDeleteTenant();
  const setVerified = useSetBusinessVerified();
  const setListed = useSetBusinessListed();
  const setSchoolListed = useSetSchoolListed();
  const setFeatured = useSetVenueFeatured();

  const [subOpen, setSubOpen] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  const loading = type === 'SCHOOL' ? schools.isLoading : businesses.isLoading;
  const record = school ?? business;
  const name = record?.name ?? '';
  const status = (school?.status ?? business?.status ?? 'ACTIVE') as 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  const suspended = status === 'SUSPENDED';
  const listed = record?.directory === 'PUBLIC';
  const email = school?.email ?? business?.email ?? null;
  const phone = school?.phone ?? business?.phone ?? null;
  const place = useMemo(
    () => (school ? [school.address, school.city, school.country] : [business?.address, business?.area, business?.city]).filter(Boolean).join(', '),
    [school, business],
  );

  if (loading && !record) {
    return (
      <Screen back title=" " scroll maxWidth={900}>
        <View style={{ gap: 16 }}>
          <Skeleton height={140} radius={24} />
          <Skeleton height={200} radius={24} />
        </View>
      </Screen>
    );
  }
  if (!record) {
    return (
      <Screen back title=" " maxWidth={900}>
        <EmptyState icon="business-outline" title={t('owner.tenant.notFound')} actionLabel={t('common.back')} onAction={() => (router.canGoBack() ? router.back() : router.replace('/owner/tenants' as never))} />
      </Screen>
    );
  }

  const toggleStatus = () =>
    setStatus.mutate(
      { tenantType: type, tenantId, status: suspended ? 'ACTIVE' : 'SUSPENDED' },
      {
        onSuccess: () => {
          toast.success(suspended ? t('owner.tenant.reactivatedToast') : t('owner.tenant.suspendedToast'));
          setStatusConfirm(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );

  const remove = () =>
    del.mutate(
      { tenantType: type, tenantId, confirmName },
      {
        onSuccess: () => {
          toast.success(t('owner.tenant.deleted'));
          setDeleteOpen(false);
          router.replace('/owner/tenants' as never);
        },
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <Screen back title={name} subtitle={t(`owner.tenants.type${type}`)} scroll maxWidth={900}>
      <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.sm }}>
        <Card elevation="raised" style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <TenantLogo logoKey={record.logoKey} name={name} color={record.primaryColor} size={64} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text variant="heading" numberOfLines={2}>
                {name}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Badge label={t(`owner.tenants.type${type}`)} tone="primary" size="sm" />
                <Badge label={t(`owner.tenantStatus.${status}`)} tone={suspended ? 'danger' : 'success'} size="sm" />
                {business?.verified ? <Badge label={t('platform.explore.verified')} tone="info" icon="checkmark-circle" size="sm" /> : null}
              </View>
            </View>
          </View>
          {place ? <KeyValue label={t('owner.tenant.location')} value={place} /> : null}
          {email ? <KeyValue label={t('common.email')} value={email} /> : null}
          {phone ? <KeyValue label={t('common.phone')} value={phone} /> : null}
          {record.createdAt ? <KeyValue label={t('owner.tenants.joined', { date: '' }).trim()} value={formatDate(record.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })} /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {email ? <Button title={t('common.email')} icon="mail-outline" variant="outline" size="sm" onPress={() => void Linking.openURL(`mailto:${email}`)} /> : null}
            {phone ? <Button title={t('common.call')} icon="call-outline" variant="outline" size="sm" onPress={() => void Linking.openURL(`tel:${phone}`)} /> : null}
            {type === 'SCHOOL' ? (
              <Button title={t('owner.tenant.viewPublic')} icon="open-outline" variant="secondary" size="sm" onPress={() => router.push(`/schools/${tenantId}` as never)} />
            ) : (
              <Button title={t('owner.tenant.viewPublic')} icon="open-outline" variant="secondary" size="sm" onPress={() => router.push(`/businesses/${tenantId}` as never)} />
            )}
          </View>
        </Card>

        {/* Subscription */}
        <SectionHeader title={t('owner.tenant.subscription')} action={sub ? t('common.edit') : undefined} onAction={() => setSubOpen(true)} />
        {sub ? (
          <Card style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <IconTile icon="card" color={theme.colors.primary} size={44} />
              <View style={{ flex: 1 }}>
                <Text variant="subheading">{sub.planName || t('owner.tenant.customPlan')}</Text>
                <Text variant="caption" color="textMuted">
                  {sub.status === 'TRIAL' && sub.trialEndsAt
                    ? t('owner.tenant.trialUntil', { date: formatDate(sub.trialEndsAt) })
                    : sub.currentPeriodEnd
                      ? t('owner.tenant.renewsOn', { date: formatDate(sub.currentPeriodEnd) })
                      : t(`owner.cycle.${sub.cycle ?? 'MONTHLY'}`)}
                </Text>
              </View>
              <Badge label={t(`owner.subStatus.${sub.status}`)} tone={SUB_TONE[sub.status] ?? 'neutral'} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <Text variant="title">{formatMoney(sub.price ?? 0, sub.currency ?? 'QAR', lang)}</Text>
              <Text color="textMuted">{t(`owner.perCycle.${sub.cycle ?? 'MONTHLY'}`)}</Text>
            </View>
            {sub.commissionPercent ? (
              <Text variant="caption" color="textMuted">
                {t('owner.billing.commission', { value: sub.commissionPercent })}
              </Text>
            ) : null}
          </Card>
        ) : (
          <Card tone="warning" style={{ gap: theme.spacing.sm }}>
            <Text variant="bodyStrong">{t('owner.tenant.noSubscription')}</Text>
            <Text variant="caption" color="textMuted">
              {t('owner.tenant.noSubscriptionBody')}
            </Text>
            <Button title={t('owner.tenant.createSubscription')} icon="add" onPress={() => setSubOpen(true)} style={{ alignSelf: 'flex-start' }} size="sm" />
          </Card>
        )}

        {/* Invoices */}
        <SectionHeader
          title={t('owner.tenant.invoices')}
          action={t('owner.tenant.newInvoice')}
          onAction={() => router.push({ pathname: '/owner/billing/invoice', params: { tenantId, type } } as never)}
        />
        <Card padding={0}>
          {invoices.isLoading ? (
            <View style={{ padding: 16 }}>
              <Skeleton height={14} width="60%" />
            </View>
          ) : invoices.data?.length ? (
            invoices.data.slice(0, 8).map((inv, i, arr) => (
              <ListItem
                key={inv.id}
                title={`${inv.number} · ${formatMoney(inv.total, inv.currency ?? 'QAR', lang)}`}
                subtitle={inv.status === 'PAID' && inv.paidAt ? t('owner.billing.paidOn', { date: formatDate(inv.paidAt) }) : inv.dueDate ? t('owner.billing.due', { date: formatDate(inv.dueDate) }) : t('owner.billing.issued', { date: formatDate(inv.issueDate) })}
                right={<Badge label={t(`owner.invoiceStatus.${inv.status}`)} tone={INVOICE_TONE[inv.status] ?? 'neutral'} size="sm" />}
                chevron
                onPress={() => router.push({ pathname: '/owner/billing/invoice', params: { id: inv.id } } as never)}
                style={i === arr.length - 1 ? { borderBottomWidth: 0 } : undefined}
              />
            ))
          ) : (
            <Text color="textMuted" style={{ padding: 16 }}>
              {t('owner.tenant.noInvoices')}
            </Text>
          )}
        </Card>

        {/* Listing / people / venues */}
        {type === 'SCHOOL' ? (
          <>
            <SectionHeader title={t('owner.tenant.people')} />
            <Card style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              {(['students', 'teachers', 'drivers'] as const).map((k) => (
                <View key={k} style={{ alignItems: 'center', gap: 2 }}>
                  {people.data ? <Text variant="title">{people.data[k]}</Text> : <Skeleton width={36} height={26} />}
                  <Text variant="caption" color="textMuted">
                    {t(`owner.tenant.${k}`)}
                  </Text>
                </View>
              ))}
            </Card>
            <Card>
              <SwitchRow
                label={t('owner.tenant.schoolListed')}
                value={listed}
                onValueChange={(v) => setSchoolListed.mutate({ schoolId: tenantId, listed: v }, { onError: (e) => toast.error(e.message) })}
              />
            </Card>
          </>
        ) : (
          <>
            <Card>
              <SwitchRow
                label={t('owner.tenant.listed')}
                description={t('owner.tenant.listedHint')}
                value={listed}
                onValueChange={(v) => setListed.mutate({ businessId: tenantId, listed: v }, { onError: (e) => toast.error(e.message) })}
              />
              <SwitchRow
                label={t('owner.tenant.verified')}
                description={t('owner.tenant.verifiedHint')}
                value={!!business?.verified}
                onValueChange={(v) => setVerified.mutate({ businessId: tenantId, verified: v }, { onError: (e) => toast.error(e.message) })}
              />
            </Card>
            <SectionHeader title={t('owner.tenant.venues')} />
            <Card padding={0}>
              {venues.isLoading ? (
                <View style={{ padding: 16 }}>
                  <Skeleton height={14} width="60%" />
                </View>
              ) : venues.data?.length ? (
                venues.data.map((v, i, arr) => (
                  <View key={v.id} style={[styles.venueRow, { borderBottomColor: theme.colors.border, borderBottomWidth: i === arr.length - 1 ? 0 : StyleSheet.hairlineWidth }]}>
                    <Pressable style={{ flex: 1 }} onPress={() => router.push(`/venues/${v.id}` as never)} accessibilityRole="link">
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {v.name}
                      </Text>
                      <Text variant="caption" color="textMuted" numberOfLines={1}>
                        {[v.area || v.city, v.directory === 'PUBLIC' ? t('owner.tenant.listed') : t('owner.categories.hidden'), t('platform.explore.bookings', { count: v.bookingCount ?? 0 })].filter(Boolean).join(' · ')}
                      </Text>
                    </Pressable>
                    <View style={{ alignItems: 'center' }}>
                      <Text variant="label" color="textMuted">
                        {t('owner.tenant.featured')}
                      </Text>
                      <Switch
                        value={!!v.featured}
                        onValueChange={(val) => setFeatured.mutate({ id: v.id, businessId: tenantId, featured: val }, { onError: (e) => toast.error(e.message) })}
                        trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                        thumbColor="#fff"
                      />
                    </View>
                  </View>
                ))
              ) : (
                <Text color="textMuted" style={{ padding: 16 }}>
                  {t('owner.tenant.noVenues')}
                </Text>
              )}
            </Card>
            <SectionHeader title={t('owner.tenant.recentBookings')} />
            <Card padding={0}>
              {bookings.data?.length ? (
                bookings.data.map((b, i, arr) => (
                  <ListItem
                    key={b.id}
                    title={`${b.venueName ?? ''} · ${formatDate(b.date)} ${b.startTime}`}
                    subtitle={[b.customerName, b.reference, b.price != null ? formatMoney(b.price, b.currency ?? 'QAR', lang) : null].filter(Boolean).join(' · ')}
                    right={<Badge label={t(`platform.bookingStatus.${b.status}`)} tone={BOOKING_TONE[b.status] ?? 'neutral'} size="sm" />}
                    style={i === arr.length - 1 ? { borderBottomWidth: 0 } : undefined}
                  />
                ))
              ) : (
                <Text color="textMuted" style={{ padding: 16 }}>
                  {bookings.isLoading ? '…' : t('owner.tenant.noBookings')}
                </Text>
              )}
            </Card>
          </>
        )}

        {/* Danger zone */}
        <SectionHeader title={t('owner.tenant.actions')} />
        <Card style={{ gap: theme.spacing.md }}>
          <Button
            title={suspended ? t('owner.tenant.reactivate') : t('owner.tenant.suspend')}
            icon={suspended ? 'play-circle-outline' : 'pause-circle-outline'}
            variant={suspended ? 'success' : 'outline'}
            onPress={() => setStatusConfirm(true)}
            fullWidth
          />
          <Button title={t('owner.tenant.delete')} icon="trash-outline" variant="danger" onPress={() => setDeleteOpen(true)} fullWidth />
        </Card>
      </View>

      <SubscriptionSheet visible={subOpen} onClose={() => setSubOpen(false)} tenant={{ id: tenantId, type, name, email, phone }} existing={sub} />

      <ConfirmSheet
        visible={statusConfirm}
        title={suspended ? t('owner.tenant.reactivateTitle', { name }) : t('owner.tenant.suspendTitle', { name })}
        body={suspended ? t('owner.tenant.reactivateBody') : t('owner.tenant.suspendBody')}
        confirmLabel={suspended ? t('owner.tenant.reactivate') : t('owner.tenant.suspend')}
        cancelLabel={t('common.cancel')}
        destructive={!suspended}
        loading={setStatus.isPending}
        onCancel={() => setStatusConfirm(false)}
        onConfirm={toggleStatus}
      />

      <ConfirmSheet
        visible={deleteOpen}
        title={t('owner.tenant.deleteTitle', { name })}
        body={t('owner.tenant.deleteBody')}
        confirmLabel={t('owner.tenant.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={del.isPending}
        onCancel={() => {
          setDeleteOpen(false);
          setConfirmName('');
        }}
        onConfirm={() => {
          if (confirmName.trim().toLowerCase() !== name.trim().toLowerCase()) {
            toast.error(t('owner.tenant.deleteType'));
            return;
          }
          remove();
        }}
      >
        <View style={[styles.warn, { backgroundColor: theme.colors.dangerSoft, borderRadius: theme.radius.md }]}>
          <Ionicons name="warning" size={18} color={theme.colors.danger} />
          <Text variant="captionStrong" color="danger" style={{ flex: 1 }}>
            {name}
          </Text>
        </View>
        <Input label={t('owner.tenant.deleteType')} value={confirmName} onChangeText={setConfirmName} autoCapitalize="none" autoCorrect={false} placeholder={name} />
      </ConfirmSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, marginBottom: 12 },
});
