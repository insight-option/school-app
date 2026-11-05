import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ConfirmSheet, EmptyState, Screen, SkeletonCard, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { VenueForm, draftFromVenue, payloadFromDraft, validateVenue, type VenueDraft, type VenueErrors } from '../../../components/partner/VenueForm';
import { useMyBusiness, useMyVenue, useRemoveVenue, useSaveVenue } from '../../../features/partner';
import { haptic } from '../../../lib/util/device';

/** Create (`/venues/new`) or edit a venue. */
export default function VenueEditor() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const isNew = !venueId || venueId === 'new';
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors, spacing } = theme;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const business = useMyBusiness();
  const venue = useMyVenue(isNew ? null : venueId);
  const save = useSaveVenue();
  const remove = useRemoveVenue();
  const [draft, setDraft] = useState<VenueDraft | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [errors, setErrors] = useState<VenueErrors>({});
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Initialise the draft once per venue (new → defaults, edit → loaded record).
  const key = isNew ? 'new' : venue.data?.id ?? null;
  if (key && key !== loadedFor) {
    setLoadedFor(key);
    setDraft(draftFromVenue(isNew ? null : venue.data));
    setErrors({});
    setDirty(false);
  }

  const patch = (p: Partial<VenueDraft>) => {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setDirty(true);
  };

  const submit = () => {
    if (!draft) return;
    const e = validateVenue(draft, t, business.data);
    setErrors(e);
    if (Object.keys(e).length) {
      toast.warning(Object.values(e)[0]!);
      return;
    }
    save.mutate(payloadFromDraft(draft), {
      onSuccess: (v) => {
        haptic('success');
        setDirty(false);
        if (!v) return;
        toast.show(isNew ? t('partner.venueForm.created') : t('partner.venueForm.saved'), 'success', {
          action: { label: t('partner.venueForm.viewPublic'), onPress: () => router.push(`/venues/${v.id}` as never) },
        });
        if (isNew) router.replace(`/(partner)/venues/${v.id}` as never);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const title = isNew ? t('partner.venueForm.newTitle') : t('partner.venueForm.editTitle');

  if (!isNew && venue.isLoading && !draft) {
    return (
      <Screen back title={title} scroll>
        <SkeletonCard lines={4} />
        <SkeletonCard lines={6} />
      </Screen>
    );
  }
  if (!isNew && !venue.isLoading && !venue.data) {
    return (
      <Screen back title={title}>
        <EmptyState icon="alert-circle-outline" title={t('platform.venue.notFound')} actionLabel={t('common.back')} onAction={() => (router.canGoBack() ? router.back() : router.replace('/(partner)/venues' as never))} />
      </Screen>
    );
  }

  return (
    <Screen
      back
      title={title}
      subtitle={dirty ? t('partner.venueForm.unsaved') : (draft?.name || undefined)}
      padded={false}
      keyboard
      right={!isNew && venue.data ? <Button title={t('partner.publicPage')} icon="open-outline" variant="outline" size="sm" onPress={() => router.push(`/venues/${venue.data!.id}` as never)} /> : undefined}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.huge, width: '100%', maxWidth: 820, alignSelf: 'center', gap: spacing.lg }}>
        {draft ? <VenueForm draft={draft} onChange={patch} errors={errors} business={business.data} /> : null}
        {!isNew ? <Button title={t('partner.venueForm.delete')} icon="trash-outline" variant="ghost" onPress={() => setConfirmDelete(true)} style={{ alignSelf: 'center' }} /> : null}
      </ScrollView>
      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }, theme.shadow.sheet]}>
        <View style={styles.footerInner}>
          <Button title={isNew ? t('partner.venueForm.create') : t('partner.venueForm.save')} icon={isNew ? 'add-circle-outline' : 'checkmark'} size="lg" loading={save.isPending} onPress={submit} fullWidth />
        </View>
      </View>

      <ConfirmSheet
        visible={confirmDelete}
        title={t('partner.venueForm.deleteTitle')}
        body={t('partner.venueForm.deleteBody')}
        confirmLabel={t('partner.venueForm.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(venueId, {
            onSuccess: () => {
              setConfirmDelete(false);
              toast.success(t('partner.venueForm.deleted'));
              if (router.canGoBack()) router.back();
              else router.replace('/(partner)/venues' as never);
            },
            onError: (e) => {
              setConfirmDelete(false);
              toast.error(e.message);
            },
          })
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, paddingHorizontal: 16 },
  footerInner: { width: '100%', maxWidth: 820, alignSelf: 'center' },
});
