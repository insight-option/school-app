import { pathLengthMeters, remainingPath } from '../src/lib/geo';

const line = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 0.01 },
  { lat: 0, lng: 0.02 },
  { lat: 0, lng: 0.03 },
];

test('remainingPath starts at the bus and continues from the nearest vertex', () => {
  const bus = { lat: 0.0001, lng: 0.0101 };
  const r = remainingPath(bus, line);
  expect(r[0]).toEqual(bus);
  expect(r).toHaveLength(3);
  expect(r[r.length - 1]).toEqual(line[3]);
});

test('remainingPath keeps the whole line when the bus is far off route', () => {
  expect(remainingPath({ lat: 1, lng: 1 }, line)).toBe(line);
});

test('pathLengthMeters sums the segments', () => {
  const m = pathLengthMeters(line);
  expect(m).toBeGreaterThan(3300);
  expect(m).toBeLessThan(3400);
});
