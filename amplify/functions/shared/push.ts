import type { DataClient } from './data';
import { listAll, mapLimit } from './data';

/**
 * Expo Push API client (https://docs.expo.dev/push-notifications/sending-notifications/).
 * Implemented with fetch so the Lambda stays on Node 20 and needs no extra dependency.
 */
export type ExpoPushMessage = {
  to: string | string[];
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: 'default' | string | null;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
  badge?: number;
  ttl?: number;
  expiration?: number;
  categoryId?: string;
  mutableContent?: boolean;
  interruptionLevel?: 'active' | 'critical' | 'passive' | 'time-sensitive';
  subtitle?: string;
};

type Ticket = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[.+\]$/.test(token);
}

/** Send messages in chunks of 100; returns the tokens Expo reports as DeviceNotRegistered. */
export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<{ sent: number; invalidTokens: string[] }> {
  const flat = messages.filter((m) => (Array.isArray(m.to) ? m.to.length > 0 : !!m.to));
  const invalidTokens: string[] = [];
  let sent = 0;
  for (let i = 0; i < flat.length; i += 100) {
    const chunk = flat.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'accept-encoding': 'gzip, deflate' },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        console.error('expo push http error', res.status, await res.text());
        continue;
      }
      const json = (await res.json()) as { data?: Ticket[] };
      const tickets = json.data ?? [];
      tickets.forEach((t, idx) => {
        if (t.status === 'ok') sent++;
        else if (t.details?.error === 'DeviceNotRegistered') {
          const to = chunk[idx]?.to;
          if (typeof to === 'string') invalidTokens.push(to);
          else if (Array.isArray(to)) invalidTokens.push(...to);
        } else console.warn('expo push ticket error', t.message, t.details);
      });
    } catch (e) {
      console.error('expo push failed', e);
    }
  }
  return { sent, invalidTokens };
}

export type PushPayload = Omit<ExpoPushMessage, 'to'>;

/** Load every device of the given users and push `payload` to all of them. Cleans up dead tokens. */
export async function pushToUsers(client: DataClient, userIds: string[], payload: PushPayload): Promise<number> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (!unique.length) return 0;
  const devicesPerUser = await mapLimit(unique, 8, (userId) =>
    listAll((nextToken) => client.models.Device.listDevicesByUser({ userId }, { limit: 50, nextToken })),
  );
  const devices = devicesPerUser.flat().filter((d) => isExpoPushToken(d.expoPushToken));
  if (!devices.length) return 0;
  const messages: ExpoPushMessage[] = devices.map((d) => ({ ...payload, to: d.expoPushToken }));
  const { sent, invalidTokens } = await sendExpoPush(messages);
  if (invalidTokens.length) {
    const dead = devices.filter((d) => invalidTokens.includes(d.expoPushToken));
    await mapLimit(dead, 5, (d) => client.models.Device.delete({ id: d.id }));
  }
  return sent;
}

export const ALARM_CHANNEL_ID = 'bus-alarm';
export const ALARM_SOUND = 'alarm.wav';

export function alarmPushPayload(data: Record<string, unknown>, text: { title: string; body: string }): PushPayload {
  return {
    title: text.title,
    body: text.body,
    data,
    sound: ALARM_SOUND,
    priority: 'high',
    channelId: ALARM_CHANNEL_ID,
    interruptionLevel: 'time-sensitive',
    ttl: 120,
    mutableContent: true,
  };
}
