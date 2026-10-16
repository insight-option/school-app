import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { HomeLocationPicker } from '../../../components/map/HomeLocationPicker';
import { useUpdateHomeLocation } from '../../../features/profiles';
import { useSettings } from '../../../features/settings';
import { KV_KEYS, kv } from '../../../lib/storage/mmkv';

/** Mandatory first-login step for parents/students. Cannot be skipped. */
export default function OnboardingHomeLocation() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const settings = useSettings();
  const update = useUpdateHomeLocation();

  return (
    <Screen padded={false} edges={['top', 'left', 'right', 'bottom']}>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, gap: 4 }}>
        <Text variant="title">{t('onboarding.homeTitle')}</Text>
        <Text color="textMuted">{t('onboarding.homeSubtitle')}</Text>
      </View>
      <HomeLocationPicker
        fallbackCenter={settings.data?.schoolLocation ?? null}
        busy={update.isPending}
        onConfirm={(v) =>
          update.mutate(v, {
            onSuccess: () => {
              toast.success(t('onboarding.locationSaved'));
              if (!kv.getString(KV_KEYS.onboardingNotif)) router.replace('/(student)/onboarding/notifications');
              else router.replace('/(student)/(tabs)/bus');
            },
            onError: (e) => toast.error(e.message),
          })
        }
      />
    </Screen>
  );
}
