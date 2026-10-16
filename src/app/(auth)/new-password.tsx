import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Input, Screen, Text, useTheme } from '../../ui';
import { authErrorKey, completeNewPassword, useSessionStore } from '../../lib/auth/session';
import { passwordProblem } from '../../lib/validation';

/** Forced password change on first login (Cognito FORCE_CHANGE_PASSWORD). */
export default function NewPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const pendingUsername = useSessionStore((s) => s.pendingUsername);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const problem = passwordProblem(password, t);
    if (problem) return setError(problem);
    if (password !== confirm) return setError(t('auth.passwordMismatch'));
    setBusy(true);
    setError(null);
    try {
      await completeNewPassword(password);
      router.replace('/');
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll keyboard maxWidth={480} back title={t('auth.newPasswordTitle')}>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.lg }}>
        <Text color="textMuted">{t('auth.newPasswordSubtitle')}</Text>
        {pendingUsername ? (
          <Text variant="captionStrong" color="textMuted">
            {t('auth.schoolId')}: {pendingUsername}
          </Text>
        ) : null}
        <Input label={t('auth.newPassword')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" helper={t('auth.passwordRules')} />
        <Input label={t('auth.confirmPassword')} value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" error={error} onSubmitEditing={submit} returnKeyType="go" />
        <Button title={t('auth.setPassword')} onPress={submit} loading={busy} size="lg" fullWidth />
      </View>
    </Screen>
  );
}
