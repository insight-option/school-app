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

import { remainingPathFrom, trafficAhead } from '../src/lib/geo';

const route = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 0.01 },
  { lat: 0, lng: 0.02 },
  { lat: 0, lng: 0.03 },
  { lat: 0, lng: 0.04 },
];

test('trafficAhead drops spans behind the bus and clips the one it is in', () => {
  const bus = { lat: 0.0001, lng: 0.0201 };
  const { startIndex } = remainingPathFrom(bus, route);
  expect(startIndex).toBe(2);
  const spans: [number, number, number][] = [
    [0, 1, 2], // behind
    [1, 3, 1], // bus inside → starts at the bus
    [3, 4, 2], // ahead
  ];
  const segs = trafficAhead(route, spans, startIndex, bus);
  expect(segs).toHaveLength(2);
  expect(segs[0].points[0]).toEqual(bus);
  expect(segs[0].points[segs[0].points.length - 1]).toEqual(route[3]);
  expect(segs[0].level).toBe(1);
  expect(segs[1].points).toEqual([route[3], route[4]]);
});

test('trafficAhead ignores malformed spans', () => {
  expect(trafficAhead(route, [[3, 2, 1], [0, 99, 1], [0, 1, 7]], -1, null)).toEqual([]);
});
