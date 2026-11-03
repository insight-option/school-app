import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, PressableScale, Screen, Text, useTheme } from '../../ui';
import { withAlpha } from '../../ui/theme';
import { toast } from '../../ui/Toast';
import { registerCustomerAccount, signOutEverywhere, useSession, useSessionStore, type SignupKind } from '../../lib/auth/session';
import { currentLanguage } from '../../lib/i18n';
import { BrandMark } from '../../components/explore/BrandMark';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * A verified, signed-in account that has no workspace yet. Continues with the kind chosen at
 * sign-up (business / school wizard, or creates the customer profile), otherwise asks.
 */
export default function OnboardingChooser() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors, spacing } = theme;
  const router = useRouter();
  const session = useSession();
  const draft = useSessionStore((s) => s.signup);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const becomeCustomer = async (name: string, phone?: string) => {
    setBusy(true);
    try {
      await registerCustomerAccount({ name, phone, language: currentLanguage() });
      const back = useSessionStore.getState().returnTo;
      useSessionStore.getState().setSignup(null);
      if (back) {
        useSessionStore.getState().setReturnTo(null);
        router.replace(back as never);
      }
      // otherwise the CUSTOMER guard routes to Explore
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  // Customers who just verified their e-mail are set up without another tap.
  useEffect(() => {
    if (draft?.kind !== 'customer' || started.current) return;
    started.current = true;
    void becomeCustomer(draft.name || session.name || '', draft.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.kind]);

  if (draft?.kind === 'business') return <Redirect href={'/onboarding/business' as never} />;
  if (draft?.kind === 'school') return <Redirect href={'/onboarding/school' as never} />;

  if (busy || draft?.kind === 'customer') {
    return (
      <Screen>
        <View style={styles.center}>
          <BrandMark size={64} />
          <ActivityIndicator color={colors.primary} />
          <Text color="textMuted">{t('platform.customerSignup.finishing')}</Text>
        </View>
      </Screen>
    );
  }

  const fallbackName = session.name || (session.email ?? '').split('@')[0];
  const options: { kind: SignupKind; icon: IconName; title: string; body: string; color: string }[] = [
    { kind: 'customer', icon: 'calendar', title: t('platform.signupKind.customer'), body: t('platform.signupKind.customerBody'), color: colors.primary },
    { kind: 'business', icon: 'storefront', title: t('platform.signupKind.business'), body: t('platform.signupKind.businessBody'), color: '#0C8599' },
    { kind: 'school', icon: 'school', title: t('platform.signupKind.school'), body: t('platform.signupKind.schoolBody'), color: '#6E56CF' },
  ];
  const choose = (kind: SignupKind) => {
    if (kind === 'customer') void becomeCustomer(fallbackName);
    else router.replace((kind === 'business' ? '/onboarding/business' : '/onboarding/school') as never);
  };

  return (
    <Screen scroll maxWidth={520} contentStyle={{ paddingTop: spacing.xl }}>
      <View style={{ gap: spacing.sm, marginBottom: spacing.xxl }}>
        <BrandMark size={52} />
        <Text variant="display" style={{ marginTop: spacing.md }}>
          {t('platform.onboarding.title')}
        </Text>
        <Text color="textMuted">{t('platform.onboarding.subtitle')}</Text>
      </View>
      <View style={{ gap: spacing.md }}>
        {options.map((o) => (
          <PressableScale key={o.kind} onPress={() => choose(o.kind)} accessibilityLabel={o.title}>
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
      <Button title={t('platform.account.signOut')} variant="ghost" icon="log-out-outline" style={{ marginTop: spacing.xxl }} onPress={() => void signOutEverywhere()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 },
  kindIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
