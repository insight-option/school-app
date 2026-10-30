import { createHmac, timingSafeEqual } from 'node:crypto';

/** How long the "I'm coming" token inside an alarm push stays valid. */
export const ACK_TTL_SECONDS = 2 * 3600;

/** HMAC over (stop, expiry): lets a signed-out phone acknowledge exactly this alarm, for a limited time. */
export function ackToken(secret: string, tripStopId: string, expires: number): string {
  return createHmac('sha256', secret).update(`${tripStopId}.${expires}`).digest('base64url');
}

export function verifyAckToken(secret: string | undefined, tripStopId: string, expires: number, token: string, nowMs = Date.now()): boolean {
  if (!secret || !token || !Number.isInteger(expires) || expires * 1000 < nowMs) return false;
  const expected = Buffer.from(ackToken(secret, tripStopId, expires));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
