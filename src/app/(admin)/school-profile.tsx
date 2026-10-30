import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Chip, Input, Screen, Sheet, Skeleton, SwitchRow, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { SchoolCover } from '../../components/directory/SchoolCard';
import { SchoolLogo } from '../../components/media/StorageImage';
import { HomeLocationPicker } from '../../components/map/HomeLocationPicker';
import { pickFromLibrary, uploadAttachment } from '../../components/chat/attachments';
import { useMySchoolListing, useSaveSchoolProfile } from '../../features/admissions';
import { cleanList } from '../../features/directory';
import { useSettings } from '../../features/settings';
import { splitList } from '../../lib/directory';
import { myIdentityId } from '../../lib/storage/s3';
import { useSession } from '../../lib/auth/session';
import { DIRECTORY_HIDDEN } from '../../../amplify/functions/shared/tenancy';
import type { GenderPolicy, School } from '../../lib/data/client';
import type { LatLng } from '../../lib/geo';

type Form = {
  listed: boolean;
  name: string;
  tagline: string;
  description: string;
  logoKey: string | null;
  coverKey: string | null;
  phone: string;
  email: string;
  website: string;
  city: string;
  country: string;
  address: string;
  location: LatLng | null;
  curriculum: string;
  grades: string;
  languages: string;
  genderPolicy: GenderPolicy | null;
  foundedYear: string;
  feesFrom: string;
  feesTo: string;
  currency: string;
  transportAvailable: boolean;
  facilities: string;
  applicationsOpen: boolean;
  academicYear: string;
  applicationDeadline: string;
  admissionsNote: string;
  requiredDocuments: string;
  gradeOptions: string;
  seatsAvailable: string;
};

const num = (v: number | null | undefined) => (v == null ? '' : String(v));

function fromSchool(s: School | null | undefined, fallback: { name?: string; logoKey?: string | null; address?: string | null; location?: LatLng | null }): Form {
  return {
    listed: s ? s.directory !== DIRECTORY_HIDDEN : true,
    name: s?.name ?? fallback.name ?? '',
    tagline: s?.tagline ?? '',
    description: s?.description ?? '',
    logoKey: s?.logoKey ?? fallback.logoKey ?? null,
    coverKey: s?.coverKey ?? null,
    phone: s?.phone ?? '',
    email: s?.email ?? '',
    website: s?.website ?? '',
    city: s?.city ?? '',
    country: s?.country ?? '',
    address: s?.address ?? fallback.address ?? '',
    location: s?.location ?? fallback.location ?? null,
    curriculum: s?.curriculum ?? '',
    grades: s?.grades ?? '',
    languages: s?.languages ?? '',
    genderPolicy: s?.genderPolicy ?? null,
    foundedYear: num(s?.foundedYear),
    feesFrom: num(s?.feesFrom),
    feesTo: num(s?.feesTo),
    currency: s?.currency ?? '',
    transportAvailable: s?.transportAvailable ?? true,
    facilities: cleanList(s?.facilities).join(', '),
    applicationsOpen: s?.applicationsOpen ?? false,
    academicYear: s?.academicYear ?? '',
    applicationDeadline: s?.applicationDeadline ?? '',
    admissionsNote: s?.admissionsNote ?? '',
    requiredDocuments: cleanList(s?.requiredDocuments).join('\n'),
    gradeOptions: cleanList(s?.gradeOptions).join(', '),
    seatsAvailable: num(s?.seatsAvailable),
  };
}

/** Office: what families see in the public school directory (and whether applications are open). */
export default function AdminSchoolProfile() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { spacing } = theme;
  const router = useRouter();
  const session = useSession();
  const listing = useMySchoolListing();
  const settings = useSettings();
  const save = useSaveSchoolProfile();
  // Edits are a sparse patch over the loaded listing (no effect needed to hydrate the form).
  const [patch, setPatch] = useState<Partial<Form>>({});
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null);
  const [pick, setPick] = useState(false);
  const base = fromSchool(listing.data, {
    name: settings.data?.name,
    logoKey: settings.data?.logoKey,
    address: settings.data?.address,
    location: settings.data?.schoolLocation ?? null,
  });
  const form: Form = { ...base, ...patch };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setPatch((p) => ({ ...p, [k]: v }));
  const dirty = Object.keys(patch).length > 0;

  const upload = async (kind: 'logo' | 'cover') => {
    const picked = await pickFromLibrary('images');
    if (!picked?.[0]) return;
    setUploading(kind);
    try {
      const { key } = await uploadAttachment(picked[0], `school-media/${await myIdentityId()}`);
      set(kind === 'logo' ? 'logoKey' : 'coverKey', key);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(null);
    }
  };

  const submit = () => {
    const e: typeof errors = {};
    const intOrNull = (k: keyof Form, v: string, min: number, max: number) => {
      if (!v.trim()) return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < min || n > max) e[k] = k === 'foundedYear' ? t('publicProfile.invalidYear') : t('publicProfile.invalidNumber');
      return n;
    };
    const floatOrNull = (k: keyof Form, v: string) => {
      if (!v.trim()) return null;
      const n = Number(v.replace(/,/g, ''));
      if (!Number.isFinite(n) || n < 0) e[k] = t('publicProfile.invalidNumber');
      return n;
    };
    if (form.name.trim().length < 2) e.name = t('common.requiredField');
    if (form.applicationDeadline && !/^\d{4}-\d{2}-\d{2}$/.test(form.applicationDeadline)) e.applicationDeadline = t('apply.errors.dob');
    const foundedYear = intOrNull('foundedYear', form.foundedYear, 1800, 2100);
    const seatsAvailable = intOrNull('seatsAvailable', form.seatsAvailable, 0, 100000);
    const feesFrom = floatOrNull('feesFrom', form.feesFrom);
    const feesTo = floatOrNull('feesTo', form.feesTo);
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(t('common.fixErrors'));
      return;
    }
    save.mutate(
      {
        listed: form.listed,
        name: form.name.trim(),
        tagline: form.tagline.trim(),
        description: form.description.trim(),
        logoKey: form.logoKey ?? '',
        coverKey: form.coverKey ?? '',
        phone: form.phone.trim(),
        email: form.email.trim(),
        website: form.website.trim(),
        city: form.city.trim(),
        country: form.country.trim(),
        address: form.address.trim(),
        lat: form.location?.lat ?? null,
        lng: form.location?.lng ?? null,
        curriculum: form.curriculum.trim(),
        grades: form.grades.trim(),
        languages: form.languages.trim(),
        genderPolicy: form.genderPolicy,
        foundedYear,
        feesFrom,
        feesTo,
        currency: form.currency.trim(),
        transportAvailable: form.transportAvailable,
        facilities: splitList(form.facilities, 24),
        applicationsOpen: form.applicationsOpen,
        academicYear: form.academicYear.trim(),
        applicationDeadline: form.applicationDeadline.trim(),
        admissionsNote: form.admissionsNote.trim(),
        requiredDocuments: splitList(form.requiredDocuments, 20),
        gradeOptions: splitList(form.gradeOptions, 30),
        seatsAvailable,
      },
      {
        onSuccess: () => {
          setPatch({});
          toast.success(t('publicProfile.saved'));
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  if (listing.isLoading && !listing.data) {
    return (
      <Screen title={t('publicProfile.title')}>
        <View style={{ gap: 12, paddingTop: spacing.lg }}>
          <Skeleton height={160} />
          <Skeleton height={220} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title={t('publicProfile.title')}
      subtitle={t('publicProfile.subtitle')}
      scroll
      keyboard
      maxWidth={820}
      right={<Button size="sm" variant="ghost" icon="eye-outline" title={t('publicProfile.preview')} onPress={() => router.push(`/schools/${session.schoolId}` as never)} />}
    >
      <View style={{ gap: spacing.lg, paddingTop: spacing.md }}>
        <Card style={{ gap: spacing.xs }}>
          <SwitchRow label={t('publicProfile.listed')} description={t('publicProfile.listedHint')} value={form.listed} onValueChange={(v) => set('listed', v)} />
          <SwitchRow label={t('publicProfile.applicationsOpen')} description={t('setup.acceptApplicationsHint')} value={form.applicationsOpen} onValueChange={(v) => set('applicationsOpen', v)} />
        </Card>

        <Card padding={0} style={{ overflow: 'hidden' }}>
          <SchoolCover school={{ coverKey: form.coverKey, primaryColor: settings.data?.primaryColor ?? null, name: form.name || '?' }} height={150} />
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <View style={styles.row}>
              <SchoolLogo logoKey={form.logoKey} name={form.name || '?'} color={settings.data?.primaryColor} size={72} bordered style={{ marginTop: -56 }} />
              <View style={{ flex: 1 }} />
            </View>
            <View style={styles.row}>
              <Button title={t('publicProfile.uploadLogo')} icon="image-outline" variant="outline" size="sm" loading={uploading === 'logo'} onPress={() => void upload('logo')} />
              <Button title={t('publicProfile.uploadCover')} icon="images-outline" variant="outline" size="sm" loading={uploading === 'cover'} onPress={() => void upload('cover')} />
              {form.coverKey ? <Button title={t('publicProfile.remove')} variant="ghost" size="sm" onPress={() => set('coverKey', null)} /> : null}
            </View>
          </View>
        </Card>

        <Section title={t('publicProfile.about')}>
          <Input label={t('publicProfile.name')} required value={form.name} onChangeText={(v) => set('name', v)} error={errors.name} />
          <Input label={t('publicProfile.tagline')} placeholder={t('setup.taglinePlaceholder')} value={form.tagline} onChangeText={(v) => set('tagline', v)} maxLength={160} />
          <Input label={t('publicProfile.description')} value={form.description} onChangeText={(v) => set('description', v)} multiline numberOfLines={6} style={{ minHeight: 140, textAlignVertical: 'top' }} maxLength={4000} />
        </Section>

        <Section title={t('publicProfile.contact')}>
          <View style={styles.two}>
            <Input label={t('publicProfile.phone')} value={form.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" containerStyle={{ flex: 1 }} />
            <Input label={t('publicProfile.email')} value={form.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" containerStyle={{ flex: 1 }} />
          </View>
          <Input label={t('publicProfile.website')} value={form.website} onChangeText={(v) => set('website', v)} autoCapitalize="none" keyboardType="url" />
          <View style={styles.two}>
            <Input label={t('publicProfile.city')} value={form.city} onChangeText={(v) => set('city', v)} containerStyle={{ flex: 1 }} />
            <Input label={t('publicProfile.country')} value={form.country} onChangeText={(v) => set('country', v)} containerStyle={{ flex: 1 }} />
          </View>
          <Input label={t('publicProfile.address')} value={form.address} onChangeText={(v) => set('address', v)} multiline />
          <View style={styles.row}>
            <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
              {form.location ? `${form.location.lat.toFixed(5)}, ${form.location.lng.toFixed(5)}` : t('setup.noLocation')}
            </Text>
            <Button title={t('publicProfile.setOnMap')} icon="location-outline" variant="secondary" size="sm" onPress={() => setPick(true)} />
          </View>
        </Section>

        <Section title={t('publicProfile.academics')}>
          <Input label={t('publicProfile.curriculum')} placeholder={t('setup.curriculumPlaceholder')} value={form.curriculum} onChangeText={(v) => set('curriculum', v)} />
          <Input label={t('publicProfile.grades')} placeholder={t('setup.gradesPlaceholder')} value={form.grades} onChangeText={(v) => set('grades', v)} />
          <Input label={t('publicProfile.languages')} value={form.languages} onChangeText={(v) => set('languages', v)} />
          <Text variant="captionStrong" color="textMuted">
            {t('publicProfile.gender')}
          </Text>
          <View style={styles.row}>
            {(['MIXED', 'BOYS', 'GIRLS'] as const).map((g) => (
              <Chip key={g} label={t(`schoolPage.genders.${g}`)} selected={form.genderPolicy === g} onPress={() => set('genderPolicy', form.genderPolicy === g ? null : g)} />
            ))}
          </View>
          <Input label={t('publicProfile.founded')} value={form.foundedYear} onChangeText={(v) => set('foundedYear', v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" error={errors.foundedYear} />
          <Input label={t('publicProfile.facilities')} helper={t('publicProfile.facilitiesHint')} value={form.facilities} onChangeText={(v) => set('facilities', v)} />
        </Section>

        <Section title={t('publicProfile.fees')}>
          <View style={styles.two}>
            <Input label={t('publicProfile.feesFrom')} value={form.feesFrom} onChangeText={(v) => set('feesFrom', v)} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} error={errors.feesFrom} />
            <Input label={t('publicProfile.feesTo')} value={form.feesTo} onChangeText={(v) => set('feesTo', v)} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} error={errors.feesTo} />
            <Input label={t('publicProfile.currency')} value={form.currency} onChangeText={(v) => set('currency', v.toUpperCase().slice(0, 8))} autoCapitalize="characters" containerStyle={{ width: 96 }} />
          </View>
          <SwitchRow label={t('publicProfile.transport')} value={form.transportAvailable} onValueChange={(v) => set('transportAvailable', v)} />
        </Section>

        <Section title={t('publicProfile.admissions')}>
          <View style={styles.two}>
            <Input label={t('publicProfile.academicYear')} placeholder={t('publicProfile.academicYearPlaceholder')} value={form.academicYear} onChangeText={(v) => set('academicYear', v)} containerStyle={{ flex: 1 }} />
            <Input label={t('publicProfile.deadline')} placeholder="2026-12-31" value={form.applicationDeadline} onChangeText={(v) => set('applicationDeadline', v)} containerStyle={{ flex: 1 }} error={errors.applicationDeadline} />
          </View>
          <Input label={t('publicProfile.gradeOptions')} helper={t('publicProfile.gradeOptionsHint')} value={form.gradeOptions} onChangeText={(v) => set('gradeOptions', v)} />
          <Input label={t('publicProfile.documents')} helper={t('publicProfile.documentsHint')} value={form.requiredDocuments} onChangeText={(v) => set('requiredDocuments', v)} multiline numberOfLines={4} style={{ minHeight: 96, textAlignVertical: 'top' }} />
          <Input label={t('publicProfile.admissionsNote')} value={form.admissionsNote} onChangeText={(v) => set('admissionsNote', v)} multiline />
          <Input label={t('publicProfile.seats')} value={form.seatsAvailable} onChangeText={(v) => set('seatsAvailable', v.replace(/\D/g, ''))} keyboardType="number-pad" error={errors.seatsAvailable} />
        </Section>

        <Button title={t('publicProfile.save')} icon="save-outline" size="lg" fullWidth onPress={submit} loading={save.isPending} disabled={!dirty && !!listing.data} testID="profile-save" />
        <Text variant="caption" color={dirty ? 'warning' : 'textFaint'} align="center">
          {dirty ? t('common.unsavedChanges') : ' '}
        </Text>
      </View>

      <Sheet visible={pick} onClose={() => setPick(false)} title={t('publicProfile.location')} scroll={false} maxHeightFraction={0.95}>
        <View style={{ height: 480 }}>
          <HomeLocationPicker
            initial={form.location}
            initialAddress={form.address}
            fallbackCenter={form.location}
            confirmLabel={t('common.save')}
            onConfirm={(v) => {
              set('location', { lat: v.lat, lng: v.lng });
              if (v.address && !form.address) set('address', v.address);
              setPick(false);
            }}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Card style={{ gap: theme.spacing.md }}>
      <Text variant="subheading">{title}</Text>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  two: { flexDirection: 'row', gap: 12 },
});
