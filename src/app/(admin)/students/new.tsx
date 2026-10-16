import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button, Input, Screen, Select, Sheet, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { HomeLocationPicker } from '../../../components/map/HomeLocationPicker';
import { useBuses, useClasses, useCreateStudent } from '../../../features/school';
import { useSettings } from '../../../features/settings';
import { emailSchema, fieldErrors, generatePassword, passwordProblem, usernameSchema } from '../../../lib/validation';
import type { LatLng } from '../../../lib/geo';

const Schema = z.object({
  username: usernameSchema,
  password: z.string().min(8),
  parentEmail: emailSchema,
  fullName: z.string().trim().min(2).max(120),
  parentPhone: z.string().trim().max(32).optional(),
  homeAddress: z.string().trim().max(400).optional(),
  classId: z.string().optional(),
  busId: z.string().optional(),
});

/** One-page "Add student" form – designed to take under 30 seconds. */
export default function AdminNewStudent() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const classes = useClasses();
  const buses = useBuses();
  const settings = useSettings();
  const create = useCreateStudent();
  const [form, setForm] = useState({ username: '', password: generatePassword(), parentEmail: '', fullName: '', parentPhone: '', homeAddress: '', classId: '', busId: '' });
  const [home, setHome] = useState<LatLng | null>(null);
  const [pickHome, setPickHome] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const bus = buses.data?.find((b) => b.busId === form.busId);
  const overCapacity = bus && (bus.studentCount ?? 0) >= (bus.capacity ?? 0);

  const submit = () => {
    const pw = passwordProblem(form.password, t);
    const r = fieldErrors(Schema, { ...form, parentPhone: form.parentPhone || undefined, homeAddress: form.homeAddress || undefined, classId: form.classId || undefined, busId: form.busId || undefined });
    const errs = r.ok ? {} : r.errors;
    if (pw) errs.password = pw;
    setErrors(errs);
    if (Object.keys(errs).length || !r.ok) return;
    create.mutate(
      { ...r.data, homeLat: home?.lat, homeLng: home?.lng },
      {
        onSuccess: (res) => {
          toast.success(t('admin.studentCreated', { email: form.parentEmail }));
          if (res?.userId) router.replace(`/(admin)/students/${res.userId}` as never);
          else router.back();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <Screen back title={t('admin.addStudent')} scroll keyboard maxWidth={640}>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.md }}>
        <Input label={t('auth.schoolId')} value={form.username} onChangeText={set('username')} error={errors.username} required autoCapitalize="none" autoCorrect={false} placeholder={t('auth.schoolIdPlaceholder')} />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <Input label={t('admin.temporaryPassword')} value={form.password} onChangeText={set('password')} error={errors.password} required autoCapitalize="none" containerStyle={{ flex: 1 }} helper={t('auth.passwordRules')} />
          <Button title={t('admin.generatePassword')} variant="outline" onPress={() => set('password')(generatePassword())} style={{ marginBottom: errors.password ? 22 : 22 }} />
        </View>
        <Input label={t('admin.parentEmail')} value={form.parentEmail} onChangeText={set('parentEmail')} error={errors.parentEmail} required keyboardType="email-address" autoCapitalize="none" helper={t('admin.studentCreated', { email: form.parentEmail || '…' })} />
        <Input label={t('common.fullName')} value={form.fullName} onChangeText={set('fullName')} error={errors.fullName} required />
        <Select label={t('admin.class')} options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.name, subtitle: c.grade ?? undefined }))} value={form.classId || null} onChange={(v) => set('classId')((v as string) ?? '')} searchable />
        <Select label={t('admin.bus')} options={(buses.data ?? []).map((b) => ({ value: b.busId, label: `${b.plate} · ${b.driverName}`, subtitle: t('admin.capacityUsage', { used: b.studentCount ?? 0, capacity: b.capacity ?? 0 }) }))} value={form.busId || null} onChange={(v) => set('busId')((v as string) ?? '')} searchable />
        {overCapacity ? (
          <Text variant="caption" color="danger">
            {t('admin.capacityExceeded', { count: (bus!.studentCount ?? 0) + 1 - (bus!.capacity ?? 0) })}
          </Text>
        ) : null}
        <Input label={t('admin.parentPhone')} value={form.parentPhone} onChangeText={set('parentPhone')} keyboardType="phone-pad" placeholder="+9665…" />
        <Input label={t('admin.homeAddress')} value={form.homeAddress} onChangeText={set('homeAddress')} />
        <Button title={home ? `${t('admin.homeLocation')}: ${home.lat.toFixed(4)}, ${home.lng.toFixed(4)}` : t('admin.setHome')} variant="outline" icon="location-outline" onPress={() => setPickHome(true)} />
        <Button title={t('common.create')} size="lg" icon="person-add" onPress={submit} loading={create.isPending} fullWidth />
      </View>
      <Sheet visible={pickHome} onClose={() => setPickHome(false)} title={t('admin.homeLocation')} scroll={false} maxHeightFraction={0.95}>
        <View style={{ height: 480 }}>
          <HomeLocationPicker initial={home} fallbackCenter={settings.data?.schoolLocation ?? null} onConfirm={(v) => { setHome({ lat: v.lat, lng: v.lng }); if (v.address && !form.homeAddress) set('homeAddress')(v.address); setPickHome(false); }} />
        </View>
      </Sheet>
    </Screen>
  );
}
