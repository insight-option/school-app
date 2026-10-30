import React, { useCallback, useState } from 'react';
import { AppState, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Text, useTheme } from '../../ui';
import { getPushPermissionStatus, isPushSupported, openSystemNotificationSettings, registerDeviceForPush, requestPushPermission } from '../../lib/push/notifications';
import { useSession } from '../../lib/auth/session';

/**
 * Shown on the family's Bus tab whenever notifications are not allowed: without them the driver's
 * alarm cannot ring on this phone. Re-checks when the app returns from the system settings.
 */
export function NotificationBanner() {
  const { t } = useTranslation();
  const theme = useTheme();
  const session = useSession();
  const [status, setStatus] = useState<'granted' | 'denied' | 'undetermined' | 'unsupported' | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const check = () => void getPushPermissionStatus().then((s) => alive && setStatus(s));
      check();
      const sub = AppState.addEventListener('change', (st) => st === 'active' && check());
      return () => {
        alive = false;
        sub.remove();
      };
    }, []),
  );

  if (!isPushSupported || status === null || status === 'granted' || status === 'unsupported') return null;

  const enable = async () => {
    if (status === 'denied') {
      await openSystemNotificationSettings();
      return;
    }
    const ok = await requestPushPermission();
    setStatus(ok ? 'granted' : 'denied');
    if (ok && session.userId) await registerDeviceForPush(session.userId);
  };

  return (
    <Card tone="danger" style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name="notifications-off" size={22} color={theme.colors.danger} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {t('onboarding.notifTitle')}
        </Text>
      </View>
      <Text color="textMuted">{t('onboarding.notifSubtitle')}</Text>
      <Button title={status === 'denied' ? t('common.openSettings') : t('onboarding.allowNotifications')} icon="notifications" variant="danger" onPress={() => void enable()} />
    </Card>
  );
}
