import React, { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Gradient, Input, Screen, SectionHeader, Skeleton, Text, useTheme, withAlpha } from '../../ui';
import { shade } from '../../ui/theme';
import { toast } from '../../ui/Toast';
import { DEFAULT_BRANDING, useAppConfig } from '../../features/branding';
import { useSaveAppConfig } from '../../features/owner';
import type { AppConfig } from '../../lib/data/client';
import { StorageImage } from '../../components/media/StorageImage';
import { ColorField, isHexColor, parseAmount, pickAndUploadBrandingImage } from '../../components/owner/kit';
import { BRAND_DEFAULT, ACCENT_DEFAULT } from '../../ui/theme';

/** App-wide branding (AppConfig row 'app'): name, logo, icon, colours, home texts, support contacts. */
export default function OwnerBranding() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const cfg = useAppConfig();
  if (cfg.isLoading && cfg.data === undefined) {
    return (
      <Screen back={width < 900} title={t('owner.branding.title')} scroll maxWidth={1100}>
        <View style={{ gap: 16 }}>
          <Skeleton height={180} radius={24} />
          <Skeleton height={320} radius={24} />
        </View>
      </Screen>
    );
  }
  return <BrandingForm key={cfg.data?.updatedAt ?? 'new'} config={cfg.data ?? null} />;
}

type ImageKind = 'logo' | 'icon' | 'hero';

function BrandingForm({ config }: { config: AppConfig | null }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const save = useSaveAppConfig();
  const wide = width >= 1000;
  const [form, setForm] = useState(() => ({
    appName: config?.appName ?? DEFAULT_BRANDING.appName,
    appNameAr: config?.appNameAr ?? DEFAULT_BRANDING.appNameAr,
    tagline: config?.tagline ?? DEFAULT_BRANDING.tagline,
    taglineAr: config?.taglineAr ?? DEFAULT_BRANDING.taglineAr,
    logoKey: config?.logoKey ?? '',
    iconKey: config?.iconKey ?? '',
    heroImageKey: config?.heroImageKey ?? '',
    primaryColor: config?.primaryColor ?? BRAND_DEFAULT,
    accentColor: config?.accentColor ?? ACCENT_DEFAULT,
    heroTitle: config?.heroTitle ?? '',
    heroTitleAr: config?.heroTitleAr ?? '',
    heroSubtitle: config?.heroSubtitle ?? '',
    heroSubtitleAr: config?.heroSubtitleAr ?? '',
    announcement: config?.announcement ?? '',
    announcementAr: config?.announcementAr ?? '',
    supportEmail: config?.supportEmail ?? '',
    supportPhone: config?.supportPhone ?? '',
    whatsapp: config?.whatsapp ?? '',
    instagram: config?.instagram ?? '',
    website: config?.website ?? '',
    currency: config?.currency ?? 'QAR',
    commission: config?.defaultCommissionPercent != null ? String(config.defaultCommissionPercent) : '',
  }));
  const [uploading, setUploading] = useState<ImageKind | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const upload = async (kind: ImageKind) => {
    setUploading(kind);
    try {
      const key = await pickAndUploadBrandingImage(kind);
      if (key) set(kind === 'logo' ? 'logoKey' : kind === 'icon' ? 'iconKey' : 'heroImageKey', key);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(null);
    }
  };

  const submit = () => {
    const e: Record<string, string> = {};
    if (!form.appName.trim()) e.appName = t('common.requiredField');
    if (!isHexColor(form.primaryColor)) e.primaryColor = t('owner.branding.invalidHex');
    if (!isHexColor(form.accentColor)) e.accentColor = t('owner.branding.invalidHex');
    const commission = parseAmount(form.commission);
    if (commission !== null && (Number.isNaN(commission) || commission < 0 || commission > 100)) e.commission = t('owner.errors.number');
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(t('common.fixErrors'));
      return;
    }
    const v = (s: string) => s.trim() || null;
    save.mutate(
      {
        appName: form.appName.trim(),
        appNameAr: v(form.appNameAr),
        tagline: v(form.tagline),
        taglineAr: v(form.taglineAr),
        logoKey: v(form.logoKey),
        iconKey: v(form.iconKey),
        heroImageKey: v(form.heroImageKey),
        primaryColor: form.primaryColor,
        accentColor: form.accentColor,
        heroTitle: v(form.heroTitle),
        heroTitleAr: v(form.heroTitleAr),
        heroSubtitle: v(form.heroSubtitle),
        heroSubtitleAr: v(form.heroSubtitleAr),
        announcement: v(form.announcement),
        announcementAr: v(form.announcementAr),
        supportEmail: v(form.supportEmail),
        supportPhone: v(form.supportPhone),
        whatsapp: v(form.whatsapp),
        instagram: v(form.instagram.replace(/^@/, '')),
        website: v(form.website),
        currency: v(form.currency.toUpperCase()) ?? 'QAR',
        defaultCommissionPercent: commission,
      },
      { onSuccess: () => toast.success(t('owner.branding.saved')), onError: (err) => toast.error(err.message) },
    );
  };

  const preview = <BrandPreview form={form} />;

  const formColumn = (
    <View style={{ gap: theme.spacing.md, flex: 1 }}>
      <SectionHeader title={t('owner.branding.identity')} />
      <Card style={{ gap: theme.spacing.md }}>
        <Input label={t('owner.branding.appName')} value={form.appName} onChangeText={(x) => set('appName', x)} required error={errors.appName} />
        <Input label={t('owner.branding.appNameAr')} value={form.appNameAr} onChangeText={(x) => set('appNameAr', x)} />
        <Input label={t('owner.branding.tagline')} value={form.tagline} onChangeText={(x) => set('tagline', x)} />
        <Input label={t('owner.branding.taglineAr')} value={form.taglineAr} onChangeText={(x) => set('taglineAr', x)} />
      </Card>

      <SectionHeader title={t('owner.branding.images')} />
      <Card style={{ gap: theme.spacing.lg }}>
        <ImageField label={t('owner.branding.logo')} hint={t('owner.branding.logoHint')} storageKey={form.logoKey} square busy={uploading === 'logo'} onUpload={() => void upload('logo')} onRemove={() => set('logoKey', '')} />
        <ImageField label={t('owner.branding.icon')} hint={t('owner.branding.iconHint')} storageKey={form.iconKey} square busy={uploading === 'icon'} onUpload={() => void upload('icon')} onRemove={() => set('iconKey', '')} />
        <ImageField label={t('owner.branding.heroImage')} hint={t('owner.branding.heroImageHint')} storageKey={form.heroImageKey} busy={uploading === 'hero'} onUpload={() => void upload('hero')} onRemove={() => set('heroImageKey', '')} />
      </Card>

      <SectionHeader title={t('owner.branding.colors')} />
      <Card style={{ gap: theme.spacing.lg }}>
        <ColorField label={t('owner.branding.primary')} value={form.primaryColor} onChange={(x) => set('primaryColor', x)} error={errors.primaryColor} />
        <ColorField label={t('owner.branding.accent')} value={form.accentColor} onChange={(x) => set('accentColor', x)} error={errors.accentColor} />
      </Card>

      <SectionHeader title={t('owner.branding.home')} />
      <Card style={{ gap: theme.spacing.md }}>
        <Input label={t('owner.branding.heroTitle')} value={form.heroTitle} onChangeText={(x) => set('heroTitle', x)} multiline placeholder={t('platform.explore.heroTitle')} />
        <Input label={t('owner.branding.heroTitleAr')} value={form.heroTitleAr} onChangeText={(x) => set('heroTitleAr', x)} multiline />
        <Input label={t('owner.branding.heroSubtitle')} value={form.heroSubtitle} onChangeText={(x) => set('heroSubtitle', x)} multiline />
        <Input label={t('owner.branding.heroSubtitleAr')} value={form.heroSubtitleAr} onChangeText={(x) => set('heroSubtitleAr', x)} multiline />
        <Input label={t('owner.branding.announcement')} value={form.announcement} onChangeText={(x) => set('announcement', x)} helper={t('owner.branding.announcementHint')} />
        <Input label={t('owner.branding.announcementAr')} value={form.announcementAr} onChangeText={(x) => set('announcementAr', x)} />
      </Card>

      <SectionHeader title={t('owner.branding.support')} />
      <Card style={{ gap: theme.spacing.md }}>
        <Input label={t('owner.branding.supportEmail')} value={form.supportEmail} onChangeText={(x) => set('supportEmail', x)} keyboardType="email-address" autoCapitalize="none" leftIcon="mail-outline" />
        <Input label={t('owner.branding.supportPhone')} value={form.supportPhone} onChangeText={(x) => set('supportPhone', x)} keyboardType="phone-pad" leftIcon="call-outline" />
        <Input label={t('owner.branding.whatsapp')} value={form.whatsapp} onChangeText={(x) => set('whatsapp', x)} keyboardType="phone-pad" leftIcon="logo-whatsapp" />
        <Input label={t('owner.branding.instagram')} value={form.instagram} onChangeText={(x) => set('instagram', x)} autoCapitalize="none" leftIcon="logo-instagram" />
        <Input label={t('owner.branding.website')} value={form.website} onChangeText={(x) => set('website', x)} autoCapitalize="none" keyboardType="url" leftIcon="globe-outline" />
      </Card>

      <SectionHeader title={t('owner.branding.money')} />
      <Card style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Input containerStyle={{ width: 110 }} label={t('owner.branding.currency')} value={form.currency} onChangeText={(x) => set('currency', x.toUpperCase())} autoCapitalize="characters" maxLength={3} />
          <Input containerStyle={{ flex: 1 }} label={t('owner.branding.commission')} value={form.commission} onChangeText={(x) => set('commission', x)} keyboardType="decimal-pad" error={errors.commission} />
        </View>
      </Card>

      <Button title={t('owner.branding.save')} icon="checkmark" size="lg" onPress={submit} loading={save.isPending} fullWidth style={{ marginTop: theme.spacing.md }} />
    </View>
  );

  return (
    <Screen back={width < 900} title={t('owner.branding.title')} subtitle={t('owner.branding.subtitle')} scroll keyboard maxWidth={1100}>
      <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.sm }}>
        <Card tone="primary" style={{ flexDirection: 'row', gap: 12 }}>
          <Ionicons name="information-circle" size={22} color={theme.colors.primary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{t('owner.branding.buildNoteTitle')}</Text>
            <Text variant="caption" color="textMuted">
              {t('owner.branding.buildNoteBody')}
            </Text>
          </View>
        </Card>
        {wide ? (
          <View style={{ flexDirection: 'row', gap: theme.spacing.xl, alignItems: 'flex-start' }}>
            {formColumn}
            <View style={{ width: 360, gap: theme.spacing.sm }}>
              <SectionHeader title={t('owner.branding.preview')} />
              {preview}
            </View>
          </View>
        ) : (
          <>
            <SectionHeader title={t('owner.branding.preview')} />
            {preview}
            {formColumn}
          </>
        )}
      </View>
    </Screen>
  );
}

function ImageField({ label, hint, storageKey, square, busy, onUpload, onRemove }: { label: string; hint: string; storageKey: string; square?: boolean; busy: boolean; onUpload: () => void; onRemove: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <View style={[styles.imageBox, { width: square ? 72 : 120, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
        {storageKey ? <StorageImage storageKey={storageKey} style={{ width: '100%', height: '100%' }} contentFit={square ? 'contain' : 'cover'} /> : <Ionicons name="image-outline" size={26} color={theme.colors.textFaint} />}
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Text variant="bodyStrong">{label}</Text>
        <Text variant="caption" color="textMuted">
          {hint}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button title={busy ? t('owner.branding.uploading') : storageKey ? t('owner.branding.replace') : t('owner.branding.upload')} icon="cloud-upload-outline" size="sm" variant="secondary" onPress={onUpload} loading={busy} />
          {storageKey ? <Button title={t('owner.branding.remove')} size="sm" variant="ghost" onPress={onRemove} disabled={busy} /> : null}
        </View>
      </View>
    </View>
  );
}

/** Mini mock of the Explore home with the chosen colours, logo and texts. */
function BrandPreview({ form }: { form: { appName: string; tagline: string; logoKey: string; heroImageKey: string; primaryColor: string; accentColor: string; heroTitle: string; heroSubtitle: string; announcement: string } }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const primary = isHexColor(form.primaryColor) ? form.primaryColor : BRAND_DEFAULT;
  const accent = isHexColor(form.accentColor) ? form.accentColor : ACCENT_DEFAULT;
  return (
    <Card padding={0} elevation="raised" style={{ overflow: 'hidden' }}>
      {form.announcement ? (
        <View style={{ backgroundColor: accent, paddingVertical: 8, paddingHorizontal: 14 }}>
          <Text variant="captionStrong" style={{ color: '#16131A' }} numberOfLines={1}>
            {form.announcement}
          </Text>
        </View>
      ) : null}
      <Gradient stops={[shade(primary, 10), primary, shade(primary, -22)]} angle={140} style={styles.hero}>
        {form.heroImageKey ? <StorageImage storageKey={form.heroImageKey} style={[StyleSheet.absoluteFill, { opacity: 0.28 }]} /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[styles.logo, { backgroundColor: form.logoKey ? '#fff' : withAlpha('#ffffff', 0.18) }]}>
            {form.logoKey ? <StorageImage storageKey={form.logoKey} style={{ width: 36, height: 36 }} contentFit="contain" /> : <Ionicons name="sparkles" size={18} color="#fff" />}
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="subheading" style={{ color: '#fff' }} numberOfLines={1}>
              {form.appName || DEFAULT_BRANDING.appName}
            </Text>
            <Text variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }} numberOfLines={1}>
              {form.tagline}
            </Text>
          </View>
        </View>
        <Text variant="title" style={{ color: '#fff', marginTop: 18 }} numberOfLines={3}>
          {form.heroTitle || t('platform.explore.heroTitle')}
        </Text>
        <Text variant="caption" style={{ color: 'rgba(255,255,255,0.85)' }} numberOfLines={2}>
          {form.heroSubtitle || t('platform.explore.heroSubtitle')}
        </Text>
        <View style={[styles.search, { backgroundColor: '#fff' }]}>
          <Ionicons name="search" size={16} color="#7B756E" />
          <Text variant="caption" style={{ color: '#7B756E' }} numberOfLines={1}>
            {t('platform.explore.searchPlaceholder')}
          </Text>
        </View>
      </Gradient>
      <View style={{ padding: 16, gap: 12, backgroundColor: theme.colors.surface }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {['football', 'tennisball', 'school'].map((icon, i) => (
            <View key={icon} style={[styles.chip, { backgroundColor: i === 0 ? primary : withAlpha(primary, 0.1) }]}>
              <Ionicons name={icon as never} size={16} color={i === 0 ? '#fff' : primary} />
            </View>
          ))}
          <View style={[styles.chip, { backgroundColor: withAlpha(accent, 0.2), flex: 1 }]}>
            <Ionicons name="star" size={14} color={accent} />
          </View>
        </View>
        <View style={[styles.cta, { backgroundColor: primary }]}>
          <Text variant="bodyStrong" style={{ color: '#fff' }}>
            {t('owner.branding.previewCta')}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  imageBox: { height: 72, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  hero: { padding: 18, gap: 4 },
  logo: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 11, marginTop: 14 },
  chip: { height: 38, minWidth: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  cta: { height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
