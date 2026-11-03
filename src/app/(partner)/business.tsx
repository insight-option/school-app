import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Button, Input, Screen, SkeletonCard, SwitchRow, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { ChipSelect, FieldLabel, FormSection, ImageField, LocationField } from '../../components/partner/fields';
import { useMyBusiness, useSaveBusinessProfile, type BusinessPayload } from '../../features/partner';
import { activeCategories, categoryName, useCategories } from '../../features/platform';
import type { Business } from '../../lib/data/client';
import type { LatLng } from '../../lib/geo';
import { haptic } from '../../lib/util/device';

type Draft = {
  name: string;
  listed: boolean;
  tagline: string;
  description: string;
  logoKey: string | null;
  coverKey: string | null;
  categoryIds: string[];
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  instagram: string;
  city: string;
  area: string;
  address: string;
  location: LatLng | null;
};

const draftOf = (b: Business): Draft => ({
  name: b.name,
  listed: b.directory === 'PUBLIC',
  tagline: b.tagline ?? '',
  description: b.description ?? '',
  logoKey: b.logoKey ?? null,
  coverKey: b.coverKey ?? null,
  categoryIds: (b.categoryIds ?? []).filter((c): c is string => !!c),
  phone: b.phone ?? '',
  whatsapp: b.whatsapp ?? '',
  email: b.email ?? '',
  website: b.website ?? '',
  instagram: b.instagram ?? '',
  city: b.city ?? '',
  area: b.area ?? '',
  address: b.address ?? '',
  location: b.location ? { lat: b.location.lat, lng: b.location.lng } : null,
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The public business profile customers see (Explore, business page, venue pages). */
export default function PartnerBusiness() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors, spacing } = theme;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const business = useMyBusiness();
  const categories = useCategories();
  const save = useSaveBusinessProfile();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [dirty, setDirty] = useState(false);

  const stamp = business.data ? `${business.data.businessId}:${business.data.updatedAt ?? ''}` : null;
  if (stamp && stamp !== loadedAt && !dirty) {
    setLoadedAt(stamp);
    setDraft(draftOf(business.data!));
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
    setDirty(true);
  };

  const submit = () => {
    if (!draft) return;
    const e: typeof errors = {};
    if (draft.name.trim().length < 2) e.name = t('partner.requiredField');
    if (draft.email.trim() && !EMAIL.test(draft.email.trim())) e.email = t('partner.invalidEmail');
    setErrors(e);
    if (Object.keys(e).length) return;
    const payload: BusinessPayload = {
      name: draft.name.trim(),
      listed: draft.listed,
      tagline: draft.tagline.trim(),
      description: draft.description.trim(),
      logoKey: draft.logoKey ?? '',
      coverKey: draft.coverKey ?? '',
      categoryIds: draft.categoryIds,
      phone: draft.phone.trim(),
      whatsapp: draft.whatsapp.trim(),
      email: draft.email.trim(),
      website: draft.website.trim(),
      instagram: draft.instagram.trim(),
      city: draft.city.trim(),
      area: draft.area.trim(),
      address: draft.address.trim(),
      lat: draft.location?.lat ?? null,
      lng: draft.location?.lng ?? null,
    };
    save.mutate(payload, {
      onSuccess: () => {
        haptic('success');
        setDirty(false);
        toast.success(t('partner.business.saved'));
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const arabic = i18n.language === 'ar';
  const catOptions = activeCategories(categories.data, 'ACTIVITY').map((c) => ({ value: c.id, label: categoryName(c, arabic), icon: (c.icon || undefined) as never }));

  return (
    <Screen
      title={t('partner.business.title')}
      subtitle={t('partner.business.subtitle')}
      padded={false}
      keyboard
      right={business.data ? <Button title={t('partner.publicPage')} icon="open-outline" variant="outline" size="sm" onPress={() => router.push(`/businesses/${business.data!.businessId}` as never)} /> : undefined}
    >
      {!draft ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={6} />
        </View>
      ) : (
        <>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.lg, width: '100%', maxWidth: 820, alignSelf: 'center' }}>
            <View style={styles.statusRow}>
              <Badge
                label={business.data?.verified ? t('partner.business.verified') : t('partner.business.notVerified')}
                tone={business.data?.verified ? 'success' : 'neutral'}
                icon={business.data?.verified ? 'shield-checkmark' : 'shield-outline'}
              />
              <Badge label={draft.listed ? t('partner.venues.listed') : t('partner.venues.hidden')} tone={draft.listed ? 'primary' : 'warning'} icon={draft.listed ? 'eye-outline' : 'eye-off-outline'} />
            </View>

            <FormSection title={t('partner.business.about')} icon="storefront-outline">
              <FieldLabel>{t('partner.business.cover')}</FieldLabel>
              <ImageField shape="wide" value={draft.coverKey} onChange={(k) => set('coverKey', k)} uploadLabel={t('partner.business.upload')} changeLabel={t('partner.business.change')} removeLabel={t('partner.business.remove')} />
              <FieldLabel>{t('partner.business.logo')}</FieldLabel>
              <ImageField value={draft.logoKey} onChange={(k) => set('logoKey', k)} uploadLabel={t('partner.business.upload')} changeLabel={t('partner.business.change')} removeLabel={t('partner.business.remove')} placeholderIcon="business-outline" />
              <Input label={t('partner.business.name')} required value={draft.name} onChangeText={(v) => set('name', v)} error={errors.name} maxLength={120} />
              <Input label={t('partner.business.tagline')} placeholder={t('partner.business.taglinePlaceholder')} value={draft.tagline} onChangeText={(v) => set('tagline', v)} maxLength={160} />
              <Input label={t('partner.business.description')} placeholder={t('partner.business.descriptionPlaceholder')} value={draft.description} onChangeText={(v) => set('description', v)} multiline maxLength={4000} style={{ minHeight: 110, textAlignVertical: 'top' }} />
              <SwitchRow label={t('partner.business.listed')} description={t('partner.business.listedHint')} value={draft.listed} onValueChange={(v) => set('listed', v)} />
            </FormSection>

            <FormSection title={t('partner.business.categories')} icon="grid-outline">
              {catOptions.length ? (
                <ChipSelect options={catOptions} value={draft.categoryIds} onChange={(v) => set('categoryIds', v)} />
              ) : (
                <Text variant="caption" color="textMuted">
                  {t('partner.onboarding.noCategories')}
                </Text>
              )}
            </FormSection>

            <FormSection title={t('partner.business.contact')} icon="call-outline">
              <View style={styles.two}>
                <Input label={t('partner.business.phone')} value={draft.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" leftIcon="call-outline" containerStyle={styles.flex} />
                <Input label={t('partner.business.whatsapp')} value={draft.whatsapp} onChangeText={(v) => set('whatsapp', v)} keyboardType="phone-pad" leftIcon="logo-whatsapp" containerStyle={styles.flex} />
              </View>
              <Input label={t('partner.business.email')} value={draft.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" leftIcon="mail-outline" error={errors.email} />
              <View style={styles.two}>
                <Input label={t('partner.business.website')} value={draft.website} onChangeText={(v) => set('website', v)} autoCapitalize="none" keyboardType="url" leftIcon="globe-outline" containerStyle={styles.flex} />
                <Input label={t('partner.business.instagram')} placeholder={t('partner.business.instagramPlaceholder')} value={draft.instagram} onChangeText={(v) => set('instagram', v)} autoCapitalize="none" leftIcon="logo-instagram" containerStyle={styles.flex} />
              </View>
            </FormSection>

            <FormSection title={t('partner.business.location')} icon="location-outline">
              <LocationField
                value={draft.location}
                address={draft.address}
                onChange={(v) => {
                  set('location', { lat: v.lat, lng: v.lng });
                  if (v.address && !draft.address) set('address', v.address);
                }}
                setLabel={t('partner.business.setLocation')}
                changeLabel={t('partner.business.changeLocation')}
                emptyLabel={t('partner.business.noLocation')}
              />
              <View style={styles.two}>
                <Input label={t('partner.business.area')} value={draft.area} onChangeText={(v) => set('area', v)} containerStyle={styles.flex} />
                <Input label={t('partner.business.city')} value={draft.city} onChangeText={(v) => set('city', v)} containerStyle={styles.flex} />
              </View>
              <Input label={t('partner.business.address')} value={draft.address} onChangeText={(v) => set('address', v)} multiline maxLength={300} />
            </FormSection>
          </ScrollView>
          <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }, theme.shadow.sheet]}>
            <View style={styles.footerInner}>
              {dirty ? <Ionicons name="ellipse" size={10} color={colors.warning} /> : null}
              <Button title={t('partner.business.save')} icon="checkmark" size="lg" loading={save.isPending} onPress={submit} style={{ flex: 1 }} />
            </View>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  two: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  flex: { flexGrow: 1, flexBasis: 200 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, paddingHorizontal: 16 },
  footerInner: { width: '100%', maxWidth: 820, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 10 },
});
