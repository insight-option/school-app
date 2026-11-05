import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { toast } from '../../../ui/Toast';
import { PlaceEditor } from '../../../components/places/PlaceEditor';
import { useSettings } from '../../../features/settings';
import { useMyProfile } from '../../../features/profiles';
import { useSetPickup } from '../../../features/places';
import { client, unwrap } from '../../../lib/data/client';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '../../../lib/query/client';
import { useSession } from '../../../lib/auth/session';

/** Add an address – by default it becomes the pickup point right away (driver re-routed live). */
export default function NewPlace() {
  const { t } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const session = useSession();
  const me = useMyProfile();
  const settings = useSettings();
  const setPickup = useSetPickup();
  const [saving, setSaving] = React.useState(false);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(student)/(tabs)/bus'));
  return (
    <PlaceEditor
      title={t('transport.newAddress')}
      fallbackCenter={me.data?.homeLocation ?? settings.data?.schoolLocation ?? null}
      askUseNow
      busy={setPickup.isPending || saving}
      onCancel={close}
      onSave={(d, useNow) => {
        if (useNow) {
          setPickup.mutate(
            { create: d },
            {
              onSuccess: () => {
                toast.success(t('transport.savedAndUsed', { name: d.label }));
                close();
              },
              onError: (e) => toast.error(e.message),
            },
          );
          return;
        }
        setSaving(true);
        client.models.SavedPlace.create({
          ownerId: session.userId!,
          schoolId: session.schoolId || undefined,
          label: d.label,
          kind: d.kind,
          lat: d.lat,
          lng: d.lng,
          address: d.address,
          area: d.area,
          city: d.city,
          street: d.street,
          zone: d.zone,
          building: d.building,
          note: d.note || null,
          lastUsedAt: new Date().toISOString(),
        })
          .then((res) => {
            unwrap(res, 'place');
            void qc.invalidateQueries({ queryKey: qk.places(session.userId ?? '') });
            toast.success(t('transport.saved', { name: d.label }));
            close();
          })
          .catch((e: Error) => toast.error(e.message))
          .finally(() => setSaving(false));
      }}
    />
  );
}
