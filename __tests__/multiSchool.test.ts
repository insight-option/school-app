import { randomBytes } from 'node:crypto';
import {
  DIRECTORY_PUBLIC,
  isOfficeSeat,
  isValidSchoolId,
  matchesSearch,
  newApplicationReference,
  newSchoolId,
  normalizeSearch,
  officeSeatId,
} from '../amplify/functions/shared/tenancy';
import { ackToken, verifyAckToken } from '../amplify/functions/shared/ackToken';
import { acceptsApplications, feeRange, filterSchools, splitList, topCurricula, websiteUrl, type DirectorySchool } from '../src/lib/directory';
import { cleanApplication, formatDobInput, validateApplication } from '../src/lib/applicationForm';
import { PolylineBuilder, speedSpans } from '../amplify/functions/trips/routing';

const rnd = (n: number) => new Uint8Array(randomBytes(n));

describe('tenancy helpers', () => {
  it('keeps the legacy office seat and namespaces new schools', () => {
    expect(officeSeatId('default')).toBe('OFFICE');
    expect(officeSeatId('')).toBe('OFFICE');
    expect(officeSeatId('sch-abc')).toBe('OFFICE_sch-abc');
    expect(isOfficeSeat('OFFICE')).toBe(true);
    expect(isOfficeSeat('OFFICE_sch-abc')).toBe(true);
    expect(isOfficeSeat('5113edfa-30d1')).toBe(false);
  });

  it('generates valid school ids and application references', () => {
    for (let i = 0; i < 50; i++) {
      const id = newSchoolId(rnd);
      expect(isValidSchoolId(id)).toBe(true);
      expect(newApplicationReference(rnd)).toMatch(/^AP-[A-Z2-9]{8}$/);
    }
    expect(isValidSchoolId('default')).toBe(true);
    expect(isValidSchoolId('ADMIN')).toBe(false);
  });

  it('normalises Arabic and Latin text for search', () => {
    expect(normalizeSearch('  Al-Nūr   ACADEMY ')).toBe('al-nur academy');
    expect(normalizeSearch('مَدْرَسَة الأمل')).toBe(normalizeSearch('مدرسه الامل'));
    expect(matchesSearch('Al Noor International School Riyadh', 'noor riy')).toBe(true);
    expect(matchesSearch('Al Noor International School', 'jeddah')).toBe(false);
    expect(matchesSearch('anything', '')).toBe(true);
  });
});

describe('directory', () => {
  const base = (over: Partial<DirectorySchool>): DirectorySchool => ({ schoolId: 'x', name: 'School', ...over });
  const schools: DirectorySchool[] = [
    base({ schoolId: 'a', name: 'Beta Academy', city: 'Riyadh', curriculum: 'British', applicationsOpen: true, transportAvailable: true }),
    base({ schoolId: 'b', name: 'Alpha School', city: 'Jeddah', curriculum: 'American', applicationsOpen: false }),
    base({ schoolId: 'c', name: 'Gamma Alpha College', city: 'Riyadh', curriculum: 'british', applicationsOpen: true, applicationDeadline: '2020-01-01' }),
  ];

  it('ranks name-prefix matches first and filters', () => {
    expect(filterSchools(schools, { query: 'alpha', openOnly: false, transportOnly: false, curriculum: null }).map((s) => s.schoolId)).toEqual(['b', 'c']);
    expect(filterSchools(schools, { query: '', openOnly: true, transportOnly: false, curriculum: null }, '2026-10-30').map((s) => s.schoolId)).toEqual(['a']);
    expect(filterSchools(schools, { query: '', openOnly: false, transportOnly: true, curriculum: null }).map((s) => s.schoolId)).toEqual(['a']);
    expect(filterSchools(schools, { query: 'riyadh', openOnly: false, transportOnly: false, curriculum: 'BRITISH' }).map((s) => s.schoolId).sort()).toEqual(['a', 'c']);
  });

  it('treats a past deadline as closed', () => {
    expect(acceptsApplications(schools[2], '2026-10-30')).toBe(false);
    expect(acceptsApplications(schools[0], '2026-10-30')).toBe(true);
  });

  it('formats fees, curricula, lists and links', () => {
    expect(feeRange(base({ feesFrom: 12000, feesTo: 18000, currency: 'SAR' }))).toBe('12,000 – 18,000 SAR');
    expect(feeRange(base({ feesFrom: 9000 }))).toBe('9,000');
    expect(feeRange(base({}))).toBeNull();
    expect(topCurricula(schools)).toEqual(['British', 'American']);
    expect(splitList('Library, Pool;\nLabs, library, ')).toEqual(['Library', 'Pool', 'Labs']);
    expect(websiteUrl('school.example')).toBe('https://school.example');
    expect(websiteUrl('http://a.b')).toBe('http://a.b');
    expect(websiteUrl('  ')).toBeNull();
  });
});

describe('application form', () => {
  const ok = { studentName: 'Sara Ali', parentName: 'Ali Hassan', parentEmail: 'ali@example.com', parentPhone: '+966 55 123 4567' };
  it('accepts a complete application', () => {
    expect(validateApplication(ok, '2026-10-30')).toEqual({});
  });
  it('flags missing and malformed fields', () => {
    const e = validateApplication({ studentName: 'S', parentName: '', parentEmail: 'nope', parentPhone: '12', dateOfBirth: '2030-01-01' }, '2026-10-30');
    expect(e).toEqual({ studentName: 'required', parentName: 'required', parentEmail: 'email', parentPhone: 'phone', dateOfBirth: 'dob' });
  });
  it('cleans and formats input', () => {
    expect(cleanApplication({ ...ok, notes: '  ', gradeApplying: ' Grade 3 ' })).toEqual({ ...ok, gradeApplying: 'Grade 3' });
    expect(formatDobInput('20190507')).toBe('2019-05-07');
    expect(formatDobInput('2019-0')).toBe('2019-0');
  });
});

describe('alarm acknowledge token', () => {
  const secret = 'test-secret';
  it('verifies a fresh token for the same stop only', () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    const tok = ackToken(secret, 'stop-1', exp);
    expect(verifyAckToken(secret, 'stop-1', exp, tok)).toBe(true);
    expect(verifyAckToken(secret, 'stop-2', exp, tok)).toBe(false);
    expect(verifyAckToken(secret, 'stop-1', exp + 1, tok)).toBe(false);
    expect(verifyAckToken('other', 'stop-1', exp, tok)).toBe(false);
    expect(verifyAckToken(undefined, 'stop-1', exp, tok)).toBe(false);
  });
  it('rejects expired tokens', () => {
    const exp = Math.floor(Date.now() / 1000) - 1;
    expect(verifyAckToken(secret, 'stop-1', exp, ackToken(secret, 'stop-1', exp))).toBe(false);
  });
});

describe('route traffic', () => {
  it('maps Google speed readings to congested spans (index 0 omitted by proto3)', () => {
    expect(speedSpans([{ endPolylinePointIndex: 5, speed: 'SLOW' }, { startPolylinePointIndex: 5, endPolylinePointIndex: 9, speed: 'NORMAL' }, { startPolylinePointIndex: 9, endPolylinePointIndex: 12, speed: 'TRAFFIC_JAM' }])).toEqual([
      [0, 5, 1],
      [9, 12, 2],
    ]);
  });

  it('re-bases leg spans onto the joined polyline and merges overlaps', () => {
    const b = new PolylineBuilder();
    const p = (i: number) => ({ lat: 0, lng: i / 1000 });
    b.addLeg({ distanceMeters: 1, durationSeconds: 1, polyline: [p(0), p(1), p(2), p(3)], traffic: [[1, 3, 1]] });
    // the second leg starts at the first leg's end point (duplicate junction is dropped)
    b.addLeg({ distanceMeters: 1, durationSeconds: 1, polyline: [p(3), p(4), p(5)], traffic: [[0, 1, 1], [1, 2, 2]] });
    expect(b.points).toHaveLength(6);
    expect(b.traffic()).toEqual([
      [1, 4, 1],
      [4, 5, 2],
    ]);
  });
});

it('directory partition key constant is stable', () => {
  expect(DIRECTORY_PUBLIC).toBe('PUBLIC');
});
