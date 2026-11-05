import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Sheet, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { useMyProfile } from '../../features/profiles';
import { useSettings } from '../../features/settings';
import { useActiveTrip, useTripStops } from '../../features/trips';
import { MAX_PLACES, PLACE_ICONS, displayPlaces, isActivePlace, placeKind, placeLine, useSavedPlaces, useSetPickup, type DisplayPlace } from '../../features/places';
import { useSession } from '../../lib/auth/session';
import { haptic } from '../../lib/util/device';
import { todayIn } from '../../lib/util/format';

const MOVABLE = new Set(['PENDING', 'ALARMED', 'ACKNOWLEDGED', 'SKIPPED']);

/**
 * "Pickup from ▾ Home · Al Sadd" – the header control on every student screen. Opens the saved
 * places; picking one moves the pickup point at once (and on a running trip, the driver's route).
 */
export function PickupSwitcher({ onDark = false }: { onDark?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors } = theme;
  const [open, setOpen] = useState(false);
  const me = useMyProfile();
  const places = useSavedPlaces();
  const list = displayPlaces(places.data, me.data);
  const active = list.find((p) => isActivePlace(p, me.data)) ?? null;
  const name = active ? placeName(active, t) : null;
  const where = active ? placeLine(active) : '';
  const fg = onDark ? '#fff' : colors.text;
  const muted = onDark ? 'rgba(255,255,255,0.75)' : colors.textMuted;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('transport.pickupFrom')}
        accessibilityHint={t('transport.switchHint')}
        onPress={() => {
          haptic('selection');
          setOpen(true);
        }}
        hitSlop={6}
        style={({ pressed }) => [styles.pill, { opacity: pressed ? 0.75 : 1 }]}
        testID="pickup-switcher"
      >
        <View style={[styles.pin, { backgroundColor: onDark ? 'rgba(255,255,255,0.18)' : colors.primarySoft }]}>
          <Ionicons name={active ? PLACE_ICONS[placeKind(active.kind)] : 'location'} size={17} color={onDark ? '#fff' : colors.primary} />
        </View>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text variant="overline" style={{ color: muted }} numberOfLines={1}>
            {t('transport.pickupFrom')}
          </Text>
          <View style={styles.row}>
            <Text variant="bodyStrong" style={{ color: active ? fg : colors.warning, flexShrink: 1 }} numberOfLines={1}>
              {name ?? t('transport.setPickup')}
              {where ? <Text style={{ color: muted, fontWeight: '400' }}>{`  ·  ${where}`}</Text> : null}
            </Text>
            <Ionicons name="chevron-down" size={16} color={fg} />
          </View>
        </View>
      </Pressable>
      <PickupSheet visible={open} onClose={() => setOpen(false)} list={list} />
    </>
  );
}

function placeName(p: DisplayPlace, t: (k: string) => string): string {
  return p.label?.trim() || t(`transport.kinds.${placeKind(p.kind)}`);
}

function PickupSheet({ visible, onClose, list }: { visible: boolean; onClose: () => void; list: DisplayPlace[] }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors, radius, spacing } = theme;
  const router = useRouter();
  const session = useSession();
  const me = useMyProfile();
  const settings = useSettings();
  const today = todayIn(settings.data?.timezone);
  const trips = useActiveTrip(me.data?.busId, today);
  const stops = useTripStops(trips.active?.id);
  const myStop = stops.data?.find((s) => s.studentId === session.userId) ?? null;
  const setPickup = useSetPickup();
  const [switching, setSwitching] = useState<string | null>(null);

  const liveNote = !trips.active ? null : myStop && !MOVABLE.has(myStop.status) ? t('transport.liveLocked') : t('transport.liveMoves');

  const choose = (p: DisplayPlace) => {
    if (isActivePlace(p, me.data)) {
      onClose();
      return;
    }
    haptic('medium');
    setSwitching(p.id);
    setPickup.mutate(
      { place: p },
      {
        onSuccess: () => {
          toast.success(trips.active && (!myStop || MOVABLE.has(myStop.status)) ? t('transport.switchedLive', { name: placeName(p, t) }) : t('transport.switched', { name: placeName(p, t) }));
          onClose();
        },
        onError: (e) => toast.error(e.message),
        onSettled: () => setSwitching(null),
      },
    );
  };

  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('transport.pickupTitle')}>
      {liveNote ? (
        <View style={[styles.live, { backgroundColor: colors.primarySoft, borderRadius: radius.md }]}>
          <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
          <Text variant="caption" style={{ flex: 1, color: colors.text }}>
            {liveNote}
          </Text>
        </View>
      ) : (
        <Text variant="caption" color="textMuted" style={{ marginBottom: spacing.sm }}>
          {t('transport.pickupSubtitle')}
        </Text>
      )}
      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        {list.map((p) => {
          const on = isActivePlace(p, me.data);
          const busy = switching === p.id;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, busy }}
              onPress={() => choose(p)}
              onLongPress={() => !p.legacy && go(`/(student)/places/${p.id}`)}
              disabled={!!switching}
              style={({ pressed }) => [
                styles.place,
                { borderRadius: radius.lg, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : pressed ? colors.surfaceAlt : colors.surface },
              ]}
            >
              <View style={[styles.placeIcon, { backgroundColor: on ? colors.primary : colors.surfaceAlt }]}>
                <Ionicons name={PLACE_ICONS[placeKind(p.kind)]} size={19} color={on ? colors.onPrimary : colors.textMuted} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {placeName(p, t)}
                </Text>
                <Text variant="caption" color="textMuted" numberOfLines={2}>
                  {placeLine(p) || p.address || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`}
                </Text>
              </View>
              {busy ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <View style={[styles.radio, { borderColor: on ? colors.primary : colors.borderStrong }]}>{on ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}</View>
              )}
            </Pressable>
          );
        })}
        {list.length < MAX_PLACES ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => go('/(student)/places/new')}
            style={({ pressed }) => [styles.place, styles.add, { borderRadius: radius.lg, borderColor: colors.primary, backgroundColor: pressed ? colors.primarySoft : 'transparent' }]}
            testID="add-place"
          >
            <View style={[styles.placeIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="add" size={22} color={colors.primary} />
            </View>
            <Text variant="bodyStrong" color="primary" style={{ flex: 1 }}>
              {t('transport.addAddress')}
            </Text>
          </Pressable>
        ) : null}
        {list.length ? (
          <Pressable accessibilityRole="button" onPress={() => go('/(student)/places')} style={styles.manage} hitSlop={6}>
            <Ionicons name="create-outline" size={16} color={colors.textMuted} />
            <Text variant="captionStrong" color="textMuted">
              {t('transport.manage')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Sheet>
  );
}

/** Header row of the student screens: pickup switcher + notifications bell. */
export function StudentTopBar({ right }: { right?: React.ReactNode }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.top, { paddingHorizontal: theme.spacing.lg }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <PickupSwitcher />
      </View>
      {right}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('notifications.title')}
        onPress={() => router.push('/notifications')}
        hitSlop={8}
        style={({ pressed }) => [styles.bell, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 }]}
      >
        <Ionicons name="notifications-outline" size={20} color={theme.colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, paddingBottom: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  pin: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bell: { width: 42, height: 42, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1.5, minHeight: 68 },
  add: { borderStyle: 'dashed' },
  placeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  manage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
});
