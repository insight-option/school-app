import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input, Screen, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { authErrorKey, confirmSchoolOwner, resendOwnerCode, signInWithId, useSessionStore } from '../../lib/auth/session';
import { StepDots } from '../../components/setup/StepDots';

const RESEND_SECONDS = 30;

/** "Create my school" – step 2: the e-mailed verification code, then automatic sign-in. */
export default function VerifyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { colors, spacing, radius } = theme;
  const draft = useSessionStore((s) => s.signup);
  const [email, setEmail] = useState(draft?.email ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  useEffect(() => {
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  const verify = async (value = code) => {
    if (value.length !== 6 || !email.trim()) {
      setError(t('common.requiredField'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await confirmSchoolOwner(email, value);
      if (draft?.password) {
        const res = await signInWithId(email.trim().toLowerCase(), draft.password);
        useSessionStore.getState().setSignup(null);
        if (res.step === 'DONE') router.replace('/onboarding/school' as never);
        else router.replace('/(auth)/sign-in');
      } else {
        toast.success(t('signup.signInToContinue'));
        router.replace('/(auth)/sign-in');
      }
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      await resendOwnerCode(email);
      setCooldown(RESEND_SECONDS);
      toast.success(t('signup.resent'));
    } catch (e) {
      toast.error(t(authErrorKey(e)));
    }
  };

  return (
    <Screen scroll keyboard maxWidth={480} contentStyle={{ paddingTop: spacing.md }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={10} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={[styles.back, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </Pressable>
      <View style={{ gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.xxl }}>
        <StepDots current={2} total={3} label={t('signup.stepOf', { current: 2, total: 3 })} />
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="mail-unread-outline" size={30} color={colors.primary} />
        </View>
        <Text variant="display">{t('signup.verifyTitle')}</Text>
        <Text color="textMuted">{t('signup.verifyBody', { email: email || '…' })}</Text>
      </View>
      <View style={{ gap: spacing.lg }}>
        {!draft?.email ? <Input label={t('signup.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} leftIcon="mail-outline" /> : null}
        <View style={{ gap: 6 }}>
          <Text variant="captionStrong" color="textMuted">
            {t('signup.code')}
          </Text>
          <TextInput
            value={code}
            onChangeText={(v) => {
              const digits = v.replace(/\D/g, '').slice(0, 6);
              setCode(digits);
              if (digits.length === 6) void verify(digits);
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            placeholderTextColor={colors.textFaint}
            style={[styles.code, { color: colors.text, borderColor: error ? colors.danger : colors.border, backgroundColor: colors.surface, borderRadius: radius.md }]}
            accessibilityLabel={t('signup.code')}
            testID="verify-code"
          />
          {error ? (
            <Text variant="caption" color="danger">
              {error}
            </Text>
          ) : null}
        </View>
        <Button title={busy ? t('signup.verifying') : t('signup.verify')} icon="checkmark-circle-outline" size="lg" fullWidth loading={busy} onPress={() => void verify()} testID="verify-submit" />
        <Button title={cooldown > 0 ? t('signup.resendIn', { seconds: cooldown }) : t('signup.resend')} variant="ghost" disabled={cooldown > 0 || !email} onPress={resend} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  code: { borderWidth: 1, height: 64, fontSize: 30, letterSpacing: 14, textAlign: 'center', fontWeight: '700' },
});
