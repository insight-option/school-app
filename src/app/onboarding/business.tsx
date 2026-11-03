import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Input, Screen, SwitchRow, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { StepDots } from '../../components/setup/StepDots';
import { ChipSelect, FieldLabel, ImageField, LocationField } from '../../components/partner/fields';
import { activeCategories, categoryName, useCategories } from '../../features/platform';
import type { BusinessPayload } from '../../features/partner';
import { client, humanizeError, unwrap } from '../../lib/data/client';
import { refreshSession, signOutEverywhere, useSession } from '../../lib/auth/session';
import { currentLanguage } from '../../lib/i18n';
import { haptic } from '../../lib/util/device';
import type { LatLng } from '../../lib/geo';

type Draft = {
  ownerName: string;
  name: string;
  categoryIds: string[];
  logoKey: string | null;
  location: LatLng | null;
  city: string;
  area: string;
  address: string;
  phone: string;
  whatsapp: string;
  email: string;
  tagline: string;
  description: string;
  coverKey: string | null;
  listed: boolean;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOTAL = 3;

/**
 * "List my business" – for a verified, signed-in account without a workspace:
 * 1. business basics, activities & logo, 2. location & contact, 3. public profile → registerBusiness.
 * The new partner then lands on the partner dashboard.
 */
export default function BusinessSetupScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { colors, spacing } = theme;
  const session = useSession();
  const categories = useCategories();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ ownerName?: string; name?: string; email?: string }>({});
  const [d, setD] = useState<Draft>(() => ({
    ownerName: session.name ?? '',
    name: '',
    categoryIds: [],
    logoKey: null,
    location: null,
    city: 'Doha',
    area: '',
    address: '',
    phone: '',
    whatsapp: '',
    email: session.email ?? '',
    tagline: '',
    description: '',
    coverKey: null,
    listed: true,
  }));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const arabic = i18n.language === 'ar';
  const catOptions = activeCategories(categories.data, 'ACTIVITY').map((c) => ({ value: c.id, label: categoryName(c, arabic), icon: (c.icon || undefined) as never }));

  const next = () => {
    const e: typeof errors = {};
    if (step === 1) {
      if (d.ownerName.trim().length < 2) e.ownerName = t('partner.requiredField');
      if (d.name.trim().length < 2) e.name = t('partner.requiredField');
    }
    if (step === 2 && d.email.trim() && !EMAIL.test(d.email.trim())) e.email = t('partner.invalidEmail');
    setErrors(e);
    if (Object.keys(e).length) return;
    setStep((s) => Math.min(TOTAL, s + 1));
  };

  const create = async () => {
    setBusy(true);
    try {
      const business: BusinessPayload = {
        name: d.name.trim(),
        ownerName: d.ownerName.trim(),
        listed: d.listed,
        categoryIds: d.categoryIds,
        tagline: d.tagline.trim() || null,
        description: d.description.trim() || null,
        logoKey: d.logoKey,
        coverKey: d.coverKey,
        phone: d.phone.trim() || null,
        whatsapp: d.whatsapp.trim() || null,
        email: d.email.trim() || null,
        city: d.city.trim() || null,
        area: d.area.trim() || null,
        address: d.address.trim() || null,
        lat: d.location?.lat ?? null,
        lng: d.location?.lng ?? null,
        language: currentLanguage(),
      };
      unwrap(await client.mutations.registerBusiness({ business: JSON.stringify(business) }), 'business');
      const s = await refreshSession();
      haptic('success');
      toast.success(t('partner.onboarding.created'));
      if (s.role === 'PARTNER') router.replace('/(partner)/dashboard' as never);
    } catch (e) {
      toast.error(humanizeError((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const titles = [t('partner.onboarding.stepBusiness'), t('partner.onboarding.stepLocation'), t('partner.onboarding.stepProfile')];
  const firstName = d.ownerName.trim().split(' ')[0];

  return (
    <Screen
      title={t('partner.onboarding.title')}
      scroll
      keyboard
      maxWidth={640}
      right={
        <Pressable accessibilityRole="button" onPress={() => void signOutEverywhere().then(() => router.replace('/'))} hitSlop={8}>
          <Text variant="captionStrong" color="textMuted">
            {t('partner.onboarding.useAnotherAccount')}
          </Text>
        </Pressable>
      }
    >
      <View style={{ gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.lg }}>
        <StepDots current={step} total={TOTAL} label={`${t('partner.onboarding.stepOf', { current: step, total: TOTAL })} · ${titles[step - 1]}`} />
        {step === 1 ? (
          <>
            <Text variant="title">{t('partner.onboarding.welcome', { name: firstName ? `, ${firstName}` : '' })}</Text>
            <Text color="textMuted">{t('partner.onboarding.intro')}</Text>
          </>
        ) : null}
      </View>

      {step === 1 ? (
        <View style={{ gap: spacing.lg }}>
          <Card style={{ gap: spacing.md }}>
            <FieldLabel>{t('partner.onboarding.logo')}</FieldLabel>
            <ImageField value={d.logoKey} onChange={(k) => set('logoKey', k)} uploadLabel={t('partner.onboarding.uploadLogo')} changeLabel={t('partner.onboarding.changeLogo')} placeholderIcon="business-outline" />
            <Input label={t('partner.onboarding.yourName')} required value={d.ownerName} onChangeText={(v) => set('ownerName', v)} autoCapitalize="words" error={errors.ownerName} />
            <Input
              label={t('partner.onboarding.businessName')}
              required
              placeholder={t('partner.onboarding.businessNamePlaceholder')}
              value={d.name}
              onChangeText={(v) => set('name', v)}
              autoCapitalize="words"
              error={errors.name}
              testID="business-name"
            />
          </Card>
          <Card style={{ gap: spacing.md }}>
            <View>
              <Text variant="subheading">{t('partner.onboarding.categories')}</Text>
              <Text variant="caption" color="textMuted">
                {catOptions.length ? t('partner.onboarding.categoriesHint') : t('partner.onboarding.noCategories')}
              </Text>
            </View>
            {catOptions.length ? <ChipSelect options={catOptions} value={d.categoryIds} onChange={(v) => set('categoryIds', v)} /> : null}
          </Card>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: spacing.lg }}>
          <Card style={{ gap: spacing.md }}>
            <View>
              <Text variant="subheading">{t('partner.onboarding.location')}</Text>
              <Text variant="caption" color="textMuted">
                {t('partner.onboarding.locationHint')}
              </Text>
            </View>
            <LocationField
              value={d.location}
              address={d.address}
              onChange={(v) => {
                set('location', { lat: v.lat, lng: v.lng });
                if (v.address && !d.address) set('address', v.address);
              }}
              setLabel={t('partner.onboarding.setLocation')}
              changeLabel={t('partner.onboarding.changeLocation')}
              emptyLabel={t('partner.onboarding.noLocation')}
            />
            <View style={styles.two}>
              <Input label={t('partner.onboarding.area')} placeholder={t('partner.onboarding.areaPlaceholder')} value={d.area} onChangeText={(v) => set('area', v)} containerStyle={styles.flex} />
              <Input label={t('partner.onboarding.city')} value={d.city} onChangeText={(v) => set('city', v)} containerStyle={styles.flex} />
            </View>
            <Input label={t('partner.onboarding.address')} value={d.address} onChangeText={(v) => set('address', v)} multiline maxLength={300} />
          </Card>
          <Card style={{ gap: spacing.md }}>
            <View style={styles.two}>
              <Input label={t('partner.onboarding.phone')} value={d.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" leftIcon="call-outline" containerStyle={styles.flex} />
              <Input label={t('partner.onboarding.whatsapp')} value={d.whatsapp} onChangeText={(v) => set('whatsapp', v)} keyboardType="phone-pad" leftIcon="logo-whatsapp" containerStyle={styles.flex} />
            </View>
            <Input label={t('partner.onboarding.email')} value={d.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" leftIcon="mail-outline" error={errors.email} />
          </Card>
        </View>
      ) : null}

      {step === 3 ? (
        <View style={{ gap: spacing.lg }}>
          <Card style={{ gap: spacing.md }}>
            <FieldLabel>{t('partner.onboarding.cover')}</FieldLabel>
            <ImageField shape="wide" value={d.coverKey} onChange={(k) => set('coverKey', k)} uploadLabel={t('partner.onboarding.uploadCover')} changeLabel={t('partner.onboarding.changeCover')} />
            <Input label={t('partner.onboarding.tagline')} placeholder={t('partner.onboarding.taglinePlaceholder')} value={d.tagline} onChangeText={(v) => set('tagline', v)} maxLength={160} />
            <Input
              label={t('partner.onboarding.description')}
              placeholder={t('partner.onboarding.descriptionPlaceholder')}
              value={d.description}
              onChangeText={(v) => set('description', v)}
              multiline
              maxLength={4000}
              style={{ minHeight: 110, textAlignVertical: 'top' }}
            />
            <SwitchRow label={t('partner.onboarding.listed')} description={t('partner.onboarding.listedHint')} value={d.listed} onValueChange={(v) => set('listed', v)} />
          </Card>
          <View style={[styles.hint, { backgroundColor: colors.primarySoft, borderRadius: theme.radius.lg }]}>
            <Ionicons name="football-outline" size={18} color={colors.primary} />
            <Text variant="caption" style={{ flex: 1, color: colors.primary }}>
              {t('partner.onboarding.next1')}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={[styles.nav, { marginTop: spacing.xl }]}>
        {step > 1 ? <Button title={t('partner.onboarding.back')} variant="ghost" icon="arrow-back" onPress={() => setStep((s) => s - 1)} disabled={busy} /> : <View />}
        {step < TOTAL ? (
          <Button title={t('partner.onboarding.next')} iconRight="arrow-forward" size="lg" onPress={next} testID="business-next" />
        ) : (
          <Button title={busy ? t('partner.onboarding.creating') : t('partner.onboarding.create')} icon="rocket-outline" size="lg" loading={busy} onPress={create} testID="business-create" />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  two: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  flex: { flexGrow: 1, flexBasis: 200 },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
});
