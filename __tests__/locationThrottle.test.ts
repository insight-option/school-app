import { gpsQuality, shouldPublish, type GpsSample } from '../src/lib/rules/location';

const sample = (over: Partial<GpsSample> = {}): GpsSample => ({ lat: 24.7, lng: 46.7, heading: 0, speed: 5, accuracy: 10, ts: 1_000, ...over });

describe('bus location publishing throttle', () => {
  it('publishes the first fix', () => {
    expect(shouldPublish(sample(), null, 10_000)).toBe(true);
  });

  it('skips inaccurate fixes (> 50 m)', () => {
    expect(shouldPublish(sample({ accuracy: 80 }), null, 10_000)).toBe(false);
  });

  it('publishes after 4 seconds even without movement', () => {
    const last = { ts: 10_000, lat: 24.7, lng: 46.7 };
    expect(shouldPublish(sample(), last, 13_000)).toBe(false);
    expect(shouldPublish(sample(), last, 14_000)).toBe(true);
  });

  it('publishes after 15 m even within the interval', () => {
    const last = { ts: 10_000, lat: 24.7, lng: 46.7 };
    expect(shouldPublish(sample({ lat: 24.70005 }), last, 11_000)).toBe(false); // ~5.5 m
    expect(shouldPublish(sample({ lat: 24.7002 }), last, 11_000)).toBe(true); // ~22 m
  });

  it('classifies gps quality', () => {
    expect(gpsQuality(null)).toBe('off');
    expect(gpsQuality(8)).toBe('good');
    expect(gpsQuality(30)).toBe('fair');
    expect(gpsQuality(120)).toBe('poor');
  });
});
