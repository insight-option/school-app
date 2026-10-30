import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input, Screen, Text, useTheme } from '../../ui';
import { authErrorKey, signUpSchoolOwner } from '../../lib/auth/session';
import { passwordProblem } from '../../lib/validation';
import { StepDots } from '../../components/setup/StepDots';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** "Create my school" – step 1: the owner's account (e-mail + password). */
export default function SignUpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { colors, spacing } = theme;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e: typeof errors = {};
    if (name.trim().length < 2) e.name = t('common.requiredField');
    if (!EMAIL.test(email.trim())) e.email = t('auth.errors.invalidEmail');
    const pw = passwordProblem(password, t);
    if (pw) e.password = pw;
    if (confirm !== password) e.confirm = t('auth.passwordMismatch');
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const next = await signUpSchoolOwner({ name, email, password });
      router.push((next === 'CONFIRM' ? '/(auth)/verify' : '/(auth)/sign-in') as never);
    } catch (err) {
      const key = authErrorKey(err);
      if (key === 'auth.errors.accountExists' || key === 'auth.errors.invalidEmail') setErrors({ email: t(key) });
      else if (key === 'auth.errors.weakPassword') setErrors({ password: t(key) });
      else setErrors({ confirm: t(key) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll keyboard maxWidth={480} contentStyle={{ paddingTop: spacing.md }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={10} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={[styles.back, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </Pressable>
      <View style={{ gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.xxl }}>
        <StepDots current={1} total={3} label={t('signup.stepOf', { current: 1, total: 3 })} />
        <Text variant="display">{t('signup.title')}</Text>
        <Text color="textMuted">{t('signup.subtitle')}</Text>
      </View>
      <View style={{ gap: spacing.lg }}>
        <Input label={t('signup.name')} value={name} onChangeText={setName} autoCapitalize="words" textContentType="name" autoComplete="name" leftIcon="person-outline" error={errors.name} testID="signup-name" />
        <Input
          label={t('signup.email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          autoComplete="email"
          leftIcon="mail-outline"
          error={errors.email}
          testID="signup-email"
        />
        <Input
          label={t('signup.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          leftIcon="lock-closed-outline"
          helper={t('auth.passwordRules')}
          error={errors.password}
          testID="signup-password"
        />
        <Input
          label={t('signup.confirm')}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          textContentType="newPassword"
          leftIcon="lock-closed-outline"
          error={errors.confirm}
          returnKeyType="go"
          onSubmitEditing={submit}
          testID="signup-confirm"
        />
        <Text variant="caption" color="textMuted">
          {t('signup.terms')}
        </Text>
        <Button title={t('signup.continue')} icon="arrow-forward" size="lg" fullWidth loading={busy} onPress={submit} testID="signup-submit" />
        <View style={styles.row}>
          <Text color="textMuted">{t('signup.haveAccount')}</Text>
          <Pressable accessibilityRole="link" onPress={() => router.replace('/(auth)/sign-in')} hitSlop={8}>
            <Text variant="bodyStrong" color="primary">
              {t('signup.signIn')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
});
