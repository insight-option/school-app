import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Chip, Input, Screen, Sheet, SwitchRow, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { StepDots } from '../../components/setup/StepDots';
import { SchoolLogo } from '../../components/media/StorageImage';
import { HomeLocationPicker } from '../../components/map/HomeLocationPicker';
import { MapView } from '../../components/map/MapView';
import { pickFromLibrary, uploadAttachment } from '../../components/chat/attachments';
import { client, unwrap } from '../../lib/data/client';
import { myIdentityId } from '../../lib/storage/s3';
import { refreshSession, signOutEverywhere, useSession } from '../../lib/auth/session';
import { currentLanguage } from '../../lib/i18n';
import { TIMEZONES, defaultTimezone } from '../../lib/timezones';
import { haptic } from '../../lib/util/device';
import type { LatLng } from '../../lib/geo';

type Draft = {
  adminName: string;
  name: string;
  city: string;
  country: string;
  phone: string;
  logoKey: string | null;
  location: LatLng | null;
  address: string;
  timezone: string;
  language: 'en' | 'ar';
  tagline: string;
  curriculum: string;
  grades: string;
  applicationsOpen: boolean;
  transportAvailable: boolean;
};

/**
 * "Create my school" – final step, for a signed-in account that has no school yet:
 * 1. school basics + logo, 2. location on the map, 3. public profile & admissions → registerSchool.
 * The new owner then lands in the school-office workspace.
 */
export default function SchoolSetupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { colors, spacing } = theme;
  const session = useSession();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pick, setPick] = useState(false);
  const [errors, setErrors] = useState<{ adminName?: string; name?: string }>({});
  const [d, setD] = useState<Draft>(() => ({
    adminName: session.name ?? '',
    name: '',
    city: '',
    country: '',
    phone: '',
    logoKey: null,
    location: null,
    address: '',
    timezone: defaultTimezone(),
    language: currentLanguage(),
    tagline: '',
    curriculum: '',
    grades: '',
    applicationsOpen: true,
    transportAvailable: true,
  }));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const uploadLogo = async () => {
    const picked = await pickFromLibrary('images');
    if (!picked?.[0]) return;
    setUploading(true);
    try {
      const { key } = await uploadAttachment(picked[0], `school-media/${await myIdentityId()}`);
      set('logoKey', key);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const next = () => {
    if (step === 1) {
      const e: typeof errors = {};
      if (d.adminName.trim().length < 2) e.adminName = t('common.requiredField');
      if (d.name.trim().length < 2) e.name = t('common.requiredField');
      setErrors(e);
      if (Object.keys(e).length) return;
    }
    setStep((s) => Math.min(3, s + 1));
  };

  const create = async () => {
    setBusy(true);
    try {
      const profile = {
        tagline: d.tagline.trim() || null,
        curriculum: d.curriculum.trim() || null,
        grades: d.grades.trim() || null,
        applicationsOpen: d.applicationsOpen,
        transportAvailable: d.transportAvailable,
        listed: true,
      };
      unwrap(
        await client.mutations.registerSchool({
          name: d.name.trim(),
          adminName: d.adminName.trim(),
          phone: d.phone.trim() || undefined,
          city: d.city.trim() || undefined,
          country: d.country.trim() || undefined,
          address: d.address.trim() || undefined,
          lat: d.location?.lat,
          lng: d.location?.lng,
          timezone: d.timezone,
          language: d.language,
          logoKey: d.logoKey ?? undefined,
          profile: JSON.stringify(profile),
        }),
        'school',
      );
      const s = await refreshSession();
      haptic('success');
      toast.success(t('setup.created'));
      if (s.role === 'ADMIN') router.replace('/(admin)/dashboard' as never);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const titles = [t('setup.stepSchool'), t('setup.stepLocation'), t('setup.stepProfile')];

  return (
    <Screen
      title={t('setup.title')}
      scroll
      keyboard
      maxWidth={620}
      right={
        <Pressable accessibilityRole="button" onPress={() => void signOutEverywhere().then(() => router.replace('/'))} hitSlop={8}>
          <Text variant="captionStrong" color="textMuted">
            {t('setup.useAnotherAccount')}
          </Text>
        </Pressable>
      }
    >
      <View style={{ gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.lg }}>
        <StepDots current={step} total={3} label={`${t('signup.stepOf', { current: step, total: 3 })} · ${titles[step - 1]}`} />
        {step === 1 ? (
          <>
            <Text variant="title">{t('setup.welcome', { name: d.adminName.trim() ? `, ${d.adminName.trim().split(' ')[0]}` : '' })}</Text>
            <Text color="textMuted">{t('setup.intro')}</Text>
          </>
        ) : null}
      </View>

      {step === 1 ? (
        <Card style={{ gap: spacing.md }}>
          <View style={styles.logoRow}>
            <SchoolLogo logoKey={d.logoKey} name={d.name || '?'} size={72} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text variant="captionStrong" color="textMuted">
                {t('setup.logo')}
              </Text>
              <Button title={d.logoKey ? t('setup.changeLogo') : t('setup.uploadLogo')} icon="image-outline" variant="outline" size="sm" loading={uploading} onPress={uploadLogo} />
            </View>
          </View>
          <Input label={t('setup.yourName')} required value={d.adminName} onChangeText={(v) => set('adminName', v)} autoCapitalize="words" error={errors.adminName} />
          <Input label={t('setup.schoolName')} required value={d.name} onChangeText={(v) => set('name', v)} autoCapitalize="words" error={errors.name} testID="setup-school-name" />
          <View style={styles.two}>
            <Input label={t('setup.city')} value={d.city} onChangeText={(v) => set('city', v)} containerStyle={{ flex: 1 }} />
            <Input label={t('setup.country')} value={d.country} onChangeText={(v) => set('country', v)} containerStyle={{ flex: 1 }} />
          </View>
          <Input label={t('setup.phone')} value={d.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" leftIcon="call-outline" />
        </Card>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: spacing.lg }}>
          <Card style={{ gap: spacing.md }} padding={0}>
            {d.location ? (
              <View style={{ height: 200, overflow: 'hidden', borderTopLeftRadius: 16, borderTopRightRadius: 16 }} pointerEvents="none">
                <MapView key={`${d.location.lat.toFixed(5)},${d.location.lng.toFixed(5)}`} markers={[{ id: 'school', kind: 'school', lat: d.location.lat, lng: d.location.lng }]} initialRegion={{ ...d.location, latitudeDelta: 0.012, longitudeDelta: 0.012 }} />
              </View>
            ) : (
              <View style={[styles.mapPlaceholder, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="map-outline" size={40} color={colors.textFaint} />
                <Text color="textMuted">{t('setup.noLocation')}</Text>
              </View>
            )}
            <View style={{ padding: spacing.lg, gap: spacing.sm }}>
              <Text variant="subheading">{t('setup.location')}</Text>
              <Text variant="caption" color="textMuted">
                {t('setup.locationHint')}
              </Text>
              <Button title={d.location ? t('setup.changeLocation') : t('setup.setLocation')} icon="location-outline" variant="secondary" onPress={() => setPick(true)} />
            </View>
          </Card>
          <Input label={t('setup.address')} value={d.address} onChangeText={(v) => set('address', v)} multiline />
          <Card style={{ gap: spacing.sm }}>
            <Text variant="captionStrong" color="textMuted">
              {t('setup.timezone')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {TIMEZONES.map((tz) => (
                <Chip key={tz} label={tz} selected={d.timezone === tz} onPress={() => set('timezone', tz)} />
              ))}
            </ScrollView>
            <Text variant="captionStrong" color="textMuted" style={{ marginTop: spacing.sm }}>
              {t('setup.language')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label={t('common.english')} selected={d.language === 'en'} onPress={() => set('language', 'en')} />
              <Chip label={t('common.arabic')} selected={d.language === 'ar'} onPress={() => set('language', 'ar')} />
            </View>
          </Card>
        </View>
      ) : null}

      {step === 3 ? (
        <Card style={{ gap: spacing.md }}>
          <Input label={t('setup.tagline')} placeholder={t('setup.taglinePlaceholder')} value={d.tagline} onChangeText={(v) => set('tagline', v)} maxLength={160} />
          <Input label={t('setup.curriculum')} placeholder={t('setup.curriculumPlaceholder')} value={d.curriculum} onChangeText={(v) => set('curriculum', v)} />
          <Input label={t('setup.grades')} placeholder={t('setup.gradesPlaceholder')} value={d.grades} onChangeText={(v) => set('grades', v)} />
          <SwitchRow label={t('setup.acceptApplications')} description={t('setup.acceptApplicationsHint')} value={d.applicationsOpen} onValueChange={(v) => set('applicationsOpen', v)} />
          <SwitchRow label={t('setup.transport')} value={d.transportAvailable} onValueChange={(v) => set('transportAvailable', v)} />
        </Card>
      ) : null}

      <View style={[styles.nav, { marginTop: spacing.xl }]}>
        {step > 1 ? <Button title={t('setup.back')} variant="ghost" icon="arrow-back" onPress={() => setStep((s) => s - 1)} /> : <View />}
        {step < 3 ? (
          <Button title={t('setup.next')} iconRight="arrow-forward" size="lg" onPress={next} testID="setup-next" />
        ) : (
          <Button title={busy ? t('setup.creating') : t('setup.create')} icon="rocket-outline" size="lg" loading={busy} onPress={create} testID="setup-create" />
        )}
      </View>

      <Sheet visible={pick} onClose={() => setPick(false)} title={t('setup.location')} scroll={false} maxHeightFraction={0.95}>
        <View style={{ height: 480 }}>
          <HomeLocationPicker
            initial={d.location}
            initialAddress={d.address}
            fallbackCenter={d.location}
            confirmLabel={t('common.save')}
            onConfirm={(v) => {
              set('location', { lat: v.lat, lng: v.lng });
              if (v.address && !d.address) set('address', v.address);
              setPick(false);
            }}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  two: { flexDirection: 'row', gap: 12 },
  mapPlaceholder: { height: 160, alignItems: 'center', justifyContent: 'center', gap: 8, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
