import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input, PressableScale, Screen, Text, useTheme } from '../../ui';
import { withAlpha } from '../../ui/theme';
import { authErrorKey, signUpSchoolOwner, useSessionStore, type SignupKind } from '../../lib/auth/session';
import { passwordProblem } from '../../lib/validation';
import { StepDots } from '../../components/setup/StepDots';
import { BrandMark } from '../../components/explore/BrandMark';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const KINDS: SignupKind[] = ['customer', 'business', 'school'];
type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Create an account. Without `?kind=` the screen first asks what the account is for (book
 * activities / list a business / create a school); the e-mail code step and the set-up follow.
 */
export default function SignUpScreen() {
  const params = useLocalSearchParams<{ kind?: string; returnTo?: string }>();
  const kind = KINDS.includes(params.kind as SignupKind) ? (params.kind as SignupKind) : null;
  useEffect(() => {
    if (params.returnTo) useSessionStore.getState().setReturnTo(params.returnTo);
  }, [params.returnTo]);
  if (!kind) return <KindChooser />;
  return <AccountForm kind={kind} returnTo={params.returnTo} />;
}

function KindChooser() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { colors, spacing } = theme;
  const options: { kind: SignupKind; icon: IconName; title: string; body: string; color: string }[] = [
    { kind: 'customer', icon: 'calendar', title: t('platform.signupKind.customer'), body: t('platform.signupKind.customerBody'), color: colors.primary },
    { kind: 'business', icon: 'storefront', title: t('platform.signupKind.business'), body: t('platform.signupKind.businessBody'), color: '#0C8599' },
    { kind: 'school', icon: 'school', title: t('platform.signupKind.school'), body: t('platform.signupKind.schoolBody'), color: '#6E56CF' },
  ];
  return (
    <Screen scroll maxWidth={520} contentStyle={{ paddingTop: spacing.md }}>
      <BackButton />
      <View style={{ gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.xxl, alignItems: 'flex-start' }}>
        <BrandMark size={52} />
        <Text variant="display" style={{ marginTop: spacing.md }}>
          {t('platform.signupKind.title')}
        </Text>
        <Text color="textMuted">{t('platform.signupKind.subtitle')}</Text>
      </View>
      <View style={{ gap: spacing.md }}>
        {options.map((o) => (
          <PressableScale key={o.kind} onPress={() => router.setParams({ kind: o.kind })} accessibilityLabel={o.title}>
            <View style={[styles.kind, { backgroundColor: colors.surface, borderRadius: theme.radius.xl }, theme.scheme === 'dark' ? { borderWidth: 1, borderColor: colors.border } : null, theme.shadow.card]}>
              <View style={[styles.kindIcon, { backgroundColor: withAlpha(o.color, theme.scheme === 'dark' ? 0.22 : 0.12) }]}>
                <Ionicons name={o.icon} size={26} color={o.color} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="subheading">{o.title}</Text>
                <Text variant="caption" color="textMuted">
                  {o.body}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textFaint} style={{ transform: [{ scaleX: theme.arabic ? -1 : 1 }] }} />
            </View>
          </PressableScale>
        ))}
      </View>
      <View style={[styles.row, { marginTop: spacing.xxl }]}>
        <Text color="textMuted">{t('signup.haveAccount')}</Text>
        <Pressable accessibilityRole="link" onPress={() => router.replace('/(auth)/sign-in')} hitSlop={8}>
          <Text variant="bodyStrong" color="primary">
            {t('signup.signIn')}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function AccountForm({ kind, returnTo }: { kind: SignupKind; returnTo?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { spacing } = theme;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);
  const customer = kind === 'customer';

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
      const next = await signUpSchoolOwner({ name, email, password, kind, phone: phone.trim() || undefined, returnTo });
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

  const title = customer ? t('platform.customerSignup.title') : kind === 'business' ? t('platform.signupKind.business') : t('signup.title');
  const subtitle = customer ? t('platform.customerSignup.subtitle') : t('signup.subtitle');

  return (
    <Screen scroll keyboard maxWidth={480} contentStyle={{ paddingTop: spacing.md }}>
      <BackButton />
      <View style={{ gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.xxl }}>
        <StepDots current={1} total={customer ? 2 : 3} label={t('signup.stepOf', { current: 1, total: customer ? 2 : 3 })} />
        <Text variant="display">{title}</Text>
        <Text color="textMuted">{subtitle}</Text>
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
        {customer ? (
          <Input label={t('platform.customerSignup.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" leftIcon="call-outline" />
        ) : null}
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
        <Button title={t('signup.continue')} iconRight="arrow-forward" size="lg" fullWidth loading={busy} onPress={submit} testID="signup-submit" />
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

function BackButton() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      hitSlop={10}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={[styles.back, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      <Ionicons name="arrow-back" size={21} color={theme.colors.text} style={{ transform: [{ scaleX: theme.arabic ? -1 : 1 }] }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 },
  kindIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
