import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Screen, Text, useTheme } from '../../../ui';
import { isPushSupported, registerDeviceForPush, requestPushPermission } from '../../../lib/push/notifications';
import { useSession } from '../../../lib/auth/session';
import { KV_KEYS, kv } from '../../../lib/storage/mmkv';

/** Explains why notifications matter (the bus alarm) and asks for permission + registers the device. */
export default function OnboardingNotifications() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();
  const [busy, setBusy] = useState(false);

  const finish = () => {
    kv.setString(KV_KEYS.onboardingNotif, 'done');
    router.replace('/(student)/(tabs)/bus');
  };

  const allow = async () => {
    setBusy(true);
    try {
      const ok = await requestPushPermission();
      if (ok && session.userId) await registerDeviceForPush(session.userId);
    } finally {
      setBusy(false);
      finish();
    }
  };

  return (
    <Screen scroll maxWidth={560} contentStyle={{ paddingTop: theme.spacing.huge, gap: theme.spacing.xl }}>
      <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: theme.colors.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="alarm" size={52} color={theme.colors.danger} />
        </View>
        <Text variant="title" align="center">
          {t('onboarding.notifTitle')}
        </Text>
        <Text color="textMuted" align="center">
          {t('onboarding.notifSubtitle')}
        </Text>
      </View>
      <Card tone="warning" style={{ gap: 6 }}>
        <Text variant="bodyStrong">{t('onboarding.batteryTitle')}</Text>
        <Text color="textMuted">{t('onboarding.batteryBody')}</Text>
      </Card>
      <View style={{ gap: theme.spacing.md }}>
        {isPushSupported ? <Button title={t('onboarding.allowNotifications')} size="lg" icon="notifications" onPress={allow} loading={busy} fullWidth /> : null}
        <Button title={isPushSupported ? t('onboarding.notifLater') : t('common.next')} variant="ghost" onPress={finish} />
      </View>
    </Screen>
  );
}
