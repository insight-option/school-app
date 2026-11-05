import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, Screen, SkeletonCard } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { PlaceEditor } from '../../../components/places/PlaceEditor';
import { useSettings } from '../../../features/settings';
import { useMyProfile } from '../../../features/profiles';
import { isActivePlace, placeKind, useSavedPlaces, useUpdatePlace } from '../../../features/places';

/** Edit a saved address (name, pin, directions). The active one is pushed to the driver too. */
export default function EditPlace() {
  const { t } = useTranslation();
  const router = useRouter();
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const me = useMyProfile();
  const settings = useSettings();
  const places = useSavedPlaces();
  const update = useUpdatePlace();
  const place = places.data?.find((p) => p.id === placeId) ?? null;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(student)/places' as never));

  if (!place) {
    return (
      <Screen back title={t('transport.editAddress')}>
        {places.isLoading ? <SkeletonCard /> : <EmptyState icon="location-outline" title={t('transport.placeMissing')} />}
      </Screen>
    );
  }
  const active = isActivePlace(place, me.data);
  return (
    <PlaceEditor
      title={t('transport.editAddress')}
      initial={{ ...place, kind: placeKind(place.kind), note: place.note ?? '', title: place.area ?? place.street ?? null }}
      fallbackCenter={settings.data?.schoolLocation ?? null}
      saveLabel={t('common.save')}
      busy={update.isPending}
      onCancel={close}
      onSave={(d) =>
        update.mutate(
          {
            id: place.id,
            active,
            patch: { label: d.label, kind: d.kind, note: d.note || null, lat: d.lat, lng: d.lng, address: d.address, area: d.area ?? null, city: d.city ?? null, street: d.street ?? null, zone: d.zone ?? null, building: d.building ?? null },
          },
          {
            onSuccess: () => {
              toast.success(active ? t('transport.updatedLive') : t('transport.updated'));
              close();
            },
            onError: (e) => toast.error(e.message),
          },
        )
      }
    />
  );
}
