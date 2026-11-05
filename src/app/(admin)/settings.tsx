import React, { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Button, Card, Chip, Input, Screen, SectionHeader, Sheet, SwitchRow, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { HomeLocationPicker } from '../../components/map/HomeLocationPicker';
import { MapView } from '../../components/map/MapView';
import { DEFAULT_SETTINGS, useSaveSettings, useSettings } from '../../features/settings';
import { pickFromLibrary, uploadAttachment } from '../../components/chat/attachments';
import { myIdentityId, useSignedUrl } from '../../lib/storage/s3';
import { useSaveSchoolProfile } from '../../features/admissions';
import { TIMEZONES } from '../../lib/timezones';
import { SES_FROM_EMAIL } from '../../lib/amplify';
import type { LatLng } from '../../lib/geo';

const COLORS = ['#8A1538', '#2563EB', '#0891B2', '#16A34A', '#7C3AED', '#DB2777', '#EA580C', '#0F766E', '#4F46E5'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function AdminSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const settings = useSettings();
  const save = useSaveSettings();
  const saveProfile = useSaveSchoolProfile();
  const logo = useSignedUrl(settings.data?.logoKey);
  // Edits are stored as a sparse patch on top of the loaded settings (no effect needed to "hydrate").
  const [patch, setPatch] = useState<Partial<typeof DEFAULT_SETTINGS>>({});
  const [locationEdit, setLocationEdit] = useState<LatLng | null | undefined>(undefined);
  const [pick, setPick] = useState(false);
  const form = { ...DEFAULT_SETTINGS, ...(settings.data ?? {}), ...patch } as typeof DEFAULT_SETTINGS;
  const location = locationEdit === undefined ? (settings.data?.schoolLocation ?? null) : locationEdit;
  const setLocation = (v: LatLng | null) => setLocationEdit(v);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setPatch((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (!HHMM.test(form.morningTripStart ?? '') || !HHMM.test(form.afternoonTripStart ?? '')) return toast.error(t('office.invalidTime'));
    save.mutate(
      {
        name: form.name.trim() || DEFAULT_SETTINGS.name,
        address: form.address,
        primaryColor: form.primaryColor,
        schoolLocation: location,
        timezone: form.timezone,
        defaultLanguage: form.defaultLanguage,
        morningTripStart: form.morningTripStart,
        afternoonTripStart: form.afternoonTripStart,
        studentChatEnabled: form.studentChatEnabled,
        alarmRepeatSeconds: Math.max(5, Math.min(300, Number(form.alarmRepeatSeconds) || 20)),
        alarmMaxRepeats: Math.max(0, Math.min(20, Number(form.alarmMaxRepeats) || 5)),
        senderEmail: SES_FROM_EMAIL || null,
      },
      {
        onSuccess: () => {
          toast.success(t('common.success'));
          setPatch({});
          setLocationEdit(undefined);
          // Keep the public directory listing in step with the operational settings.
          saveProfile.mutate(
            {
              name: form.name.trim() || DEFAULT_SETTINGS.name,
              address: form.address ?? '',
              primaryColor: form.primaryColor ?? '',
              lat: location?.lat ?? null,
              lng: location?.lng ?? null,
            },
            { onError: (e) => toast.error(e.message) },
          );
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const uploadLogo = async () => {
    const picked = await pickFromLibrary('images');
    if (!picked?.[0]) return;
    try {
      // school-media/<identity>/… is writable only by this account and readable in the public directory;
      // saving through the public profile also updates SchoolSettings.logoKey.
      const { key } = await uploadAttachment(picked[0], `school-media/${await myIdentityId()}`);
      await saveProfile.mutateAsync({ logoKey: key });
      toast.success(t('common.success'));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Screen title={t('admin.settings')} scroll keyboard maxWidth={760}>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.md }}>
        <Card style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <View style={{ width: 72, height: 72, borderRadius: 16, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              {logo ? <Image source={{ uri: logo }} style={{ width: 72, height: 72 }} contentFit="contain" /> : <Text variant="caption" color="textMuted">{t('admin.logo')}</Text>}
            </View>
            <Button title={t('admin.uploadLogo')} variant="outline" icon="image-outline" onPress={uploadLogo} />
          </View>
          <Input label={t('admin.schoolName')} value={form.name} onChangeText={(v) => set('name', v)} required />
          <Input label={t('admin.address')} value={form.address ?? ''} onChangeText={(v) => set('address', v)} />
          <Text variant="captionStrong" color="textMuted">
            {t('admin.primaryColor')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {COLORS.map((c) => (
              <Button key={c} title="" accessibilityLabel={c} onPress={() => set('primaryColor', c)} style={{ width: 36, height: 36, minHeight: 36, borderRadius: 18, backgroundColor: c, borderWidth: form.primaryColor === c ? 3 : 0, borderColor: theme.colors.text, paddingHorizontal: 0 }} />
            ))}
            <Chip label={t('office.defaultColor')} selected={!form.primaryColor} onPress={() => set('primaryColor', null)} />
          </View>
        </Card>

        <SectionHeader title={t('admin.schoolLocation')} action={t('common.edit')} onAction={() => setPick(true)} />
        <Card padding={0} style={{ overflow: 'hidden' }}>
          {location ? (
            <View>
              {/* keyed on the coordinates so the preview re-centres after picking a new spot */}
              <View style={{ height: 200 }} pointerEvents="none">
                <MapView key={`${location.lat.toFixed(5)},${location.lng.toFixed(5)}`} markers={[{ id: 'school', kind: 'school', lat: location.lat, lng: location.lng }]} initialRegion={{ ...location, latitudeDelta: 0.02, longitudeDelta: 0.02 }} />
              </View>
              <Text variant="caption" color={locationEdit !== undefined ? 'warning' : 'textMuted'} style={{ padding: theme.spacing.sm }}>
                {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                {locationEdit !== undefined ? ` · ${t('common.unsavedChanges')}` : ''}
              </Text>
            </View>
          ) : (
            <Text color="textMuted" style={{ padding: theme.spacing.lg }}>
              {t('profile.homeLocationNotSet')}
            </Text>
          )}
        </Card>

        <SectionHeader title={t('admin.trips')} />
        <Card style={{ gap: theme.spacing.md }}>
          <Input label={t('admin.morningStart')} value={form.morningTripStart ?? ''} onChangeText={(v) => set('morningTripStart', v)} placeholder="06:30" />
          <Input label={t('admin.afternoonStart')} value={form.afternoonTripStart ?? ''} onChangeText={(v) => set('afternoonTripStart', v)} placeholder="13:30" />
          <Text variant="captionStrong" color="textMuted">
            {t('admin.timezone')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {TIMEZONES.map((tz) => (
              <Chip key={tz} label={tz} selected={form.timezone === tz} onPress={() => set('timezone', tz)} />
            ))}
          </View>
        </Card>

        <SectionHeader title={t('tabs.messages')} />
        <Card style={{ gap: theme.spacing.sm }}>
          <SwitchRow label={t('admin.studentChat')} value={form.studentChatEnabled !== false} onValueChange={(v) => set('studentChatEnabled', v)} />
          <Text variant="captionStrong" color="textMuted">
            {t('admin.defaultLanguage')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label={t('common.english')} selected={form.defaultLanguage === 'en'} onPress={() => set('defaultLanguage', 'en')} />
            <Chip label={t('common.arabic')} selected={form.defaultLanguage === 'ar'} onPress={() => set('defaultLanguage', 'ar')} />
          </View>
        </Card>

        <SectionHeader title={t('alarm.channelName')} />
        <Card style={{ gap: theme.spacing.md }}>
          <Input label={t('admin.alarmRepeat')} value={String(form.alarmRepeatSeconds ?? 20)} onChangeText={(v) => set('alarmRepeatSeconds', Number(v) || 0)} keyboardType="number-pad" />
          <Input label={t('admin.alarmMaxRepeats')} value={String(form.alarmMaxRepeats ?? 5)} onChangeText={(v) => set('alarmMaxRepeats', Number(v) || 0)} keyboardType="number-pad" />
          <Input label={t('admin.senderEmail')} value={SES_FROM_EMAIL || '—'} editable={false} helper={t('admin.senderEmailHint')} />
        </Card>

        <Button title={t('admin.save')} size="lg" icon="save-outline" onPress={submit} loading={save.isPending} fullWidth />
      </View>
      <Sheet visible={pick} onClose={() => setPick(false)} title={t('admin.schoolLocation')} scroll={false} maxHeightFraction={0.95}>
        <View style={{ height: 480 }}>
          <HomeLocationPicker initial={location} fallbackCenter={location} confirmLabel={t('common.save')} onConfirm={(v) => { setLocation({ lat: v.lat, lng: v.lng }); if (v.address && !form.address) set('address', v.address); setPick(false); }} />
        </View>
      </Sheet>
    </Screen>
  );
}
