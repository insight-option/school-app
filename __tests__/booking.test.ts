import {
  addDays,
  bookingPrice,
  dayIntervals,
  daySlots,
  fromMinutes,
  isOpenNow,
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
  });
});

describe('slot locks', () => {
  it('produces one key per slot on the chosen unit and parses it back', () => {
    const keys = slotKeys(SUNDAY, 960, 180, 60, 2);
    expect(keys).toEqual([`${SUNDAY}#0960#2`, `${SUNDAY}#1020#2`, `${SUNDAY}#1080#2`]);
    expect(parseSlotKey(keys[1])).toEqual({ date: SUNDAY, start: 1020, unit: 2 });
    expect(parseSlotKey('broken')).toBeNull();
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
