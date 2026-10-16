import React, { useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { Button, Input, ListItem, Text, useTheme } from '../../ui';
import { toast } from '../../ui/Toast';
import { MapView } from './MapView';
import type { MapHandle } from './types';
import { client } from '../../lib/data/client';
import type { LatLng } from '../../lib/geo';

export type HomeLocationPickerProps = {
  initial?: LatLng | null;
  initialAddress?: string | null;
  fallbackCenter?: LatLng | null;
  onConfirm: (value: { lat: number; lng: number; address?: string }) => void;
  busy?: boolean;
  confirmLabel?: string;
};

type Place = { placeId?: string | null; description: string; lat?: number | null; lng?: number | null };

/** Full-screen map with draggable pin, "use my location", address search (Places via Lambda) and confirm. */
export function HomeLocationPicker({ initial, initialAddress, fallbackCenter, onConfirm, busy, confirmLabel }: HomeLocationPickerProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const mapRef = useRef<MapHandle>(null);
  const [pin, setPin] = useState<LatLng | null>(initial ?? fallbackCenter ?? null);
  const [address, setAddress] = useState(initialAddress ?? '');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [locating, setLocating] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const center = pin ?? fallbackCenter ?? { lat: 24.7136, lng: 46.6753 };

  const movePin = async (p: LatLng, reverse = true) => {
    setPin(p);
    mapRef.current?.animateTo(p, 16);
    if (reverse && Platform.OS !== 'web') {
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng });
        if (geo) setAddress([geo.name, geo.street, geo.district, geo.city].filter(Boolean).join(', '));
      } catch {
        // address stays as-is
      }
    }
  };

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        toast.error(t('common.permissionDenied'));
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await movePin({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLocating(false);
    }
  };

  const search = (q: string) => {
    setQuery(q);
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        const res = await client.queries.searchPlaces({ query: q.trim(), lat: center.lat, lng: center.lng });
        setResults((res.data?.places ?? []).filter((p): p is Place => !!p));
      } catch {
        setResults([]);
      }
    }, 350);
  };

  return (
    <View style={styles.fill}>
      <View style={[styles.search, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <Input placeholder={t('onboarding.searchAddress')} value={query} onChangeText={search} leftIcon="search" rightIcon={query ? 'close-circle' : undefined} onRightIconPress={() => search('')} />
        {results.length ? (
          <View style={[styles.results, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            {results.slice(0, 6).map((r, i) => (
              <ListItem
                key={`${r.placeId ?? i}`}
                icon="location-outline"
                title={r.description}
                onPress={() => {
                  setResults([]);
                  setQuery('');
                  setAddress(r.description);
                  if (r.lat != null && r.lng != null) void movePin({ lat: r.lat, lng: r.lng }, false);
                }}
              />
            ))}
          </View>
        ) : null}
      </View>
      <MapView
        ref={mapRef}
        style={styles.fill}
        initialRegion={{ lat: center.lat, lng: center.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        pin={pin}
        onPinChange={(p) => void movePin(p)}
        onPress={(p) => void movePin(p)}
        showsUserLocation
      />
      <View style={[styles.footer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
        {address ? (
          <Text variant="caption" color="textMuted" numberOfLines={2}>
            {address}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Button title={t('onboarding.useMyLocation')} variant="outline" icon="locate" onPress={useMyLocation} loading={locating} style={{ flex: 1 }} />
          <Button title={confirmLabel ?? t('onboarding.confirmLocation')} icon="checkmark" disabled={!pin} loading={busy} onPress={() => pin && onConfirm({ lat: pin.lat, lng: pin.lng, address: address || undefined })} style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  search: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 10 },
  results: { position: 'absolute', top: 64, left: 12, right: 12, borderWidth: 1, borderRadius: 12, overflow: 'hidden', zIndex: 20, elevation: 6 },
  footer: { padding: 16, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
