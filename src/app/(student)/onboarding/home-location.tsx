import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { toast } from '../../../ui/Toast';
import { PlaceEditor } from '../../../components/places/PlaceEditor';
import { useSetPickup } from '../../../features/places';
import { useSettings } from '../../../features/settings';
import { KV_KEYS, kv } from '../../../lib/storage/mmkv';

/** Mandatory first-login step for parents/students: where the bus picks them up. Cannot be skipped. */
export default function OnboardingHomeLocation() {
  const { t } = useTranslation();
  const router = useRouter();
  const settings = useSettings();
  const setPickup = useSetPickup();

  return (
    <PlaceEditor
      title={t('transport.onboardingTitle')}
      fallbackCenter={settings.data?.schoolLocation ?? null}
      busy={setPickup.isPending}
      saveLabel={t('onboarding.confirmLocation')}
      onSave={(d) =>
        setPickup.mutate(
          { create: d },
          {
            onSuccess: () => {
              toast.success(t('onboarding.locationSaved'));
              if (!kv.getString(KV_KEYS.onboardingNotif)) router.replace('/(student)/onboarding/notifications');
              else router.replace('/(student)/(tabs)/bus');
            },
            onError: (e) => toast.error(e.message),
          },
        )
      }
    />
  );
}
