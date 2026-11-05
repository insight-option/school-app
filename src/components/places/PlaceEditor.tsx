import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Input, Skeleton, SwitchRow, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { MapView } from '../map/MapView';
import type { MapHandle } from '../map/types';
import { client } from '../../lib/data/client';
import { currentLanguage } from '../../lib/i18n';
import { haptic } from '../../lib/util/device';
import type { LatLng } from '../../lib/geo';
import { PLACE_ICONS, PLACE_KINDS, placeLine, reverseGeocode, type GeoAddress, type PlaceKind } from '../../features/places';

/** Doha – the default centre when nothing better is known. */
export const DOHA: LatLng = { lat: 25.2854, lng: 51.531 };

export type PlaceDraft = GeoAddress & {
  lat: number;
  lng: number;
  label: string;
  kind: PlaceKind;
  note: string;
  address: string | null;
};

type Props = {
  initial?: (Partial<PlaceDraft> & LatLng) | null;
  fallbackCenter?: LatLng | null;
  /** Title of the details step ("New address", "Edit address"). */
  title: string;
  /** Offer "use for pickup from now on" (new places). */
  askUseNow?: boolean;
  busy?: boolean;
  /** Primary button of the last step. */
  saveLabel?: string;
  onSave: (draft: PlaceDraft, useNow: boolean) => void;
  onCancel?: () => void;
};

type Place = {
  placeId?: string | null;
  description: string;
  lat?: number | null;
  lng?: number | null;
};

/**
 * Two-step address editor in the style of delivery apps: move the map under a fixed centre pin
 * (address parts are filled in automatically as the map settles), then name the place and add
 * directions for the driver.
 */
export function PlaceEditor({ initial, fallbackCenter, title, askUseNow, busy, saveLabel, onSave, onCancel }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { colors, radius, spacing } = theme;
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapHandle>(null);
  const start = initial ?? fallbackCenter ?? DOHA;

  const [step, setStep] = useState<'map' | 'details'>('map');
  const [center, setCenter] = useState<LatLng>({
    lat: start.lat,
    lng: start.lng,
  });
  const [geo, setGeo] = useState<GeoAddress | null>(initial ? { ...initial } : null);
  const [geocoding, setGeocoding] = useState(!initial?.title && !initial?.address);
  const [moving, setMoving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [kind, setKind] = useState<PlaceKind>(initial?.kind ?? 'HOME');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [building, setBuilding] = useState(initial?.building ?? '');
  const [zone, setZone] = useState(initial?.zone ?? '');
  const [street, setStreet] = useState(initial?.street ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [useNow, setUseNow] = useState(true);
  const seq = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pin lifts while the map moves and drops when it settles.
  const lift = useSharedValue(0);
  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.get() }],
  }));
  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + lift.get() / 40,
    transform: [{ scale: 1 - lift.get() / 40 }],
  }));

  const lookup = (p: LatLng) => {
    if (debounce.current) clearTimeout(debounce.current);
    const id = ++seq.current;
    debounce.current = setTimeout(() => {
      void reverseGeocode(p.lat, p.lng)
        .then((g) => {
          if (id !== seq.current) return;
          setGeo(g);
          // Building / zone / street follow the pin until the user types their own.
          setStreet((v) => (v && v !== geo?.street ? v : (g.street ?? '')));
          setZone((v) => (v && v !== geo?.zone ? v : (g.zone ?? '').replace(/\D/g, '') || (g.zone ?? '')));
          setBuilding((v) => (v && v !== geo?.building ? v : (g.building ?? '')));
        })
        .finally(() => id === seq.current && setGeocoding(false));
    }, 220);
  };

  // First address lookup + jump to the device position for a brand-new place (only if already allowed).
  useEffect(() => {
    if (!initial?.title && !initial?.address) lookup(center); // `geocoding` starts true for this case
    if (initial) return;
    let alive = true;
    void (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted) return;
        const last = await Location.getLastKnownPositionAsync({
          maxAge: 5 * 60_000,
        });
        if (alive && last) mapRef.current?.animateTo({ lat: last.coords.latitude, lng: last.coords.longitude }, 17);
      } catch {
        // stay on the fallback centre
      }
    })();
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onGesture = () => {
    if (!moving) {
      setMoving(true);
      lift.set(withSpring(14, { damping: 14, stiffness: 260 }));
    }
    if (results.length) setResults([]);
  };
  const onSettled = (p: LatLng) => {
    setMoving(false);
    lift.set(withSpring(0, { damping: 12, stiffness: 300 }));
    if (Math.abs(p.lat - center.lat) < 1e-6 && Math.abs(p.lng - center.lng) < 1e-6) return;
    setCenter(p);
    setGeocoding(true);
    lookup(p);
  };

  const locateMe = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        toast.error(t('common.permissionDenied'));
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      haptic('selection');
      mapRef.current?.animateTo({ lat: loc.coords.latitude, lng: loc.coords.longitude }, 17);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLocating(false);
    }
  };

  const search = (q: string) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await client.queries.searchPlaces({
          query: q.trim(),
          lat: center.lat,
          lng: center.lng,
          language: currentLanguage(),
        });
        setResults((res.data?.places ?? []).filter((p): p is Place => !!p && p.lat != null && p.lng != null));
      } catch {
        setResults([]);
      }
    }, 300);
  };

  const pickKind = (k: PlaceKind) => {
    haptic('selection');
    // Replace the name only while it is still one of the defaults.
    const defaults = PLACE_KINDS.map((x) => t(`transport.kinds.${x}`));
    if (!label.trim() || defaults.includes(label.trim())) setLabel(t(`transport.kinds.${k}`));
    setKind(k);
  };

  const save = () => {
    const name = label.trim() || t(`transport.kinds.${kind}`);
    const address =
      [building && street ? `${building} ${street}` : street || null, geo?.area, geo?.city].filter((x, i, a) => !!x && a.indexOf(x) === i).join(', ') || geo?.formatted || null;
    onSave(
      {
        ...geo,
        lat: center.lat,
        lng: center.lng,
        label: name.slice(0, 40),
        kind,
        note: note.trim(),
        building: building.trim() || null,
        zone: zone.trim() || null,
        street: street.trim() || null,
        address,
      },
      useNow,
    );
  };

  const titleLine = geo?.title || geo?.area || geo?.street || geo?.city || (geocoding ? '' : t('transport.pinnedLocation'));
  const subLine = placeLine({
    ...geo,
    street: street || geo?.street,
    zone: zone ? (/^\d+$/.test(zone) ? t('transport.zoneN', { zone }) : zone) : geo?.zone,
  });

  if (step === 'details') {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'web' ? undefined : 'padding'} style={[styles.fill, { backgroundColor: colors.background }]}>
        <View style={[styles.detailsHeader, { paddingTop: insets.top + 8, paddingHorizontal: spacing.lg }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={() => setStep('map')}
            hitSlop={10}
            style={[styles.round, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="arrow-back" size={21} color={colors.text} style={{ transform: [{ scaleX: theme.arabic ? -1 : 1 }] }} />
          </Pressable>
          <Text variant="title" style={{ flex: 1 }} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: spacing.lg,
            gap: spacing.lg,
            paddingBottom: insets.bottom + 120,
          }}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => setStep('map')}
            style={[
              styles.summary,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: radius.lg,
              },
              theme.shadow.card,
            ]}
          >
            <View style={[styles.summaryIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="location" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {titleLine || t('transport.pinnedLocation')}
              </Text>
              <Text variant="caption" color="textMuted" numberOfLines={2}>
                {subLine || geo?.formatted || `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`}
              </Text>
            </View>
            <Text variant="captionStrong" color="primary">
              {t('common.edit')}
            </Text>
          </Pressable>

          <View style={{ gap: spacing.sm }}>
            <Text variant="overline" color="textMuted">
              {t('transport.saveAs')}
            </Text>
            <View style={styles.kinds}>
              {PLACE_KINDS.map((k) => {
                const on = k === kind;
                return (
                  <Pressable
                    key={k}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => pickKind(k)}
                    style={[
                      styles.kind,
                      {
                        borderRadius: radius.lg,
                        borderColor: on ? colors.primary : colors.border,
                        backgroundColor: on ? colors.primarySoft : colors.surface,
                      },
                    ]}
                  >
                    <Ionicons
                      name={on ? PLACE_ICONS[k] : (`${PLACE_ICONS[k]}-outline` as keyof typeof Ionicons.glyphMap)}
                      size={20}
                      color={on ? colors.primary : colors.textMuted}
                    />
                    <Text variant="captionStrong" color={on ? 'primary' : 'textMuted'} numberOfLines={1}>
                      {t(`transport.kinds.${k}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Input label={t('transport.placeName')} value={label} onChangeText={setLabel} placeholder={t(`transport.kinds.${kind}`)} maxLength={40} />
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text variant="overline" color="textMuted">
              {t('transport.addressDetails')}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Input label={t('transport.building')} value={building} onChangeText={setBuilding} containerStyle={{ flex: 1 }} maxLength={40} />
              <Input label={t('transport.zone')} value={zone} onChangeText={setZone} keyboardType="number-pad" containerStyle={{ flex: 1 }} maxLength={20} />
            </View>
            <Input label={t('transport.street')} value={street} onChangeText={setStreet} maxLength={80} />
            <Input label={t('transport.driverNote')} placeholder={t('transport.driverNoteHint')} value={note} onChangeText={setNote} multiline maxLength={300} />
          </View>
          {askUseNow ? <SwitchRow label={t('transport.useNow')} description={t('transport.useNowBody')} value={useNow} onValueChange={setUseNow} /> : null}
        </ScrollView>
        <View
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(insets.bottom, 12) + 4,
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
          ]}
        >
          <Button title={saveLabel ?? t('transport.saveAddress')} size="lg" icon="checkmark" loading={busy} onPress={save} fullWidth />
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <View style={styles.fill}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{
            lat: start.lat,
            lng: start.lng,
            latitudeDelta: 0.006,
            longitudeDelta: 0.006,
          }}
          onUserGesture={onGesture}
          onRegionChangeComplete={onSettled}
          showsUserLocation
        />

        {/* Fixed centre pin: the map moves underneath it; the pin's tip is the exact map centre. */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.pinLayer]}>
          <Animated.View style={[styles.pinWrap, pinStyle]}>
            <View
              style={[
                styles.pinHead,
                {
                  backgroundColor: colors.primary,
                  borderColor: colors.surface,
                },
                theme.shadow.raised,
              ]}
            >
              <Ionicons name="home" size={18} color={colors.onPrimary} />
            </View>
            <View style={[styles.pinStem, { backgroundColor: colors.primary }]} />
          </Animated.View>
          <Animated.View style={[styles.pinDot, { backgroundColor: colors.text }, dotStyle]} />
        </View>

        {/* Search */}
        <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <View style={styles.topRow}>
            {onCancel ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
                onPress={onCancel}
                hitSlop={10}
                style={[
                  styles.round,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                  theme.shadow.card,
                ]}
              >
                <Ionicons name="arrow-back" size={21} color={colors.text} style={{ transform: [{ scaleX: theme.arabic ? -1 : 1 }] }} />
              </Pressable>
            ) : null}
            <View
              style={[
                styles.searchBox,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: radius.pill,
                },
                theme.shadow.card,
              ]}
            >
              <Input
                placeholder={t('transport.searchArea')}
                value={query}
                onChangeText={search}
                leftIcon="search"
                rightIcon={query ? 'close-circle' : undefined}
                onRightIconPress={() => search('')}
                containerStyle={{ flex: 1 }}
                style={{ borderWidth: 0 }}
                returnKeyType="search"
              />
            </View>
          </View>
          {results.length ? (
            <View
              style={[
                styles.results,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: radius.lg,
                },
                theme.shadow.raised,
              ]}
            >
              {results.slice(0, 6).map((r, i) => {
                const [name, ...rest] = r.description.split(' · ');
                return (
                  <Pressable
                    key={`${r.placeId ?? i}`}
                    accessibilityRole="button"
                    onPress={() => {
                      setResults([]);
                      setQuery('');
                      mapRef.current?.animateTo({ lat: r.lat!, lng: r.lng! }, 17);
                    }}
                    style={({ pressed }) => [
                      styles.resultRow,
                      {
                        borderBottomColor: colors.border,
                        backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                      },
                      i === Math.min(results.length, 6) - 1 && {
                        borderBottomWidth: 0,
                      },
                    ]}
                  >
                    <Ionicons name="location-outline" size={18} color={colors.textMuted} />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {name}
                      </Text>
                      {rest.length ? (
                        <Text variant="caption" color="textMuted" numberOfLines={1}>
                          {rest.join(' · ')}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        {/* Locate me */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.useMyLocation')}
          onPress={() => void locateMe()}
          style={({ pressed }) => [styles.locate, { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }, theme.shadow.raised]}
        >
          {locating ? <Skeleton width={20} height={20} radius={10} /> : <Ionicons name="locate" size={22} color={colors.primary} />}
        </Pressable>
      </View>

      {/* Address card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            paddingBottom: Math.max(insets.bottom, 12) + 8,
            borderTopLeftRadius: radius.xxl,
            borderTopRightRadius: radius.xxl,
          },
          theme.shadow.sheet,
        ]}
      >
        <Text variant="overline" color="textMuted">
          {t('transport.pickupHere')}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            minHeight: 52,
          }}
        >
          <View style={[styles.summaryIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="navigate" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            {geocoding || moving ? (
              <>
                <Skeleton width="55%" height={18} />
                <Skeleton width="80%" height={13} />
              </>
            ) : (
              <>
                <Text variant="subheading" numberOfLines={1}>
                  {titleLine}
                </Text>
                <Text variant="caption" color="textMuted" numberOfLines={2}>
                  {subLine || geo?.formatted || t('transport.moveMapHint')}
                </Text>
              </>
            )}
          </View>
        </View>
        <Button title={t('transport.confirmLocation')} size="lg" iconRight="arrow-forward" disabled={moving} onPress={() => setStep('details')} fullWidth />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pinLayer: { alignItems: 'center', justifyContent: 'center' },
  pinWrap: { alignItems: 'center', marginBottom: 46 },
  pinHead: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinStem: {
    width: 4,
    height: 16,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    marginTop: -2,
  },
  pinDot: { position: 'absolute', width: 10, height: 5, borderRadius: 5 },
  top: { position: 'absolute', left: 12, right: 12, top: 0, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBox: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  results: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  locate: {
    position: 'absolute',
    right: 16,
    bottom: 36,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { marginTop: -20, paddingHorizontal: 20, paddingTop: 18, gap: 12 },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 8,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  kinds: { flexDirection: 'row', gap: 8 },
  kind: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    borderWidth: 1.5,
    minWidth: 0,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
