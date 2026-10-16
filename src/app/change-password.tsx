import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Input, Screen, useTheme } from '../ui';
import { toast } from '../ui/Toast';
import { authErrorKey, changeMyPassword } from '../lib/auth/session';
import { passwordProblem } from '../lib/validation';

export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const problem = passwordProblem(next, t);
    if (problem) return setError(problem);
    if (next !== confirm) return setError(t('auth.passwordMismatch'));
    setBusy(true);
    setError(null);
    try {
      await changeMyPassword(current, next);
      toast.success(t('auth.passwordChanged'));
      router.back();
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll keyboard back title={t('auth.changePassword')} maxWidth={480}>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.lg }}>
        <Input label={t('auth.currentPassword')} value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
        <Input label={t('auth.newPassword')} value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" helper={t('auth.passwordRules')} />
        <Input label={t('auth.confirmPassword')} value={confirm} onChangeText={setConfirm} secureTextEntry error={error} onSubmitEditing={submit} />
        <Button title={t('common.save')} onPress={submit} loading={busy} size="lg" fullWidth />
      </View>
    </Screen>
  );
}
