import type { Schema } from '../../data/resource';
import { audit, getSettings, listAll, mapLimit, nowIso, todayInTimezone, type DataClient, unwrap } from '../shared/data';
import { daysBetween } from '../../../src/lib/util/dates';
import { haversineMeters } from '../shared/geo';
import { t } from '../shared/i18n';
import { getAdminUserIds, notifyUsers } from '../shared/notify';
import { HandlerError, type Caller } from '../shared/types';
import { parseGeocode, RESULT_TYPES, type GeoResult } from './geocode';
import {
  NO_HOME_REASON,
  ROUTED_STATUSES,
  activeTripOfBus,
  getCallerProfile,
  googleKey,
  loadStops,
  recompute,
  type Profile,
  type Trip,
  type TripStop,
} from './core';

type SavedPlace = Schema['SavedPlace']['type'];
type StudentDayStatus = Schema['StudentDayStatus']['type'];
type DayStatus = Schema['DayStatus']['type'];

const PLACE_KINDS = new Set(['HOME', 'FAMILY', 'WORK', 'OTHER']);
const clip = (v: string | null | undefined, n: number) => {
  const s = (v ?? '').trim();
  return s ? s.slice(0, n) : null;
};

export async function reverseGeocode(args: { lat: number; lng: number; language?: string | null }) {
  const key = googleKey();
  if (!key || !Number.isFinite(args.lat) || !Number.isFinite(args.lng)) return {};
  const lang = args.language === 'ar' ? 'ar' : 'en';
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${args.lat},${args.lng}&language=${lang}&result_type=${encodeURIComponent(RESULT_TYPES)}&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error('geocode http', res.status, await res.text());
    return {};
  }
  const json = (await res.json()) as {
    status: string;
    results?: GeoResult[];
    error_message?: string;
  };
  if (json.status !== 'OK' || !json.results?.length) {
    if (json.status !== 'ZERO_RESULTS') console.warn('geocode status', json.status, json.error_message);
    return {};
  }
  return parseGeocode(json.results);
}

// ────────────────────────────── day status ⇄ active trip ──────────────────────────────
/**
 * Applies "not going today" / "going again" to the stops of a running trip (stops are created from
 * the day statuses when the trip starts; toggles after that used to be ignored, so the driver still
 * drove to a student who had cancelled). Returns the stops that changed.
 */
export async function syncStopsWithDayStatus(client: DataClient, trip: Trip): Promise<{ stop: TripStop; to: 'ABSENT' | 'BACK' }[]> {
  if (trip.status !== 'ACTIVE') return [];
  const [stops, statuses] = await Promise.all([
    loadStops(client, trip.id),
    listAll((nextToken) => client.models.StudentDayStatus.listDayStatusByBusAndDate({ busId: trip.busId, date: { eq: trip.date } }, { limit: 200, nextToken })),
  ]);
  const notGoing = new Set(statuses.filter((d) => d.status === 'NOT_GOING').map((d) => d.studentId));
  const changed: { stop: TripStop; to: 'ABSENT' | 'BACK' }[] = [];
  await mapLimit(stops, 8, async (s) => {
    if (notGoing.has(s.studentId) && s.status === 'PENDING') {
      await client.models.TripStop.update({
        id: s.id,
        status: 'ABSENT',
        order: 900 + (s.order % 900),
        etaSeconds: null,
        distanceMeters: null,
      });
      changed.push({ stop: s, to: 'ABSENT' });
    } else if (!notGoing.has(s.studentId) && s.status === 'ABSENT') {
      const location = s.location ?? (await client.models.Profile.get({ userId: s.studentId })).data?.homeLocation ?? null;
      await client.models.TripStop.update(
        location
          ? { id: s.id, status: 'PENDING', location, skipReason: null }
          : {
              id: s.id,
              status: 'SKIPPED',
              skipReason: NO_HOME_REASON,
              skippedAt: nowIso(),
            },
      );
      changed.push({ stop: s, to: 'BACK' });
    }
  });
  return changed;
}

/** Stop statuses after which the rider can no longer change today's plan (the bus is at the door / they rode). */
const LOCKED_STOP_STATUSES = ['ALARMED', 'ACKNOWLEDGED', 'BOARDED', 'DROPPED'];

/**
 * "Not going today" (optionally until a later day) and "I'm going again", written by the server so the
 * running trip changes in the same request: the stop leaves or re-joins the route, the bus is re-routed
 * and the driver is told. Replaces the direct StudentDayStatus writes of older app versions.
 */
export async function setDayStatus(
  client: DataClient,
  caller: Caller,
  args: {
    date: string;
    status: DayStatus;
    note?: string | null;
    untilDate?: string | null;
  },
): Promise<StudentDayStatus[]> {
  const me = await getCallerProfile(client, caller);
  if (!me || me.role !== 'STUDENT') throw new HandlerError('Only students can change their bus plan', 'FORBIDDEN');
  if (me.isActive === false) throw new HandlerError('Account disabled', 'FORBIDDEN');
  if (!me.busId) throw new HandlerError('You are not assigned to a bus yet', 'VALIDATION');
  if (args.status !== 'GOING' && args.status !== 'NOT_GOING') throw new HandlerError('Invalid status', 'VALIDATION');
  const settings = await getSettings(client, me.schoolId);
  const today = todayInTimezone(settings?.timezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date) || args.date < today) throw new HandlerError('Choose today or a later day', 'VALIDATION');
  const until =
    args.status === 'NOT_GOING' && args.untilDate && /^\d{4}-\d{2}-\d{2}$/.test(args.untilDate) && args.untilDate > args.date ? args.untilDate : null;
  const days = until ? daysBetween(args.date, until).slice(0, 31) : [args.date];

  const trip = days.includes(today) ? await activeTripOfBus(client, me.busId, settings?.timezone) : null;
  const stop = trip ? (await loadStops(client, trip.id)).find((s) => s.studentId === me.userId) : undefined;
  if (stop && LOCKED_STOP_STATUSES.includes(stop.status)) {
    throw new HandlerError('The bus has already reached you today – this can no longer be changed.', 'CONFLICT');
  }

  const note = clip(args.note, 300);
  const rows = await mapLimit(days, 5, async (date) => {
    const base = {
      studentId: me.userId,
      date,
      ownerId: me.userId,
      busId: me.busId!,
      schoolId: me.schoolId,
      studentName: me.fullName,
      status: args.status,
      note,
      untilDate: until,
      setBy: me.userId,
    };
    const existing = (await client.models.StudentDayStatus.get({ studentId: me.userId, date })).data;
    return unwrap(existing ? await client.models.StudentDayStatus.update(base) : await client.models.StudentDayStatus.create(base), 'StudentDayStatus');
  });

  if (trip && stop) {
    const changed: { stop: TripStop; to: 'ABSENT' | 'BACK' }[] = [];
    if (args.status === 'NOT_GOING' && ROUTED_STATUSES.includes(stop.status)) {
      await client.models.TripStop.update({
        id: stop.id,
        status: 'ABSENT',
        order: 900 + (stop.order % 900),
        etaSeconds: null,
        distanceMeters: null,
      });
      changed.push({ stop, to: 'ABSENT' });
    } else if (args.status === 'GOING' && stop.status === 'ABSENT') {
      const location = stop.location ?? me.homeLocation ?? null;
      await client.models.TripStop.update(
        location
          ? {
              id: stop.id,
              status: 'PENDING',
              location,
              homeAddress: stop.homeAddress ?? me.homeAddress ?? null,
              skipReason: null,
            }
          : {
              id: stop.id,
              status: 'SKIPPED',
              skipReason: NO_HOME_REASON,
              skippedAt: nowIso(),
            },
      );
      changed.push({ stop, to: 'BACK' });
    }
    if (changed.length) {
      await recompute(client, trip, { force: true, reason: 'day-status' });
      await notifyDriverOfDayChanges(client, trip, changed).catch((e) => console.error('driver notice failed', e));
    }
  }
  return rows;
}

/** Push to the trip's driver (they are on the road: short title, high priority). */
async function tellDriver(client: DataClient, trip: Trip, title: string, body: string, data: Record<string, unknown>) {
  if (!trip.driverUserId) return;
  await notifyUsers(client, {
    schoolId: trip.schoolId,
    userIds: [trip.driverUserId],
    type: 'TRIP',
    title,
    body,
    data: { tripId: trip.id, ...data },
    push: true,
  });
}

export async function notifyDriverOfDayChanges(client: DataClient, trip: Trip, changed: { stop: TripStop; to: 'ABSENT' | 'BACK' }[]) {
  if (!changed.length || !trip.driverUserId) return;
  const driver = (await client.models.Profile.get({ userId: trip.driverUserId })).data;
  const s = t(driver?.language);
  await mapLimit(changed, 3, (c) =>
    tellDriver(
      client,
      trip,
      c.to === 'ABSENT' ? s.riderAbsentTitle(c.stop.studentName) : s.riderBackTitle(c.stop.studentName),
      c.to === 'ABSENT' ? s.riderAbsentBody : s.riderBackBody,
      {
        tripStopId: c.stop.id,
        kind: c.to === 'ABSENT' ? 'RIDER_ABSENT' : 'RIDER_BACK',
      },
    ),
  );
}

// ────────────────────────────── pickup point ──────────────────────────────
type PickupArgs = {
  lat: number;
  lng: number;
  address?: string | null;
  userId?: string | null;
  placeId?: string | null;
  newPlace?: boolean | null;
  label?: string | null;
  kind?: string | null;
  note?: string | null;
  area?: string | null;
  city?: string | null;
  street?: string | null;
  zone?: string | null;
  building?: string | null;
};

function placeDetails(args: PickupArgs) {
  return {
    address: clip(args.address, 400),
    area: clip(args.area, 120),
    city: clip(args.city, 120),
    street: clip(args.street, 160),
    zone: clip(args.zone, 40),
    building: clip(args.building, 80),
    note: clip(args.note, 300),
  };
}

/** What the driver sees for a place: "Grandparents · Al Sadd". */
export function placeSummary(label: string | null | undefined, place: { area?: string | null; address?: string | null } | null | undefined): string {
  const where = place?.area || place?.address?.split(',')[0] || '';
  return [label, where].filter((x) => !!x && x.trim()).join(' · ') || where || label || '';
}

/**
 * Switch the pickup point of a student (themselves, or an office admin for a student of their school).
 * The active place is mirrored on the Profile; on a running trip today's stop moves with it and the
 * route is recomputed at once, so the driver's map, ETA and order update live.
 */
export async function updateHomeLocation(client: DataClient, caller: Caller, args: PickupArgs): Promise<Profile> {
  const me = await getCallerProfile(client, caller);
  if (!me) throw new HandlerError('Your account is not linked to a school yet.', 'FORBIDDEN');
  if (me.isActive === false) throw new HandlerError('Account disabled', 'FORBIDDEN');
  const isOffice = caller.isAdmin && me.role === 'ADMIN';
  const targetId = isOffice && args.userId ? args.userId : caller.sub;
  const target = targetId === me.userId ? me : (await client.models.Profile.get({ userId: targetId })).data;
  if (!target || target.schoolId !== me.schoolId) throw new HandlerError('User not found', 'NOT_FOUND');

  const now = nowIso();
  let place: SavedPlace | null = null;
  if (args.placeId) {
    const found = (await client.models.SavedPlace.get({ id: args.placeId })).data;
    if (!found || found.ownerId !== target.userId) throw new HandlerError('Saved place not found', 'NOT_FOUND');
    place = unwrap(await client.models.SavedPlace.update({ id: found.id, lastUsedAt: now }), 'SavedPlace.update');
  } else {
    if (!Number.isFinite(args.lat) || !Number.isFinite(args.lng) || Math.abs(args.lat) > 90 || Math.abs(args.lng) > 180) {
      throw new HandlerError('Invalid coordinates', 'VALIDATION');
    }
    const details = placeDetails(args);
    const kind = args.kind && PLACE_KINDS.has(args.kind) ? args.kind : 'HOME';
    const current = !args.newPlace && target.homePlaceId ? (await client.models.SavedPlace.get({ id: target.homePlaceId })).data : null;
    if (current && current.ownerId === target.userId) {
      // Same place moved (onboarding again, the office correcting the pin, an older app version).
      place = unwrap(
        await client.models.SavedPlace.update({
          id: current.id,
          lat: args.lat,
          lng: args.lng,
          ...details,
          ...(clip(args.label, 40) ? { label: clip(args.label, 40)! } : {}),
          lastUsedAt: now,
        }),
        'SavedPlace.update',
      );
    } else {
      const existing = await listAll((nextToken) => client.models.SavedPlace.listPlacesByOwner({ ownerId: target.userId }, { limit: 50, nextToken }));
      if (existing.length >= 20) throw new HandlerError('You can save up to 20 places. Delete one first.', 'VALIDATION');
      // The pickup point set before saved places existed becomes the first saved place, so adding a
      // second address never loses the first one.
      if (target.homeLocation && !target.homePlaceId && !existing.some((p) => haversineMeters(p, target.homeLocation!) < 15)) {
        const legacy = unwrap(
          await client.models.SavedPlace.create({
            ownerId: target.userId,
            schoolId: target.schoolId,
            label: target.homeLabel || 'Home',
            kind: 'HOME',
            lat: target.homeLocation.lat,
            lng: target.homeLocation.lng,
            address: target.homeAddress ?? null,
            note: target.homeNote ?? null,
            lastUsedAt: new Date(Date.now() - 1000).toISOString(),
          }),
          'SavedPlace.create',
        );
        existing.push(legacy);
      }
      place = unwrap(
        await client.models.SavedPlace.create({
          ownerId: target.userId,
          schoolId: target.schoolId,
          label: clip(args.label, 40) ?? (existing.length ? 'Other' : 'Home'),
          kind,
          lat: args.lat,
          lng: args.lng,
          ...details,
          lastUsedAt: now,
        }),
        'SavedPlace.create',
      );
    }
  }
  const pos = { lat: place.lat, lng: place.lng };
  const before = target.homeLocation
    ? {
        ...target.homeLocation,
        address: target.homeAddress,
        label: target.homeLabel,
      }
    : null;
  const updated = unwrap(
    await client.models.Profile.update({
      userId: target.userId,
      homeLocation: pos,
      homeAddress: place.address ?? null,
      homePlaceId: place.id,
      homeLabel: place.label,
      homeNote: place.note ?? null,
    }),
    'Profile.update',
  );

  // Today's running trip: move the stop and re-route straight away.
  if (target.busId && target.role === 'STUDENT') {
    const settings = await getSettings(client, target.schoolId);
    const trip = await activeTripOfBus(client, target.busId, settings?.timezone);
    const stop = trip ? (await loadStops(client, trip.id)).find((s) => s.studentId === target.userId) : undefined;
    const movable = stop && (ROUTED_STATUSES.includes(stop.status) || (stop.status === 'SKIPPED' && stop.skipReason === NO_HOME_REASON));
    const moved = !stop?.location || haversineMeters(stop.location, pos) > 15;
    if (trip && stop && movable && !moved) {
      // Same spot (renamed, new directions): refresh what the driver reads, no re-route.
      if (stop.pickupLabel !== place.label || (stop.pickupNote ?? null) !== (place.note ?? null)) {
        await client.models.TripStop.update({
          id: stop.id,
          pickupLabel: place.label,
          pickupNote: place.note ?? null,
          homeAddress: place.address ?? stop.homeAddress ?? null,
        });
      }
    } else if (trip && stop && movable) {
      await client.models.TripStop.update({
        id: stop.id,
        location: pos,
        homeAddress: place.address ?? null,
        pickupLabel: place.label,
        pickupNote: place.note ?? null,
        ...(stop.status === 'SKIPPED' ? { status: 'PENDING' as const, skipReason: null, skippedAt: null } : {}),
        nearNotifiedAt: null,
      });
      await recompute(client, trip, { force: true, reason: 'pickup-change' });
      const driver = trip.driverUserId ? (await client.models.Profile.get({ userId: trip.driverUserId })).data : null;
      const s = t(driver?.language);
      await tellDriver(client, trip, s.pickupMovedTitle(target.fullName), s.pickupMovedBody(placeSummary(place.label, place)), {
        tripStopId: stop.id,
        kind: 'PICKUP_MOVED',
      });
    }
  }

  await audit(client, {
    schoolId: target.schoolId,
    actorId: caller.sub,
    actorName: caller.username,
    action: 'UPDATE_HOME_LOCATION',
    entityType: 'Profile',
    entityId: target.userId,
    before,
    after: {
      ...pos,
      address: place.address,
      label: place.label,
      placeId: place.id,
    },
  });
  if (before && !isOffice && !args.placeId) {
    // a new pickup point (switching between saved places is routine and not reported)
    const admins = await getAdminUserIds(client, target.schoolId);
    const s = t('en');
    await notifyUsers(client, {
      schoolId: target.schoolId,
      userIds: admins,
      type: 'SYSTEM',
      title: s.homeChanged,
      body: s.homeChangedBody(target.fullName),
      data: { userId: target.userId, kind: 'HOME_LOCATION_CHANGED' },
      push: false,
    });
  }
  return updated;
}
