import React, { useRef, useState } from 'react';
import { type TextInputInstance } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '../../ui';
import { toast } from '../../ui/Toast';
import { AuthShell, IdentityChip, PasswordRules } from '../../components/auth/AuthShell';
import { authErrorKey, completeNewPassword, useSessionStore } from '../../lib/auth/session';
import { passwordProblem } from '../../lib/validation';

/** Forced password change on first login (Cognito FORCE_CHANGE_PASSWORD). */
export default function NewPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const pendingUsername = useSessionStore((s) => s.pendingUsername);
  const confirmRef = useRef<TextInputInstance>(null);
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
      // the sign-in session expires after a few minutes – start over from the sign-in screen
      if ((e as { name?: string })?.name === 'SignInException' || /session/i.test((e as Error)?.message ?? '')) {
        useSessionStore.getState().setPendingUsername(null);
        toast.info(t('auth.errors.sessionExpired'));
        router.replace('/(auth)/sign-in');
        return;
      }
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell icon="shield-checkmark" title={t('auth.newPasswordTitle')} subtitle={t('auth.newPasswordSubtitle')}>
      {pendingUsername ? <IdentityChip label={t('auth.username')} value={pendingUsername} /> : null}
      <Input
        label={t('auth.newPassword')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        leftIcon="lock-closed-outline"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <PasswordRules password={password} />
      <Input
        ref={confirmRef}
        label={t('auth.confirmPassword')}
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        leftIcon="lock-closed-outline"
        error={error}
        onSubmitEditing={submit}
        returnKeyType="go"
      />
      <Button title={t('auth.setPassword')} onPress={submit} loading={busy} size="lg" fullWidth iconRight="arrow-forward" />
    </AuthShell>
  );
}
