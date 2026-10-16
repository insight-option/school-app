import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button, Card, Input, Screen, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { useCreateBus } from '../../../features/school';
import { fieldErrors, generatePassword, passwordProblem, usernameSchema } from '../../../lib/validation';
import { copyText, shareText } from '../../../lib/util/device';

const Schema = z.object({
  username: usernameSchema,
  password: z.string().min(8),
  plate: z.string().trim().min(2).max(32),
  driverName: z.string().trim().min(2).max(120),
  driverPhone: z.string().trim().max(32).optional(),
  capacity: z.number().int().min(1).max(200),
  email: z.string().optional(),
});

export default function AdminNewBus() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const create = useCreateBus();
  const [form, setForm] = useState({ username: '', password: generatePassword(), plate: '', driverName: '', driverPhone: '', capacity: '40', email: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const r = fieldErrors(Schema, { ...form, driverPhone: form.driverPhone || undefined, capacity: Number(form.capacity), email: form.email || undefined });
    const errs = r.ok ? {} : r.errors;
    const pw = passwordProblem(form.password, t);
    if (pw) errs.password = pw;
    setErrors(errs);
    if (!r.ok || Object.keys(errs).length) return;
    create.mutate(r.data, {
      onSuccess: (res) => {
        toast.success(t('admin.busCreated'));
        setCreated({ username: res?.username ?? form.username, password: res?.temporaryPassword ?? form.password });
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const credsText = created ? `${t('auth.schoolId')}: ${created.username}\n${t('common.password')}: ${created.password}` : '';

  return (
    <Screen back title={t('admin.addBus')} scroll keyboard maxWidth={640}>
      {created ? (
        <Card tone="success" style={{ gap: theme.spacing.md, marginTop: theme.spacing.lg }}>
          <Text variant="heading">{t('admin.credentialsTitle')}</Text>
          <Text color="textMuted">{t('admin.credentialsBody')}</Text>
          <Text variant="title" selectable>
            {created.username}
          </Text>
          <Text variant="title" selectable>
            {created.password}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button title={t('common.copy')} icon="copy-outline" variant="secondary" onPress={() => copyText(credsText, t('common.copied'))} />
            <Button title={t('common.share')} icon="share-social-outline" variant="outline" onPress={() => shareText(credsText, t('admin.credentialsTitle'))} />
            <Button title={t('common.done')} onPress={() => router.replace(`/(admin)/buses/${created.username}` as never)} />
          </View>
        </Card>
      ) : (
        <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.md }}>
          <Input label={`${t('auth.schoolId')} (${t('admin.bus')})`} value={form.username} onChangeText={set('username')} error={errors.username} required autoCapitalize="characters" autoCorrect={false} placeholder="BUS-01" />
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <Input label={t('common.password')} value={form.password} onChangeText={set('password')} error={errors.password} required autoCapitalize="none" containerStyle={{ flex: 1 }} helper={t('auth.passwordRules')} />
            <Button title={t('admin.generatePassword')} variant="outline" onPress={() => set('password')(generatePassword())} style={{ marginBottom: 22 }} />
          </View>
          <Input label={t('admin.plate')} value={form.plate} onChangeText={set('plate')} error={errors.plate} required autoCapitalize="characters" />
          <Input label={t('admin.driverName')} value={form.driverName} onChangeText={set('driverName')} error={errors.driverName} required />
          <Input label={t('admin.driverPhone')} value={form.driverPhone} onChangeText={set('driverPhone')} keyboardType="phone-pad" placeholder="+9665…" />
          <Input label={t('admin.capacity')} value={form.capacity} onChangeText={set('capacity')} error={errors.capacity} keyboardType="number-pad" />
          <Input label={t('admin.driverEmail')} value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
          <Button title={t('common.create')} size="lg" icon="bus" onPress={submit} loading={create.isPending} fullWidth />
        </View>
      )}
    </Screen>
  );
}
