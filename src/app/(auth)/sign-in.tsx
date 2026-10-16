import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input, Screen, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { authErrorKey, signInWithId, useSession } from '../../lib/auth/session';
import { setAppLanguage, currentLanguage } from '../../lib/i18n';
import { SCHOOL_NAME_FALLBACK } from '../../lib/amplify';
import { homeRouteForRole } from '../../lib/auth/routing';

export default function SignInScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const session = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session.status === 'signedIn' && session.role) return <Redirect href={homeRouteForRole(session.role) as never} />;

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
      else if (res.step === 'OTHER') setError(res.name);
      // DONE → session store updates and index redirects
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const noRole = session.status === 'signedIn' && !session.role;

  return (
    <Screen scroll keyboard maxWidth={480} contentStyle={{ paddingTop: theme.spacing.huge }}>
      <View style={{ alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.xxxl }}>
        <View style={{ width: 84, height: 84, borderRadius: 24, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="bus" size={44} color={theme.colors.onPrimary} />
        </View>
        <Text variant="display" align="center">
          {SCHOOL_NAME_FALLBACK}
        </Text>
        <Text color="textMuted" align="center">
          {t('auth.signInSubtitle')}
        </Text>
      </View>

      {noRole ? (
        <View style={{ backgroundColor: theme.colors.warningSoft, padding: theme.spacing.lg, borderRadius: theme.radius.md, marginBottom: theme.spacing.lg }}>
          <Text variant="bodyStrong">{t('auth.noRoleTitle')}</Text>
          <Text color="textMuted">{t('auth.noRoleBody')}</Text>
        </View>
      ) : null}

      <View style={{ gap: theme.spacing.lg }}>
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

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.lg, marginTop: theme.spacing.huge }}>
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
    </Screen>
  );
}
