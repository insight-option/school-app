import {
  addDays,
  bookingEndMinute,
  bookingPrice,
  dayIntervals,
  daySlots,
  fromMinutes,
  hoursProblem,
  isOpenNow,
  isQuarterHour,
  lockDates,
  minutesSince,
  msUntil,
  newBookingReference,
  newBusinessId,
  parseHours,
  parseSlotKey,
  qatarNow,
  slotKeys,
  toMinutes,
  weekdayOf,
  windowIsOpen,
} from '../amplify/functions/shared/booking';
import { roleFromGroups, homeRouteForRole, canAccessWorkspace } from '../src/lib/auth/routing';

// 2026-11-01 is a Sunday (weekday 0)
const SUNDAY = '2026-11-01';
const hours = parseHours({ '0': [['08:00', '12:00'], ['16:00', '02:00']], '5': [['14:00', '22:00']], '9': [['01:00', '02:00']], '1': [['bad', '10:00']] });

describe('opening hours', () => {
  it('parses stored JSON (object or string) and drops malformed ranges', () => {
    expect(Object.keys(hours).sort()).toEqual(['0', '5']);
    expect(parseHours(JSON.stringify({ '2': [['09:00', '10:00']] }))).toEqual({ '2': [['09:00', '10:00']] });
    expect(parseHours('not json')).toEqual({});
    expect(parseHours(null)).toEqual({});
  });

  it('knows weekdays and overnight ranges', () => {
    expect(weekdayOf(SUNDAY)).toBe(0);
    expect(dayIntervals(hours, SUNDAY)).toEqual([
      { start: 480, end: 720 },
      { start: 960, end: 1560 },
    ]);
    expect(dayIntervals(hours, addDays(SUNDAY, 1))).toEqual([]);
  });

  it('builds the slot grid and validates windows', () => {
    const slots = daySlots(hours, SUNDAY, 60);
    expect(slots[0]).toEqual({ start: 480, end: 540 });
    expect(slots).toHaveLength(4 + 10);
    expect(fromMinutes(slots[slots.length - 1].start)).toBe('01:00');
    expect(windowIsOpen(hours, SUNDAY, 480, 120, 60)).toBe(true);
    expect(windowIsOpen(hours, SUNDAY, 660, 120, 60)).toBe(false); // runs past noon close
    expect(windowIsOpen(hours, SUNDAY, 510, 60, 60)).toBe(false); // off the grid
    expect(windowIsOpen(hours, SUNDAY, 1500, 60, 60)).toBe(true); // 01:00 after midnight
    expect(windowIsOpen(hours, SUNDAY, 480, 90, 60)).toBe(false); // not a multiple of the slot
  });

  it('converts times', () => {
    expect(toMinutes('07:30')).toBe(450);
    expect(Number.isNaN(toMinutes('7:3'))).toBe(true);
    expect(fromMinutes(1500)).toBe('01:00');
    expect(toMinutes('24:00')).toBe(1440); // closing at midnight
    expect(Number.isNaN(toMinutes('24:30'))).toBe(true);
    expect(isQuarterHour('08:45')).toBe(true);
    expect(isQuarterHour('08:10')).toBe(false);
  });

  it('rejects hours off the quarter-hour grid and overlapping ranges', () => {
    expect(hoursProblem(parseHours({ '0': [['08:00', '12:00'], ['16:00', '02:00']] }))).toBeNull();
    expect(hoursProblem(parseHours({ '1': [['08:10', '12:00']] }))).toMatch(/quarter/);
    expect(hoursProblem(parseHours({ '2': [['08:00', '14:00'], ['12:00', '18:00']] }))).toMatch(/overlap/);
    expect(hoursProblem(parseHours({ '3': [['09:00', '09:00']] }))).toMatch(/HH:mm/);
  });
});

describe('slot locks', () => {
  it('locks every quarter hour on the chosen unit and parses it back', () => {
    const keys = slotKeys(SUNDAY, 960, 60, 2);
    expect(keys).toEqual([`${SUNDAY}#0960#2`, `${SUNDAY}#0975#2`, `${SUNDAY}#0990#2`, `${SUNDAY}#1005#2`]);
    expect(parseSlotKey(keys[1])).toEqual({ date: SUNDAY, start: 975, unit: 2 });
    expect(parseSlotKey('broken')).toBeNull();
  });

  it('keeps bookings on different slot grids from overlapping', () => {
    // 18:00–19:00 booked on a 60-minute grid, later the venue switches to 30-minute slots
    const hourBooking = new Set(slotKeys(SUNDAY, 1080, 60, 1));
    const halfHourSlot = slotKeys(SUNDAY, 1110, 30, 1); // 18:30–19:00
    expect(halfHourSlot.some((k) => hourBooking.has(k))).toBe(true);
  });

  it('locks overnight slots on the real calendar day', () => {
    const monday = addDays(SUNDAY, 1);
    // Sunday's 23:30–00:30 range slot vs a booking at Monday 00:00 from Monday's own hours
    const overnight = slotKeys(SUNDAY, 1410, 60, 1);
    expect(overnight).toEqual([`${SUNDAY}#1410#1`, `${SUNDAY}#1425#1`, `${monday}#0000#1`, `${monday}#0015#1`]);
    expect(slotKeys(monday, 0, 30, 1).every((k) => overnight.includes(k))).toBe(true);
    expect(lockDates(SUNDAY, 1410, 60)).toEqual([SUNDAY, monday]);
    expect(lockDates(SUNDAY, 600, 120)).toEqual([SUNDAY]);
    expect(lockDates(SUNDAY, 1380, 60)).toEqual([SUNDAY]); // ends exactly at midnight
  });

  it('knows when a booking has started and ended (overnight-aware)', () => {
    expect(bookingEndMinute('23:00', '01:00')).toBe(1500);
    expect(bookingEndMinute('23:00', '00:00')).toBe(1440);
    expect(bookingEndMinute('18:00', '19:30')).toBe(1170);
    const monday = addDays(SUNDAY, 1);
    // Monday 00:30 – a Sunday 23:00–01:00 booking is still running
    expect(minutesSince(SUNDAY, 1500, { date: monday, minutes: 30 })).toBe(-30);
    expect(minutesSince(SUNDAY, 1380, { date: monday, minutes: 30 })).toBe(90);
    expect(minutesSince(monday, 600, { date: SUNDAY, minutes: 600 })).toBe(-1440);
  });
});

describe('pricing', () => {
  it('prices per hour, session and person; hides on request', () => {
    expect(bookingPrice('PER_HOUR', 250, 90)).toBe(375);
    expect(bookingPrice('PER_SESSION', 120, 180)).toBe(120);
    expect(bookingPrice('PER_PERSON', 35, 60, 4)).toBe(140);
    expect(bookingPrice('FREE', 99, 60)).toBe(0);
    expect(bookingPrice('ON_REQUEST', 99, 60)).toBeNull();
    expect(bookingPrice('PER_HOUR', null, 60)).toBeNull();
  });
});

describe('Qatar clock', () => {
  it('uses UTC+3 for "today" and "open now"', () => {
    const at = (iso: string) => Date.parse(iso);
    expect(qatarNow(at('2026-11-01T21:30:00Z'))).toEqual({ date: '2026-11-02', minutes: 30 });
    // Sunday 10:00 Qatar = 07:00 UTC → open (08:00–12:00 range is Qatar time? 10:00 yes)
    expect(isOpenNow(hours, at('2026-11-01T07:00:00Z'))).toBe(true);
    // Sunday 14:00 Qatar → closed between ranges
    expect(isOpenNow(hours, at('2026-11-01T11:00:00Z'))).toBe(false);
    // Monday 01:30 Qatar → still inside Sunday's overnight range
    expect(isOpenNow(hours, at('2026-11-01T22:30:00Z'))).toBe(true);
    expect(msUntil(SUNDAY, 600, at('2026-11-01T06:00:00Z'))).toBe(60 * 60_000);
  });
});

describe('ids', () => {
  const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => i * 7);
  it('generates business ids and booking references without ambiguous characters', () => {
    expect(newBusinessId(bytes)).toMatch(/^biz-[a-z2-9]{10}$/);
    expect(newBookingReference(bytes)).toMatch(/^BK-[A-HJ-NP-Z2-9]{6}$/);
  });
});

describe('platform roles', () => {
  it('routes owner, partner and customer accounts to their workspaces', () => {
    expect(roleFromGroups(['CUSTOMER'])).toBe('CUSTOMER');
    expect(roleFromGroups(['PARTNER', 'biz-abc'])).toBe('PARTNER');
    expect(roleFromGroups(['ADMIN', 'OWNER'])).toBe('OWNER');
    expect(homeRouteForRole('OWNER')).toBe('/(owner)/overview');
    expect(homeRouteForRole('PARTNER')).toBe('/(partner)/dashboard');
    expect(homeRouteForRole('CUSTOMER')).toBe('/(customer)/(tabs)/explore');
    expect(canAccessWorkspace('CUSTOMER', '(owner)')).toBe(false);
    expect(canAccessWorkspace('OWNER', '(owner)')).toBe(true);
  });
});

describe('Expo Go sign-in maths (Amplify native shim)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { modPow, computeS } = require('../src/lib/amplifyNativeShim') as typeof import('../src/lib/amplifyNativeShim');
  it('computes modular powers like the native module', () => {
    expect(modPow(4n, 13n, 497n)).toBe(445n);
    expect(modPow(2n, 10n, 1000n)).toBe(24n);
    expect(modPow(-3n, 3n, 7n)).toBe(1n); // (-27) mod 7 = 1
  });
  it('computes the SRP secret S = (B − k·g^x)^(a + u·x) mod N', () => {
    // with B = k·g^x the base is 0 → S = 0
    const N = BigInt('0x' + 'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1');
    expect(N > 0n).toBe(true);
    const s = computeS({ g: '2', x: '5', k: '3', a: '7', b: (3n * 32n).toString(16), u: '1' });
    expect(s).toBe('0');
    expect(computeS({ g: '2', x: '1', k: '1', a: '1', b: '5', u: '0' })).toBe('3');
  });
});
