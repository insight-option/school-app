import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input, Text, useTheme, withAlpha } from '../../ui';
import { AuthShell, PasswordRules } from '../../components/auth/AuthShell';
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
  // the account the code was sent for (an owner's e-mail resolves to their username)
  const [resetFor, setResetFor] = useState<string | null>(null);
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
      setResetFor(res.username);
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
      await confirmPasswordReset(resetFor ?? username, code, password);
      toast.success(t('auth.passwordResetDone'));
      router.replace('/(auth)/sign-in');
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell icon="key" title={t('auth.resetTitle')} subtitle={t('auth.resetSubtitle')}>
      <Input
        label={t('auth.schoolId')}
        placeholder={t('auth.schoolIdPlaceholder')}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={step === 'request'}
        leftIcon="person-outline"
        returnKeyType="send"
        onSubmitEditing={step === 'request' ? request : undefined}
      />
      {step === 'request' ? (
        <Button title={t('auth.sendCode')} onPress={request} loading={busy} size="lg" fullWidth iconRight="arrow-forward" />
      ) : (
        <>
          {destination ? (
            <View style={[styles.sent, { backgroundColor: withAlpha(theme.colors.success, 0.1) }]}>
              <Ionicons name="mail-unread" size={18} color={theme.colors.success} />
              <Text variant="caption" weight="600" color="success" style={{ flex: 1 }}>
                {t('auth.codeSentTo', { destination })}
              </Text>
            </View>
          ) : null}
          <Input label={t('auth.code')} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" leftIcon="keypad-outline" />
          <Input label={t('auth.newPassword')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" leftIcon="lock-closed-outline" />
          <PasswordRules password={password} />
          <Input label={t('auth.confirmPassword')} value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" leftIcon="lock-closed-outline" error={error} />
          <Button title={t('auth.resetPassword')} onPress={finish} loading={busy} size="lg" fullWidth />
        </>
      )}
      {step === 'request' && error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
      <Button title={t('auth.backToSignIn')} variant="ghost" onPress={() => router.replace('/(auth)/sign-in')} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  sent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14 },
});
