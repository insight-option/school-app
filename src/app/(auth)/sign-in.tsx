import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Divider, Input, Screen, Text, useTheme } from '../../ui';
import { BrandMark } from '../../components/explore/BrandMark';
import { useBranding } from '../../features/branding';
import { toast } from '../../ui/Toast';
import { authErrorKey, signInWithId, useSession, useSessionStore } from '../../lib/auth/session';
import { setAppLanguage, currentLanguage } from '../../lib/i18n';
import { homeRouteForRole } from '../../lib/auth/routing';

export default function SignInScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { colors, spacing } = theme;
  const session = useSession();
  const branding = useBranding();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  useEffect(() => {
    if (returnTo) useSessionStore.getState().setReturnTo(returnTo);
  }, [returnTo]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session.status === 'signedIn') return <Redirect href={(session.role ? homeRouteForRole(session.role) : '/onboarding') as never} />;

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
      } else if (res.step === 'OTHER') setError(res.name);
      // DONE → the session store updates and the guards route to the workspace
    } catch (e) {
      console.warn('sign-in failed', (e as { name?: string })?.name, (e as Error)?.message, String((e as { underlyingError?: unknown })?.underlyingError ?? ''));
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll keyboard maxWidth={460} contentStyle={{ paddingTop: spacing.md }}>
      <View style={styles.topRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={10} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={[styles.back, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="arrow-back" size={22} color={colors.text} style={{ transform: [{ scaleX: theme.arabic ? -1 : 1 }] }} />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          {(['en', 'ar'] as const).map((lang) => (
            <Pressable
              key={lang}
              accessibilityRole="button"
              onPress={async () => {
                const restart = await setAppLanguage(lang);
                if (restart) toast.info(t('common.restartRequired'));
              }}
            >
              <Text variant="captionStrong" color={currentLanguage() === lang || i18n.language === lang ? 'primary' : 'textMuted'}>
                {lang === 'en' ? t('common.english') : t('common.arabic')}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ alignItems: 'center', gap: spacing.md, marginTop: spacing.xxl, marginBottom: spacing.xxxl }}>
        <View style={[styles.mark, theme.shadow.glow]}>
          <BrandMark size={84} />
        </View>
        <Text variant="overline" color="primary">
          {branding.appName}
        </Text>
        <Text variant="display" align="center">
          {t('auth.signInTitle')}
        </Text>
        <Text color="textMuted" align="center">
          {t('auth.signInSubtitle')}
        </Text>
      </View>

      <View style={{ gap: spacing.lg }}>
        <Input
          label={t('auth.schoolId')}
          placeholder={t('auth.schoolIdPlaceholder')}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          leftIcon="id-card-outline"
          returnKeyType="next"
          testID="sign-in-username"
        />
        <Input
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          leftIcon="lock-closed-outline"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={error}
          testID="sign-in-password"
        />
        <Button title={busy ? t('auth.signingIn') : t('auth.signIn')} onPress={submit} loading={busy} size="lg" fullWidth testID="sign-in-submit" />
        <Button title={t('auth.forgotPassword')} variant="ghost" onPress={() => router.push('/(auth)/forgot-password')} />
      </View>

      <View style={[styles.orRow, { marginTop: spacing.xl }]}>
        <Divider style={{ flex: 1, width: undefined }} />
        <Text variant="caption" color="textFaint">
          {t('platform.signupKind.subtitle')}
        </Text>
        <Divider style={{ flex: 1, width: undefined }} />
      </View>
      <Button title={t('platform.book.createAccount')} icon="person-add-outline" variant="outline" size="lg" fullWidth style={{ marginTop: spacing.md }} onPress={() => router.push('/(auth)/sign-up' as never)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 84, height: 84, borderRadius: 26, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
