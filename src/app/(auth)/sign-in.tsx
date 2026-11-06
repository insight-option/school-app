import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInputInstance } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Divider, Input, Text, useTheme, withAlpha } from '../../ui';
import { AuthShell } from '../../components/auth/AuthShell';
import { authErrorKey, signInWithId, useSession, useSessionStore } from '../../lib/auth/session';
import { homeRouteForRole } from '../../lib/auth/routing';

export default function SignInScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const session = useSession();
  const passwordRef = useRef<TextInputInstance>(null);
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  useEffect(() => {
    if (returnTo) useSessionStore.getState().setReturnTo(returnTo);
  }, [returnTo]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "/" resumes a pending return-to page (e.g. the booking a guest started) before the workspace.
  if (session.status === 'signedIn') return <Redirect href={(!session.role ? '/onboarding' : useSessionStore.getState().returnTo ? '/' : homeRouteForRole(session.role)) as never} />;

  const submit = async () => {
    if (!username.trim() || !password) {
      setError(t('common.requiredField'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await signInWithId(username, password);
      if (res.step === 'NEW_PASSWORD') router.replace('/(auth)/new-password');
      else if (res.step === 'CONFIRM_SIGN_UP') {
        useSessionStore.getState().setSignup({ email: username.trim().toLowerCase(), password, name: '' });
        router.push('/(auth)/verify' as never);
      } else if (res.step === 'OTHER') setError(t(res.name === 'RESET_PASSWORD' ? 'auth.errors.resetRequired' : 'auth.errors.unsupportedStep'));
      // DONE → the session store updates and the guards route to the workspace
    } catch (e) {
      console.warn('sign-in failed', (e as { name?: string })?.name, (e as Error)?.message, String((e as { underlyingError?: unknown })?.underlyingError ?? ''));
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={t('auth.signInTitle')}
      subtitle={t('auth.signInSubtitle')}
      footer={
        <View style={{ gap: spacing.md }}>
          <View style={styles.orRow}>
            <Divider style={{ flex: 1, width: undefined }} />
            <Text variant="caption" color="textFaint">
              {t('platform.signupKind.subtitle')}
            </Text>
            <Divider style={{ flex: 1, width: undefined }} />
          </View>
          <Button title={t('platform.book.createAccount')} icon="person-add-outline" variant="outline" size="lg" fullWidth onPress={() => router.push('/(auth)/sign-up' as never)} />
        </View>
      }
    >
      <Input
        label={t('auth.schoolId')}
        placeholder={t('auth.schoolIdPlaceholder')}
        value={username}
        onChangeText={(v) => {
          setUsername(v);
          if (error) setError(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        keyboardType="email-address"
        leftIcon="person-outline"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        submitBehavior="submit"
        testID="sign-in-username"
      />
      <View style={{ gap: spacing.sm }}>
        <Input
          ref={passwordRef}
          label={t('auth.password')}
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (error) setError(null);
          }}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          leftIcon="lock-closed-outline"
          returnKeyType="go"
          onSubmitEditing={submit}
          testID="sign-in-password"
        />
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/(auth)/forgot-password')} style={{ alignSelf: 'flex-end', paddingVertical: 4 }}>
          <Text variant="captionStrong" color="primary">
            {t('auth.forgotPassword')}
          </Text>
        </Pressable>
      </View>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: withAlpha(colors.danger, 0.1), borderColor: withAlpha(colors.danger, 0.25) }]} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={18} color={colors.danger} />
          <Text variant="caption" weight="600" color="danger" style={{ flex: 1 }}>
            {error}
          </Text>
        </View>
      ) : null}
      <Button title={busy ? t('auth.signingIn') : t('auth.signIn')} onPress={submit} loading={busy} size="lg" fullWidth iconRight="arrow-forward" testID="sign-in-submit" />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
});
