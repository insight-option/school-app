import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button, Input, Screen, Select, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { useClasses, useCreateTeacher } from '../../../features/school';
import { emailSchema, fieldErrors, generatePassword, passwordProblem, usernameSchema } from '../../../lib/validation';

const Schema = z.object({ username: usernameSchema, password: z.string().min(8), email: emailSchema, fullName: z.string().trim().min(2).max(120), phone: z.string().trim().max(32).optional() });

export default function AdminNewTeacher() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const classes = useClasses();
  const create = useCreateTeacher();
  const [form, setForm] = useState({ username: '', password: generatePassword(), email: '', fullName: '', phone: '' });
  const [classIds, setClassIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const r = fieldErrors(Schema, { ...form, phone: form.phone || undefined });
    const errs = r.ok ? {} : r.errors;
    const pw = passwordProblem(form.password, t);
    if (pw) errs.password = pw;
    setErrors(errs);
    if (!r.ok || Object.keys(errs).length) return;
    create.mutate(
      { ...r.data, classIds },
      {
        onSuccess: (res) => {
          toast.success(t('admin.teacherCreated', { email: form.email }));
          if (res?.userId) router.replace(`/(admin)/teachers/${res.userId}` as never);
          else router.back();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <Screen back title={t('admin.addTeacher')} scroll keyboard maxWidth={640}>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.md }}>
        <Input label={t('auth.schoolId')} value={form.username} onChangeText={set('username')} error={errors.username} required autoCapitalize="none" autoCorrect={false} />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <Input label={t('admin.temporaryPassword')} value={form.password} onChangeText={set('password')} error={errors.password} required autoCapitalize="none" containerStyle={{ flex: 1 }} helper={t('auth.passwordRules')} />
          <Button title={t('admin.generatePassword')} variant="outline" onPress={() => set('password')(generatePassword())} style={{ marginBottom: 22 }} />
        </View>
        <Input label={t('common.email')} value={form.email} onChangeText={set('email')} error={errors.email} required keyboardType="email-address" autoCapitalize="none" />
        <Input label={t('common.fullName')} value={form.fullName} onChangeText={set('fullName')} error={errors.fullName} required />
        <Input label={t('common.phone')} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="+9665…" />
        <Select label={t('admin.assignClasses')} options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.name, subtitle: c.teacherName ? `${t('admin.assignTeacher')}: ${c.teacherName}` : t('admin.noTeacher') }))} value={classIds} onChange={(v) => setClassIds((v as string[]) ?? [])} multiple searchable />
        <Button title={t('common.create')} size="lg" icon="person-add" onPress={submit} loading={create.isPending} fullWidth />
      </View>
    </Screen>
  );
}
