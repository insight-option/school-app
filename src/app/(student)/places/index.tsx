import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, ConfirmSheet, EmptyState, Screen, SkeletonCard, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { MapView } from '../../../components/map/MapView';
import { useMyProfile } from '../../../features/profiles';
import { MAX_PLACES, PLACE_ICONS, displayPlaces, isActivePlace, placeKind, placeLine, useDeletePlace, useSavedPlaces, useSetPickup, type DisplayPlace } from '../../../features/places';

/** Saved addresses: switch the pickup point, edit, delete, add. */
export default function PlacesScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors, radius, spacing } = theme;
  const router = useRouter();
  const me = useMyProfile();
  const places = useSavedPlaces();
  const setPickup = useSetPickup();
  const remove = useDeletePlace();
  const [confirm, setConfirm] = useState<DisplayPlace | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const list = displayPlaces(places.data, me.data);
  const active = list.find((p) => isActivePlace(p, me.data)) ?? null;
  const name = (p: DisplayPlace) => p.label?.trim() || t(`transport.kinds.${placeKind(p.kind)}`);

  const use = (p: DisplayPlace) => {
    setSwitching(p.id);
    setPickup.mutate(
      { place: p },
      { onSuccess: () => toast.success(t('transport.switched', { name: name(p) })), onError: (e) => toast.error(e.message), onSettled: () => setSwitching(null) },
    );
  };

  return (
    <Screen back title={t('transport.savedPlaces')} subtitle={t('transport.savedPlacesSubtitle')} scroll refreshing={places.isRefetching} onRefresh={() => void places.refetch()}>
      {active ? (
        <View style={[styles.preview, { borderRadius: radius.xl, borderColor: colors.border }, theme.shadow.card]}>
          <MapView
            key={`${active.lat},${active.lng}`}
            markers={[{ id: 'home', kind: 'home', lat: active.lat, lng: active.lng, color: colors.primary }]}
            initialRegion={{ lat: active.lat, lng: active.lng, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
          />
          <View style={[styles.previewBadge, { backgroundColor: colors.surface, borderRadius: radius.pill }, theme.shadow.card]}>
            <Ionicons name="navigate" size={14} color={colors.primary} />
            <Text variant="captionStrong" numberOfLines={1}>
              {t('transport.pickupNow', { name: name(active) })}
            </Text>
          </View>
        </View>
      ) : null}

      {places.isLoading && !list.length ? (
        <SkeletonCard lines={4} />
      ) : !list.length ? (
        <EmptyState icon="location-outline" title={t('transport.noPlaces')} body={t('transport.noPlacesBody')} />
      ) : (
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {list.map((p) => {
            const on = isActivePlace(p, me.data);
            return (
              <View key={p.id} style={[styles.row, { borderRadius: radius.lg, backgroundColor: colors.surface, borderColor: on ? colors.primary : colors.border }]}>
                <View style={[styles.icon, { backgroundColor: on ? colors.primary : colors.surfaceAlt }]}>
                  <Ionicons name={PLACE_ICONS[placeKind(p.kind)]} size={19} color={on ? colors.onPrimary : colors.textMuted} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {name(p)}
                    </Text>
                    {on ? <Badge label={t('transport.active')} tone="primary" size="sm" /> : null}
                  </View>
                  <Text variant="caption" color="textMuted" numberOfLines={2}>
                    {placeLine(p) || p.address || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`}
                  </Text>
                  {p.note ? (
                    <Text variant="caption" color="textFaint" numberOfLines={1}>
                      {p.note}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.actions}>
                  {!on ? (
                    switching === p.id ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Button size="sm" variant="secondary" title={t('transport.use')} onPress={() => use(p)} disabled={!!switching} />
                    )
                  ) : null}
                  {!p.legacy ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={t('common.edit')} onPress={() => router.push(`/(student)/places/${p.id}` as never)} hitSlop={8} style={styles.iconBtn}>
                      <Ionicons name="create-outline" size={20} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                  {!on && !p.legacy ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={t('common.delete')} onPress={() => setConfirm(p)} hitSlop={8} style={styles.iconBtn}>
                      <Ionicons name="trash-outline" size={20} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
      {list.length < MAX_PLACES ? (
        <Button title={t('transport.addAddress')} icon="add" variant="outline" size="lg" style={{ marginTop: spacing.lg }} onPress={() => router.push('/(student)/places/new' as never)} testID="places-add" />
      ) : null}
      <Text variant="caption" color="textMuted" align="center" style={{ marginTop: spacing.md }}>
        {t('transport.placesFooter')}
      </Text>

      <ConfirmSheet
        visible={!!confirm}
        title={t('transport.deleteTitle')}
        body={confirm ? t('transport.deleteBody', { name: name(confirm) }) : undefined}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={remove.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          confirm &&
          remove.mutate(confirm.id, {
            onSuccess: () => setConfirm(null),
            onError: (e) => toast.error(e.message),
          })
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { height: 170, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  previewBadge: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, maxWidth: '90%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1.5 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
