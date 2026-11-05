import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Ionicons } from '@expo/vector-icons';
import { client, listAll, unwrap, type Profile, type SavedPlace } from '../lib/data/client';
import { qk, queryClient } from '../lib/query/client';
import { useSession } from '../lib/auth/session';
import i18n, { currentLanguage } from '../lib/i18n';
import { haversineMeters } from '../lib/geo';

type IconName = keyof typeof Ionicons.glyphMap;

export type PlaceKind = 'HOME' | 'FAMILY' | 'WORK' | 'OTHER';
export const PLACE_KINDS: PlaceKind[] = ['HOME', 'FAMILY', 'WORK', 'OTHER'];
export const PLACE_ICONS: Record<PlaceKind, IconName> = {
  HOME: 'home',
  FAMILY: 'people',
  WORK: 'briefcase',
  OTHER: 'location',
};
export const MAX_PLACES = 20;

export const placeKind = (kind: string | null | undefined): PlaceKind => (PLACE_KINDS.includes(kind as PlaceKind) ? (kind as PlaceKind) : 'OTHER');

/** Address parts filled in automatically from the pin (Google reverse geocoding, device geocoder as fallback). */
export type GeoAddress = {
  formatted?: string | null;
  title?: string | null;
  area?: string | null;
  city?: string | null;
  street?: string | null;
  zone?: string | null;
  building?: string | null;
  country?: string | null;
};

/** A place in the switcher: a saved row, or the pickup point set before saved places existed. */
export type DisplayPlace = Pick<SavedPlace, 'id' | 'label' | 'kind' | 'lat' | 'lng' | 'address' | 'area' | 'city' | 'street' | 'zone' | 'building' | 'note'> & {
  legacy?: boolean;
};

export function useSavedPlaces(enabled = true) {
  const session = useSession();
  const userId = session.userId ?? '';
  return useQuery({
    queryKey: qk.places(userId),
    enabled: enabled && session.status === 'signedIn' && !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      listAll((nextToken) => client.models.SavedPlace.listPlacesByOwner({ ownerId: userId }, { limit: 50, nextToken, sortDirection: 'DESC' })),
  });
}

/** Saved places, most recently used first; the active pickup point is always included. */
export function displayPlaces(places: SavedPlace[] | undefined, me: Profile | null | undefined): DisplayPlace[] {
  const list: DisplayPlace[] = (places ?? []).slice().sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''));
  const home = me?.homeLocation;
  if (home && !list.some((p) => p.id === me?.homePlaceId || haversineMeters(p, home) < 15)) {
    list.unshift({
      id: 'legacy-home',
      label: me?.homeLabel || '',
      kind: 'HOME',
      lat: home.lat,
      lng: home.lng,
      address: me?.homeAddress ?? null,
      area: null,
      city: null,
      street: null,
      zone: null,
      building: null,
      note: me?.homeNote ?? null,
      legacy: true,
    });
  }
  return list;
}

export function isActivePlace(place: Pick<DisplayPlace, 'id' | 'lat' | 'lng' | 'legacy'>, me: Profile | null | undefined): boolean {
  if (!me?.homeLocation) return false;
  if (me.homePlaceId) return me.homePlaceId === place.id;
  return !!place.legacy || haversineMeters(place, me.homeLocation) < 15;
}

/** "Al Sadd · Street 870 · Zone 38" – the second line under a place's name. */
export function placeLine(p: Partial<GeoAddress> & { address?: string | null }): string {
  // Qatar zones are stored as the bare number ("66") → "Zone 66".
  const zone = p.zone && /^\d+$/.test(p.zone.trim()) ? i18n.t('transport.zoneN', { zone: p.zone.trim() }) : p.zone;
  const parts = [p.area, p.street, zone].filter((x): x is string => !!x && !!x.trim());
  if (parts.length) return Array.from(new Set(parts)).join(' · ');
  return p.address ?? '';
}

// ────────────────────────────── reverse geocoding ──────────────────────────────
async function deviceGeocode(lat: number, lng: number): Promise<GeoAddress> {
  if (Platform.OS === 'web') return {};
  try {
    const [g] = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lng,
    });
    if (!g) return {};
    // Android's geocoder reports Qatar's zone as the district ("Zone 66").
    const zoneMatch = /zone\s*(\d+)/i.exec(g.district ?? '') ?? /zone\s*(\d+)/i.exec(g.subregion ?? '');
    const area = (zoneMatch ? (g.subregion && !/zone/i.test(g.subregion) ? g.subregion : null) : (g.district ?? g.subregion)) ?? null;
    return {
      zone: zoneMatch?.[1] ?? null,
      area,
      city: g.city ?? g.region ?? null,
      street: g.street ?? null,
      building: g.streetNumber ?? null,
      country: g.country ?? null,
      title: area ?? g.street ?? g.city ?? (zoneMatch ? `Zone ${zoneMatch[1]}` : null),
      formatted: g.formattedAddress ?? [g.name, g.street, area, g.city].filter(Boolean).join(', '),
    };
  } catch {
    return {};
  }
}

/** Address of a pin; cached per ~10 m so moving back and forth costs nothing. */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoAddress> {
  const lang = currentLanguage();
  return queryClient.fetchQuery({
    queryKey: qk.geocode(lat, lng, lang),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      try {
        const res = await client.queries.reverseGeocode({
          lat,
          lng,
          language: lang,
        });
        const g = res.data;
        if (g && (g.title || g.formatted)) return g as GeoAddress;
      } catch {
        // fall through to the device geocoder
      }
      return deviceGeocode(lat, lng);
    },
  });
}

// ────────────────────────────── switching & editing ──────────────────────────────
export type NewPlaceInput = GeoAddress & {
  lat: number;
  lng: number;
  label: string;
  kind: PlaceKind;
  note?: string | null;
  address?: string | null;
};

type PickupInput = { place: DisplayPlace } | { create: NewPlaceInput };

function optimisticProfile(me: Profile, place: Pick<DisplayPlace, 'id' | 'lat' | 'lng' | 'label' | 'address' | 'note' | 'legacy'>): Profile {
  return {
    ...me,
    homeLocation: { lat: place.lat, lng: place.lng },
    homeAddress: place.address ?? null,
    homeLabel: place.label,
    homeNote: place.note ?? null,
    homePlaceId: place.legacy ? me.homePlaceId : place.id,
  };
}

/**
 * Make a place the pickup point (or save a new one and use it). The switch shows instantly; the server
 * moves today's stop on a running trip and re-routes the bus, so the driver sees it live.
 */
export function useSetPickup() {
  const qc = useQueryClient();
  const session = useSession();
  const userId = session.userId ?? '';
  return useMutation({
    mutationFn: async (input: PickupInput) => {
      if ('place' in input) {
        const p = input.place;
        const res = await client.mutations.updateHomeLocation(
          p.legacy ? { lat: p.lat, lng: p.lng, address: p.address ?? undefined } : { lat: p.lat, lng: p.lng, placeId: p.id },
        );
        return unwrap(res, 'pickup location');
      }
      const c = input.create;
      const res = await client.mutations.updateHomeLocation({
        lat: c.lat,
        lng: c.lng,
        newPlace: true,
        label: c.label,
        kind: c.kind,
        note: c.note ?? undefined,
        address: c.address ?? c.formatted ?? undefined,
        area: c.area ?? undefined,
        city: c.city ?? undefined,
        street: c.street ?? undefined,
        zone: c.zone ?? undefined,
        building: c.building ?? undefined,
      });
      return unwrap(res, 'pickup location');
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: qk.profile(userId) });
      const prev = qc.getQueryData<Profile | null>(qk.profile(userId));
      if (prev) {
        const target =
          'place' in input
            ? input.place
            : {
                id: 'pending',
                lat: input.create.lat,
                lng: input.create.lng,
                label: input.create.label,
                address: input.create.address ?? input.create.formatted ?? null,
                note: input.create.note ?? null,
              };
        qc.setQueryData(qk.profile(userId), optimisticProfile(prev, target));
      }
      return { prev };
    },
    onError: (_e, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.profile(userId), ctx.prev);
    },
    onSuccess: (profile) => {
      if (profile) qc.setQueryData(qk.profile(profile.userId), profile);
      void qc.invalidateQueries({ queryKey: qk.places(userId) });
      void qc.invalidateQueries({ queryKey: ['stops'] });
    },
  });
}

type PlacePatch = Partial<Pick<SavedPlace, 'label' | 'kind' | 'note' | 'lat' | 'lng' | 'address' | 'area' | 'city' | 'street' | 'zone' | 'building'>>;

/** Rename / re-pin / add directions; when it is the active place the driver gets the change too. */
export function useUpdatePlace() {
  const qc = useQueryClient();
  const session = useSession();
  const userId = session.userId ?? '';
  return useMutation({
    mutationFn: async (input: { id: string; patch: PlacePatch; active: boolean }) => {
      const row = unwrap(await client.models.SavedPlace.update({ id: input.id, ...input.patch }), 'place');
      if (input.active && row) {
        const profile = unwrap(
          await client.mutations.updateHomeLocation({
            lat: row.lat,
            lng: row.lng,
            placeId: row.id,
          }),
          'pickup location',
        );
        if (profile) qc.setQueryData(qk.profile(profile.userId), profile);
      }
      return row;
    },
    onSuccess: (row) => {
      if (!row) return;
      qc.setQueryData<SavedPlace[]>(qk.places(userId), (old) => old?.map((p) => (p.id === row.id ? row : p)) ?? old);
    },
  });
}

export function useDeletePlace() {
  const qc = useQueryClient();
  const session = useSession();
  const userId = session.userId ?? '';
  return useMutation({
    mutationFn: async (id: string) => unwrap(await client.models.SavedPlace.delete({ id }), 'place'),
    onMutate: (id) => {
      const prev = qc.getQueryData<SavedPlace[]>(qk.places(userId));
      qc.setQueryData<SavedPlace[]>(qk.places(userId), (old) => old?.filter((p) => p.id !== id) ?? old);
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.places(userId), ctx.prev);
    },
  });
}
