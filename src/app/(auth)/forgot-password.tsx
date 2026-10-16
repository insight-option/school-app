import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Input, Screen, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { authErrorKey, confirmPasswordReset, requestPasswordReset } from '../../lib/auth/session';
import { passwordProblem } from '../../lib/validation';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const [username, setUsername] = useState('');
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [destination, setDestination] = useState<string | undefined>();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async () => {
    if (!username.trim()) return setError(t('common.requiredField'));
    setBusy(true);
    setError(null);
    try {
      const res = await requestPasswordReset(username);
      setDestination(res.destination);
      setStep('confirm');
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    const problem = passwordProblem(password, t);
    if (problem) return setError(problem);
    if (password !== confirm) return setError(t('auth.passwordMismatch'));
    if (!code.trim()) return setError(t('common.requiredField'));
    setBusy(true);
    setError(null);
    try {
      await confirmPasswordReset(username, code, password);
      toast.success(t('auth.passwordResetDone'));
      router.replace('/(auth)/sign-in');
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll keyboard maxWidth={480} back title={t('auth.resetTitle')}>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.lg }}>
        <Text color="textMuted">{t('auth.resetSubtitle')}</Text>
        <Input label={t('auth.schoolId')} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} editable={step === 'request'} leftIcon="id-card-outline" />
        {step === 'request' ? (
          <Button title={t('auth.sendCode')} onPress={request} loading={busy} size="lg" fullWidth />
        ) : (
          <>
            {destination ? (
              <Text variant="caption" color="success">
                {t('auth.codeSentTo', { destination })}
              </Text>
            ) : null}
            <Input label={t('auth.code')} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" leftIcon="key-outline" />
            <Input label={t('auth.newPassword')} value={password} onChangeText={setPassword} secureTextEntry helper={t('auth.passwordRules')} />
            <Input label={t('auth.confirmPassword')} value={confirm} onChangeText={setConfirm} secureTextEntry error={error} />
            <Button title={t('auth.resetPassword')} onPress={finish} loading={busy} size="lg" fullWidth />
          </>
        )}
        {step === 'request' && error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}
        <Button title={t('auth.backToSignIn')} variant="ghost" onPress={() => router.replace('/(auth)/sign-in')} />
      </View>
    </Screen>
  );
}
