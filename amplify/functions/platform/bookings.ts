import { randomBytes, randomUUID } from 'node:crypto';
import type { Schema } from '../../data/resource';
import { listAll, mapLimit, nowIso, unwrap, type DataClient } from '../shared/data';
import { HandlerError, type Caller } from '../shared/types';
import { notifyUsers } from '../shared/notify';
import { DIRECTORY_PUBLIC } from '../shared/tenancy';
import {
  addDays,
  bookingEndMinute,
  bookingPrice,
  daySlots,
  fromMinutes,
  lockDates,
  minutesSince,
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

// ───────────────────────────── notification texts (en / ar) ─────────────────────────────

type Lang = 'en' | 'ar';
const TEXT = {
  en: {
    newRequest: (v: string) => `New booking request · ${v}`,
    newBooking: (v: string) => `New booking · ${v}`,
    confirmed: (v: string) => `Booking confirmed · ${v}`,
    declined: (v: string) => `Booking declined · ${v}`,
    cancelled: (v: string) => `Booking cancelled · ${v}`,
    minutes: (n: number) => `${n} min`,
  },
  ar: {
    newRequest: (v: string) => `طلب حجز جديد · ${v}`,
    newBooking: (v: string) => `حجز جديد · ${v}`,
    confirmed: (v: string) => `تم تأكيد الحجز · ${v}`,
    declined: (v: string) => `تم رفض الحجز · ${v}`,
    cancelled: (v: string) => `تم إلغاء الحجز · ${v}`,
    minutes: (n: number) => `${n} دقيقة`,
  },
} as const;
const text = (lang: string | null | undefined) => TEXT[lang === 'ar' ? 'ar' : 'en'];

async function loadVenue(client: DataClient, venueId: string): Promise<Venue> {
  const venue = (await client.models.Venue.get({ id: venueId })).data;
  if (!venue) throw new HandlerError('Venue not found', 'NOT_FOUND');
  return venue;
}

/** Every lock of a venue on the given calendar dates: slotKey → bookingId. */
async function lockedSlots(client: DataClient, venueId: string, dates: string[]): Promise<Map<string, string>> {
  const pages = await Promise.all(
    dates.map((date) => listAll((nextToken) => client.models.VenueSlot.listSlotsByVenueAndDate({ venueId, date: { eq: date } }, { limit: 500, nextToken }), 20)),
  );
  return new Map(pages.flat().map((r) => [r.slotKey, r.bookingId]));
}

/** Free units per slot of a day (guests may call this). */
export async function venueAvailability(client: DataClient, args: { venueId: string; date: string }) {
  if (!DATE.test(args.date)) throw new HandlerError('Invalid date', 'VALIDATION');
  const venue = await loadVenue(client, args.venueId);
  const slotMinutes = venue.slotMinutes ?? 60;
  const capacity = Math.max(1, venue.capacity ?? 1);
  const hours = parseHours(venue.openingHours);
  const slots = daySlots(hours, args.date, slotMinutes);
  const now = qatarNow();
  const lastDay = addDays(now.date, venue.advanceDays ?? 14);
  const outOfRange = args.date < now.date || args.date > lastDay;
  const runsPastMidnight = slots.some((s) => s.end > 1440);
  const locks = slots.length && !outOfRange ? await lockedSlots(client, venue.id, runsPastMidnight ? [args.date, addDays(args.date, 1)] : [args.date]) : new Map<string, string>();
  return {
    venueId: venue.id,
    date: args.date,
    open: slots.length > 0 && !outOfRange,
    slotMinutes,
    slots: slots.map((s) => {
      let taken = 0;
      for (let u = 1; u <= capacity; u++) if (slotKeys(args.date, s.start, slotMinutes, u).some((k) => locks.has(k))) taken++;
      return {
        time: fromMinutes(s.start),
        endTime: fromMinutes(s.end),
        free: outOfRange ? 0 : Math.max(0, capacity - taken),
        capacity,
        past: minutesSince(args.date, s.start, now) >= 0,
      };
    }),
  };
}

async function customerContact(client: DataClient, identity: Caller) {
  const profile = (await client.models.Profile.get({ userId: identity.sub })).data;
  return {
    name: profile?.fullName ?? identity.username,
    email: profile?.email ?? undefined,
    phone: profile?.phone ?? undefined,
    language: profile?.language ?? 'en',
  };
}

/** Active partner admins of a business, grouped by app language (for localized notifications). */
async function partnersByLanguage(client: DataClient, businessId: string): Promise<Map<Lang, string[]>> {
  const rows = await listAll((nextToken) => client.models.Profile.listProfilesBySchoolAndRole({ schoolId: businessId, role: { eq: 'PARTNER' } }, { limit: 50, nextToken }), 4);
  const out = new Map<Lang, string[]>();
  for (const p of rows) {
    if (p.isActive === false) continue;
    const lang: Lang = p.language === 'ar' ? 'ar' : 'en';
    out.set(lang, [...(out.get(lang) ?? []), p.userId]);
  }
  return out;
}

async function notifyPartners(client: DataClient, businessId: string, bookingId: string, msg: (s: (typeof TEXT)[Lang]) => { title: string; body: string }) {
  const groups = await partnersByLanguage(client, businessId);
  await Promise.all(
    [...groups].map(([lang, userIds]) => {
      const m = msg(TEXT[lang]);
      return notifyUsers(client, { schoolId: businessId, userIds, type: 'BOOKING', title: m.title, body: m.body, data: { type: 'BOOKING', bookingId }, push: true });
    }),
  );
}

async function notifyCustomer(client: DataClient, customerId: string, bookingId: string, msg: (s: (typeof TEXT)[Lang]) => { title: string; body: string }, push = true) {
  const profile = (await client.models.Profile.get({ userId: customerId })).data;
  const m = msg(text(profile?.language));
  await notifyUsers(client, { schoolId: `cus-${customerId}`, userIds: [customerId], type: 'BOOKING', title: m.title, body: m.body, data: { type: 'BOOKING', bookingId }, push });
}

const when = (b: Pick<Booking, 'date' | 'startTime'>) => `${b.date} ${b.startTime}`;

/** Creates every lock key; on any clash removes the ones it wrote and reports failure. */
async function tryLock(client: DataClient, venueId: string, keys: string[], bookingId: string): Promise<boolean> {
  const results = await Promise.all(
    keys.map(async (key) => {
      const res = await client.models.VenueSlot.create({ venueId, slotKey: key, date: parseSlotKey(key)!.date, bookingId });
      return !res.errors?.length && !!res.data ? key : null;
    }),
  );
  if (results.every(Boolean)) return true;
  await mapLimit(results.filter((k): k is string => !!k), 10, (key) => client.models.VenueSlot.delete({ venueId, slotKey: key }));
  return false;
}

export async function createBooking(
  client: DataClient,
  identity: Caller,
  args: { venueId: string; date: string; startTime: string; durationMinutes: number; people?: number | null; note?: string | null; phone?: string | null },
) {
  // Bookings live in the customer workspace; other accounts would never see them again.
  if (!identity.groups.includes('CUSTOMER') && !identity.groups.includes('OWNER')) throw new HandlerError('Book with a customer account (Explore → Create account).', 'FORBIDDEN');
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
  if (minutesSince(args.date, start, now) >= 0) throw new HandlerError('That time has already passed', 'VALIDATION');
  const hours = parseHours(venue.openingHours);
  if (!windowIsOpen(hours, args.date, start, duration, slotMinutes)) throw new HandlerError('The venue is closed at that time', 'VALIDATION');
  const people = args.people && args.people > 0 ? Math.min(Math.round(args.people), venue.maxPeople ?? 10_000) : undefined;

  const [mine, existing, contact] = await Promise.all([
    listAll((nextToken) => client.models.Booking.listBookingsByCustomer({ customerId: identity.sub }, { limit: 100, nextToken, sortDirection: 'DESC' }), 3),
    lockedSlots(client, venue.id, lockDates(args.date, start, duration)),
    customerContact(client, identity),
  ]);
  const active = mine.filter((b) => (b.status === 'PENDING' || b.status === 'CONFIRMED') && b.date >= now.date);
  if (active.length >= MAX_ACTIVE_PER_CUSTOMER) throw new HandlerError(`You already have ${active.length} upcoming bookings`, 'LIMIT');

  // Lock every quarter hour on one unit; try units in order (conditional creates, rolled back on a clash).
  const bookingId = randomUUID();
  const capacity = Math.max(1, venue.capacity ?? 1);
  let unit = 0;
  for (let u = 1; u <= capacity && !unit; u++) {
    const keys = slotKeys(args.date, start, duration, u);
    if (keys.some((k) => existing.has(k))) continue;
    if (await tryLock(client, venue.id, keys, bookingId)) unit = u;
  }
  if (!unit) throw new HandlerError('Sorry – that time was just booked. Please pick another slot.', 'SLOT_TAKEN');

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
    await mapLimit(slotKeys(args.date, start, duration, unit), 10, (key) => client.models.VenueSlot.delete({ venueId: venue.id, slotKey: key }));
    throw e;
  }

  // Side effects run together; none of them may fail the booking.
  await Promise.all([
    client.models.Venue.update({ id: venue.id, bookingCount: (venue.bookingCount ?? 0) + 1 }).catch(() => undefined),
    notifyPartners(client, venue.businessId, booking.id, (s) => ({
      title: status === 'PENDING' ? s.newRequest(venue.name) : s.newBooking(venue.name),
      body: `${contact.name} · ${when(booking)} (${s.minutes(duration)})`,
    })).catch((e) => console.warn('partner notification failed', e)),
    status === 'CONFIRMED'
      ? notifyCustomer(client, identity.sub, booking.id, (s) => ({ title: s.confirmed(venue.name), body: `${when(booking)} · ${booking.reference}` }), false).catch(() => undefined)
      : Promise.resolve(),
    recordEvent(client, {
      type: 'BOOKING_CREATED',
      title: `${venue.name} · ${when(booking)}`,
      detail: `${contact.name}${booking.price != null ? ` · ${booking.price} ${booking.currency}` : ''}`,
      tenantId: venue.businessId,
      tenantType: 'BUSINESS',
      actorId: identity.sub,
      data: { bookingId: booking.id, price: booking.price ?? null },
    }),
  ]);
  return booking;
}

/** Removes every lock that points at the booking (independent of later slot-grid changes). */
async function releaseLocks(client: DataClient, b: Booking) {
  const dates = lockDates(b.date, toMinutes(b.startTime), b.durationMinutes || bookingEndMinute(b.startTime, b.endTime) - toMinutes(b.startTime));
  const rows = (
    await Promise.all(dates.map((date) => listAll((nextToken) => client.models.VenueSlot.listSlotsByVenueAndDate({ venueId: b.venueId, date: { eq: date } }, { limit: 500, nextToken }), 20)))
  ).flat();
  await mapLimit(
    rows.filter((r) => r.bookingId === b.id),
    10,
    (r) => client.models.VenueSlot.delete({ venueId: r.venueId, slotKey: r.slotKey }),
  );
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
  if (isCustomer && !isPartner && !isOwner) {
    const startsIn = msUntil(b.date, toMinutes(b.startTime));
    if (startsIn <= 0) throw new HandlerError('This booking has already started. Please contact the venue.', 'CONFLICT');
    if (b.status === 'CONFIRMED') {
      const venue = (await client.models.Venue.get({ id: b.venueId })).data;
      const limitMs = (venue?.cancellationHours ?? 0) * 3_600_000;
      if (limitMs > 0 && startsIn < limitMs) {
        throw new HandlerError(`Free cancellation ends ${venue?.cancellationHours} h before the start. Please contact the venue.`, 'CONFLICT');
      }
    }
  }
  const by = isCustomer ? 'CUSTOMER' : isOwner && !isPartner ? 'OWNER' : 'BUSINESS';
  const reason = args.reason?.trim().slice(0, 500) || undefined;
  const updated = unwrap(
    await client.models.Booking.update({ id: b.id, status: 'CANCELLED', cancelledBy: by, businessNote: by !== 'CUSTOMER' ? reason || b.businessNote : b.businessNote, respondedAt: nowIso() }),
    'Booking.update',
  );
  await releaseLocks(client, b);
  const detail = (max: number) => (reason ? ` – ${reason.slice(0, max)}` : '');
  if (by === 'CUSTOMER') {
    await notifyPartners(client, b.businessId, b.id, (s) => ({ title: s.cancelled(b.venueName ?? ''), body: `${b.customerName ?? ''} · ${when(b)}${detail(120)}` }));
  } else {
    await notifyCustomer(client, b.customerId, b.id, (s) => ({ title: s.cancelled(b.venueName ?? ''), body: `${when(b)}${detail(160)}` }));
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
  const now = qatarNow();
  if ((args.status === 'COMPLETED' || args.status === 'NO_SHOW') && minutesSince(b.date, toMinutes(b.startTime), now) < 0) {
    throw new HandlerError('Mark the booking completed or no-show once it has started', 'CONFLICT');
  }
  if (args.status === 'CONFIRMED' && minutesSince(b.date, bookingEndMinute(b.startTime, b.endTime), now) >= 0) {
    throw new HandlerError('This booking time is already over', 'CONFLICT');
  }
  const note = args.note?.trim().slice(0, 500) || undefined;
  const updated = unwrap(await client.models.Booking.update({ id: b.id, status: args.status, businessNote: note || b.businessNote, respondedAt: nowIso() }), 'Booking.update');
  if (args.status === 'DECLINED') await releaseLocks(client, b);
  if (args.status === 'CONFIRMED' || args.status === 'DECLINED') {
    await notifyCustomer(client, b.customerId, b.id, (s) => ({
      title: args.status === 'CONFIRMED' ? s.confirmed(b.venueName ?? '') : s.declined(b.venueName ?? ''),
      body: `${when(b)} · ${b.reference}${note ? ` – ${note.slice(0, 160)}` : ''}`,
    }));
  }
  return updated;
}

/** Parses a lock key (exported for tests / tooling). */
export { parseSlotKey };
