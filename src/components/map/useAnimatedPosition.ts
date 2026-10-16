import { useEffect, useRef, useState } from 'react';
import { bearingDegrees, lerpLatLng, type LatLng } from '../../lib/geo';

export type AnimatedPosition = LatLng & { heading: number };

/**
 * Smoothly moves a marker from the previous to the latest reported position over `durationMs`
 * (location updates arrive every ~4 s, so the bus glides instead of jumping).
 */
export function useAnimatedPosition(target: (LatLng & { heading?: number | null }) | null | undefined, durationMs = 3500): AnimatedPosition | null {
  const [pos, setPos] = useState<AnimatedPosition | null>(target ? { lat: target.lat, lng: target.lng, heading: target.heading ?? 0 } : null);
  const current = useRef<AnimatedPosition | null>(pos);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!target) return;
    const from = current.current;
    const heading = target.heading ?? (from ? bearingDegrees(from, target) : 0);
    if (!from) {
      const p = { lat: target.lat, lng: target.lng, heading };
      current.current = p;
      setPos(p);
      return;
    }
    if (Math.abs(from.lat - target.lat) < 1e-7 && Math.abs(from.lng - target.lng) < 1e-7) {
      if (Math.abs(from.heading - heading) > 1) {
        const p = { ...from, heading };
        current.current = p;
        setPos(p);
      }
      return;
    }
    const start = Date.now();
    const startPos = { ...from };
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      const eased = 1 - (1 - t) * (1 - t);
      const p = { ...lerpLatLng(startPos, target, eased), heading };
      current.current = p;
      setPos(p);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target?.lat, target?.lng, target?.heading, durationMs]); // eslint-disable-line react-hooks/exhaustive-deps

  return pos;
}
