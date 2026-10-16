import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../ui';
import { toast } from '../../ui/Toast';
import { HomeLocationPicker } from '../../components/map/HomeLocationPicker';
import { useMyProfile, useUpdateHomeLocation } from '../../features/profiles';
import { useSettings } from '../../features/settings';

/** Edit home location later (writes an audit entry and notifies the office server-side). */
export default function EditHomeLocation() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useMyProfile();
  const settings = useSettings();
  const update = useUpdateHomeLocation();
  return (
    <Screen back title={t('student.changeHome')} padded={false} edges={['top', 'left', 'right', 'bottom']}>
      <HomeLocationPicker
        initial={me.data?.homeLocation ?? null}
        initialAddress={me.data?.homeAddress}
        fallbackCenter={settings.data?.schoolLocation ?? null}
        busy={update.isPending}
        confirmLabel={t('common.save')}
        onConfirm={(v) =>
          update.mutate(v, {
            onSuccess: () => {
              toast.success(t('onboarding.locationSaved'));
              router.back();
            },
            onError: (e) => toast.error(e.message),
          })
        }
      />
    </Screen>
  );
}
