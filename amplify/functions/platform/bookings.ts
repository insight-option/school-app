import { randomBytes, randomUUID } from 'node:crypto';
import type { Schema } from '../../data/resource';
import { listAll, mapLimit, nowIso, unwrap, type DataClient } from '../shared/data';
import { HandlerError, type Caller } from '../shared/types';
import { notifyUsers } from '../shared/notify';
import { DIRECTORY_PUBLIC } from '../shared/tenancy';
import {
  addDays,
  bookingPrice,
  daySlots,
  fromMinutes,
  msUntil,
  newBookingReference,
  parseHours,
  parseSlotKey,
  qatarNow,
  slotKeys,
  toMinutes,
  windowIsOpen,
} from '../shared/booking';
import { recordEvent } from '../shared/platform';

type Booking = Schema['Booking']['type'];
type Venue = Schema['Venue']['type'];
type BookingStatus = NonNullable<Booking['status']>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ACTIVE_PER_CUSTOMER = 6;

async function loadVenue(client: DataClient, venueId: string): Promise<Venue> {
  const venue = (await client.models.Venue.get({ id: venueId })).data;
  if (!venue) throw new HandlerError('Venue not found', 'NOT_FOUND');
  return venue;
}

async function lockedSlots(client: DataClient, venueId: string, date: string): Promise<Map<string, string>> {
  const rows = await listAll((nextToken) => client.models.VenueSlot.listSlotsByVenueAndDate({ venueId, date: { eq: date } }, { limit: 500, nextToken }), 20);
  return new Map(rows.map((r) => [r.slotKey, r.bookingId]));
}

/** Free units per slot of a day (guests may call this). */
export async function venueAvailability(client: DataClient, args: { venueId: string; date: string }) {
  if (!DATE.test(args.date)) throw new HandlerError('Invalid date', 'VALIDATION');
  const venue = await loadVenue(client, args.venueId);
  const slotMinutes = venue.slotMinutes ?? 60;
  const capacity = Math.max(1, venue.capacity ?? 1);
  const hours = parseHours(venue.openingHours);
  const slots = daySlots(hours, args.date, slotMinutes);
  const locks = await lockedSlots(client, venue.id, args.date);
  const now = qatarNow();
  const lastDay = addDays(now.date, venue.advanceDays ?? 14);
  const outOfRange = args.date < now.date || args.date > lastDay;
  return {
    venueId: venue.id,
    date: args.date,
    open: slots.length > 0 && !outOfRange,
    slotMinutes,
    slots: slots.map((s) => {
      let taken = 0;
      for (let u = 1; u <= capacity; u++) if (locks.has(slotKeys(args.date, s.start, slotMinutes, slotMinutes, u)[0])) taken++;
      return {
        time: fromMinutes(s.start),
        endTime: fromMinutes(s.end),
        free: outOfRange ? 0 : Math.max(0, capacity - taken),
        capacity,
        past: args.date === now.date && s.start <= now.minutes,
      };
    }),
  };
}

async function customerContact(client: DataClient, identity: Caller) {
  const profile = (await client.models.Profile.get({ userId: identity.sub })).data;
  const claims = (identity as { claims?: Record<string, unknown> }).claims ?? {};
  return {
    name: profile?.fullName ?? (typeof claims.name === 'string' ? claims.name : identity.username),
    email: profile?.email ?? (typeof claims.email === 'string' ? claims.email : undefined),
    phone: profile?.phone ?? undefined,
  };
}

async function partnerUserIds(client: DataClient, businessId: string): Promise<string[]> {
  const rows = await listAll((nextToken) => client.models.Profile.listProfilesBySchoolAndRole({ schoolId: businessId, role: { eq: 'PARTNER' } }, { limit: 50, nextToken }), 4);
  return rows.filter((p) => p.isActive !== false).map((p) => p.userId);
}

const when = (b: Pick<Booking, 'date' | 'startTime'>) => `${b.date} ${b.startTime}`;

export async function createBooking(
  client: DataClient,
  identity: Caller,
  args: { venueId: string; date: string; startTime: string; durationMinutes: number; people?: number | null; note?: string | null; phone?: string | null },
) {
  if (!DATE.test(args.date)) throw new HandlerError('Invalid date', 'VALIDATION');
  const venue = await loadVenue(client, args.venueId);
  const business = (await client.models.Business.get({ businessId: venue.businessId })).data;
  if (!business || business.status !== 'ACTIVE' || venue.directory !== DIRECTORY_PUBLIC) throw new HandlerError('This venue is not taking bookings right now', 'CONFLICT');
  if (venue.bookingMode === 'CONTACT') throw new HandlerError('Book this venue by phone', 'CONFLICT');

  const slotMinutes = venue.slotMinutes ?? 60;
  const start = toMinutes(args.startTime);
  const duration = Math.round(args.durationMinutes);
  const minD = venue.minDurationMinutes ?? slotMinutes;
  const maxD = venue.maxDurationMinutes ?? slotMinutes * 3;
  if (isNaN(start)) throw new HandlerError('Invalid time', 'VALIDATION');
  if (duration < minD || duration > maxD || duration % slotMinutes !== 0) throw new HandlerError(`Choose ${minD}–${maxD} minutes`, 'VALIDATION');
  const now = qatarNow();
  if (args.date < now.date || args.date > addDays(now.date, venue.advanceDays ?? 14)) throw new HandlerError('That date cannot be booked', 'VALIDATION');
  if (args.date === now.date && start <= now.minutes) throw new HandlerError('That time has already passed', 'VALIDATION');
  const hours = parseHours(venue.openingHours);
  if (!windowIsOpen(hours, args.date, start, duration, slotMinutes)) throw new HandlerError('The venue is closed at that time', 'VALIDATION');
  const people = args.people && args.people > 0 ? Math.min(Math.round(args.people), venue.maxPeople ?? 10_000) : undefined;

  const mine = await listAll((nextToken) => client.models.Booking.listBookingsByCustomer({ customerId: identity.sub }, { limit: 100, nextToken, sortDirection: 'DESC' }), 3);
  const active = mine.filter((b) => (b.status === 'PENDING' || b.status === 'CONFIRMED') && b.date >= now.date);
  if (active.length >= MAX_ACTIVE_PER_CUSTOMER) throw new HandlerError(`You already have ${active.length} upcoming bookings`, 'LIMIT');

  // Lock every slot on one unit; try units in order, roll back partial locks on a clash.
  const bookingId = randomUUID();
  const capacity = Math.max(1, venue.capacity ?? 1);
  const existing = await lockedSlots(client, venue.id, args.date);
  let unit = 0;
  for (let u = 1; u <= capacity && !unit; u++) {
    const keys = slotKeys(args.date, start, duration, slotMinutes, u);
    if (keys.some((k) => existing.has(k))) continue;
    const created: string[] = [];
    let ok = true;
    for (const key of keys) {
      const res = await client.models.VenueSlot.create({ venueId: venue.id, slotKey: key, date: args.date, bookingId });
      if (res.errors?.length || !res.data) {
        ok = false;
        break;
      }
      created.push(key);
    }
    if (ok) unit = u;
    else for (const key of created) await client.models.VenueSlot.delete({ venueId: venue.id, slotKey: key });
  }
  if (!unit) throw new HandlerError('Sorry – that time was just booked. Please pick another slot.', 'SLOT_TAKEN');

  const contact = await customerContact(client, identity);
  const status: BookingStatus = venue.bookingMode === 'INSTANT' ? 'CONFIRMED' : 'PENDING';
  let booking: Booking;
  try {
    booking = unwrap(
      await client.models.Booking.create({
        id: bookingId,
        reference: newBookingReference((n) => randomBytes(n)),
        venueId: venue.id,
        venueName: venue.name,
        venuePhotoKey: venue.photos?.[0] ?? undefined,
        businessId: venue.businessId,
        businessName: venue.businessName ?? business.name,
        categoryId: venue.categoryId,
        customerId: identity.sub,
        customerName: contact.name,
        customerPhone: args.phone?.trim().slice(0, 32) || contact.phone,
        customerEmail: contact.email,
        date: args.date,
        startTime: fromMinutes(start),
        endTime: fromMinutes(start + duration),
        durationMinutes: duration,
        unit,
        unitLabel: venue.unitLabel ?? undefined,
        people,
        price: bookingPrice(venue.priceMode, venue.price, duration, people ?? 1) ?? undefined,
        currency: venue.currency ?? 'QAR',
        priceMode: venue.priceMode,
        status,
        note: args.note?.trim().slice(0, 500) || undefined,
        bookedAt: nowIso(),
      }),
      'Booking.create',
    );
  } catch (e) {
    for (const key of slotKeys(args.date, start, duration, slotMinutes, unit)) await client.models.VenueSlot.delete({ venueId: venue.id, slotKey: key });
    throw e;
  }
  await client.models.Venue.update({ id: venue.id, bookingCount: (venue.bookingCount ?? 0) + 1 }).catch(() => undefined);

  const partners = await partnerUserIds(client, venue.businessId);
  await notifyUsers(client, {
    schoolId: venue.businessId,
    userIds: partners,
    type: 'BOOKING',
    title: status === 'PENDING' ? `New booking request · ${venue.name}` : `New booking · ${venue.name}`,
    body: `${contact.name} · ${when(booking)} (${duration} min)`,
    data: { type: 'BOOKING', bookingId: booking.id },
    push: true,
  });
  if (status === 'CONFIRMED') {
    await notifyUsers(client, {
      schoolId: `cus-${identity.sub}`,
      userIds: [identity.sub],
      type: 'BOOKING',
      title: `Booking confirmed · ${venue.name}`,
      body: `${when(booking)} · ${booking.reference}`,
      data: { type: 'BOOKING', bookingId: booking.id },
      push: false,
    });
  }
  await recordEvent(client, {
    type: 'BOOKING_CREATED',
    title: `${venue.name} · ${when(booking)}`,
    detail: `${contact.name}${booking.price != null ? ` · ${booking.price} ${booking.currency}` : ''}`,
    tenantId: venue.businessId,
    tenantType: 'BUSINESS',
    actorId: identity.sub,
    data: { bookingId: booking.id, price: booking.price ?? null },
  });
  return booking;
}

async function releaseLocks(client: DataClient, b: Booking) {
  const venue = (await client.models.Venue.get({ id: b.venueId })).data;
  const slotMinutes = venue?.slotMinutes ?? 60;
  const keys = b.unit ? slotKeys(b.date, toMinutes(b.startTime), b.durationMinutes, slotMinutes, b.unit) : [];
  if (!keys.length || !venue) {
    // fall back to every lock that points at this booking
    const rows = await listAll((nextToken) => client.models.VenueSlot.listSlotsByVenueAndDate({ venueId: b.venueId, date: { eq: b.date } }, { limit: 500, nextToken }), 20);
    await mapLimit(rows.filter((r) => r.bookingId === b.id), 5, (r) => client.models.VenueSlot.delete({ venueId: r.venueId, slotKey: r.slotKey }));
    return;
  }
  await mapLimit(keys, 5, async (key) => {
    const lock = (await client.models.VenueSlot.get({ venueId: b.venueId, slotKey: key })).data;
    if (lock?.bookingId === b.id) await client.models.VenueSlot.delete({ venueId: b.venueId, slotKey: key });
  });
}

async function loadBooking(client: DataClient, bookingId: string) {
  const b = (await client.models.Booking.get({ id: bookingId })).data;
  if (!b) throw new HandlerError('Booking not found', 'NOT_FOUND');
  return b;
}

export async function cancelBooking(client: DataClient, identity: Caller, args: { bookingId: string; reason?: string | null }) {
  const b = await loadBooking(client, args.bookingId);
  const isCustomer = b.customerId === identity.sub;
  const isPartner = identity.groups.includes(b.businessId);
  const isOwner = identity.groups.includes('OWNER');
  if (!isCustomer && !isPartner && !isOwner) throw new HandlerError('Booking not found', 'NOT_FOUND');
  if (b.status !== 'PENDING' && b.status !== 'CONFIRMED') throw new HandlerError('This booking can no longer be cancelled', 'CONFLICT');
  if (isCustomer && !isPartner && !isOwner && b.status === 'CONFIRMED') {
    const venue = (await client.models.Venue.get({ id: b.venueId })).data;
    const limitMs = (venue?.cancellationHours ?? 0) * 3_600_000;
    if (limitMs > 0 && msUntil(b.date, toMinutes(b.startTime)) < limitMs) {
      throw new HandlerError(`Free cancellation ends ${venue?.cancellationHours} h before the start. Please contact the venue.`, 'CONFLICT');
    }
  }
  const by = isCustomer ? 'CUSTOMER' : isOwner && !isPartner ? 'OWNER' : 'BUSINESS';
  const updated = unwrap(
    await client.models.Booking.update({ id: b.id, status: 'CANCELLED', cancelledBy: by, businessNote: by !== 'CUSTOMER' ? args.reason?.slice(0, 500) || b.businessNote : b.businessNote, respondedAt: nowIso() }),
    'Booking.update',
  );
  await releaseLocks(client, b);
  if (by === 'CUSTOMER') {
    await notifyUsers(client, {
      schoolId: b.businessId,
      userIds: await partnerUserIds(client, b.businessId),
      type: 'BOOKING',
      title: `Booking cancelled · ${b.venueName ?? ''}`,
      body: `${b.customerName ?? ''} · ${when(b)}${args.reason ? ` – ${args.reason.slice(0, 120)}` : ''}`,
      data: { type: 'BOOKING', bookingId: b.id },
      push: true,
    });
  } else {
    await notifyUsers(client, {
      schoolId: `cus-${b.customerId}`,
      userIds: [b.customerId],
      type: 'BOOKING',
      title: `Booking cancelled · ${b.venueName ?? ''}`,
      body: `${when(b)}${args.reason ? ` – ${args.reason.slice(0, 160)}` : ''}`,
      data: { type: 'BOOKING', bookingId: b.id },
      push: true,
    });
  }
  return updated;
}

const TRANSITIONS: Record<string, BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'DECLINED'],
  CONFIRMED: ['COMPLETED', 'NO_SHOW'],
};

export async function respondBooking(client: DataClient, identity: Caller, args: { bookingId: string; status: BookingStatus; note?: string | null }) {
  const b = await loadBooking(client, args.bookingId);
  if (!identity.groups.includes(b.businessId) && !identity.groups.includes('OWNER')) throw new HandlerError('Booking not found', 'NOT_FOUND');
  if (!(TRANSITIONS[b.status ?? ''] ?? []).includes(args.status)) throw new HandlerError(`Cannot change a ${b.status?.toLowerCase()} booking to ${args.status.toLowerCase()}`, 'CONFLICT');
  const updated = unwrap(
    await client.models.Booking.update({ id: b.id, status: args.status, businessNote: args.note?.trim().slice(0, 500) || b.businessNote, respondedAt: nowIso() }),
    'Booking.update',
  );
  if (args.status === 'DECLINED') await releaseLocks(client, b);
  if (args.status === 'CONFIRMED' || args.status === 'DECLINED') {
    await notifyUsers(client, {
      schoolId: `cus-${b.customerId}`,
      userIds: [b.customerId],
      type: 'BOOKING',
      title: args.status === 'CONFIRMED' ? `Booking confirmed · ${b.venueName ?? ''}` : `Booking declined · ${b.venueName ?? ''}`,
      body: `${when(b)} · ${b.reference}${args.note ? ` – ${args.note.slice(0, 160)}` : ''}`,
      data: { type: 'BOOKING', bookingId: b.id },
      push: true,
    });
  }
  return updated;
}

/** Parses a lock key (exported for tests / tooling). */
export { parseSlotKey };
