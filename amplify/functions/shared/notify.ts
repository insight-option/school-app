import type { Schema } from '../../data/resource';
import type { DataClient } from './data';
import { listAll, mapLimit, nowIso } from './data';
import { isExpoPushToken, pushToUsers, sendExpoPush, type ExpoPushMessage, type PushPayload } from './push';
import { isOfficeSeat } from './tenancy';

export type NotificationType = Schema['Notification']['type']['type'];

/** Create inbox Notification rows for users and (optionally) push to their devices. */
export async function notifyUsers(
  client: DataClient,
  opts: {
    schoolId: string;
    userIds: string[];
    type: NotificationType;
    title: string;
    body?: string;
    data?: Record<string, unknown>;
    push?: boolean | PushPayload;
    createInbox?: boolean;
  },
): Promise<{ inbox: number; pushed: number }> {
  const userIds = Array.from(new Set(opts.userIds.filter((u) => u && !isOfficeSeat(u))));
  if (!userIds.length) return { inbox: 0, pushed: 0 };
  let inbox = 0;
  if (opts.createInbox !== false) {
    await mapLimit(userIds, 10, async (userId) => {
      const res = await client.models.Notification.create({
        userId,
        schoolId: opts.schoolId,
        type: opts.type,
        title: opts.title,
        body: opts.body,
        data: opts.data ? JSON.stringify(opts.data) : undefined,
        read: false,
        sentAt: nowIso(),
      });
      if (!res.errors?.length) inbox++;
    });
  }
  let pushed = 0;
  if (opts.push) {
    const payload: PushPayload =
      typeof opts.push === 'object'
        ? opts.push
        : { title: opts.title, body: opts.body, data: { type: opts.type, ...(opts.data ?? {}) }, sound: 'default', priority: 'high' };
    pushed = await pushToUsers(client, userIds, payload);
  }
  return { inbox, pushed };
}

export type PersonalNotice = { userId: string; title: string; body?: string; data?: Record<string, unknown> };

/**
 * One personalised notice per user (own language, own ETA …): inbox rows plus a single batched Expo
 * push for every device, so a trip start reaches a full bus within one request to Expo.
 */
export async function notifyEach(client: DataClient, opts: { schoolId: string; type: NotificationType; notices: PersonalNotice[]; channelId?: string }): Promise<{ inbox: number; pushed: number }> {
  const notices = opts.notices.filter((n) => n.userId && !isOfficeSeat(n.userId));
  if (!notices.length) return { inbox: 0, pushed: 0 };
  const devices = await mapLimit(notices, 8, (n) => listAll((nextToken) => client.models.Device.listDevicesByUser({ userId: n.userId }, { limit: 50, nextToken })));
  const messages: ExpoPushMessage[] = [];
  notices.forEach((n, i) => {
    for (const d of devices[i] ?? []) {
      if (!isExpoPushToken(d.expoPushToken)) continue;
      messages.push({ to: d.expoPushToken, title: n.title, body: n.body, data: { type: opts.type, ...(n.data ?? {}) }, sound: 'default', priority: 'high', ...(opts.channelId ? { channelId: opts.channelId } : {}) });
    }
  });
  // Push first – it is what the rider is waiting for; the inbox rows follow.
  const [{ sent, invalidTokens }, inbox] = await Promise.all([
    messages.length ? sendExpoPush(messages) : Promise.resolve({ sent: 0, invalidTokens: [] as string[] }),
    mapLimit(notices, 10, async (n) => {
      const res = await client.models.Notification.create({
        userId: n.userId,
        schoolId: opts.schoolId,
        type: opts.type,
        title: n.title,
        body: n.body,
        data: n.data ? JSON.stringify(n.data) : undefined,
        read: false,
        sentAt: nowIso(),
      });
      return res.errors?.length ? 0 : 1;
    }),
  ]);
  if (invalidTokens.length) {
    const dead = devices.flat().filter((d) => invalidTokens.includes(d.expoPushToken));
    await mapLimit(dead, 5, (d) => client.models.Device.delete({ id: d.id }));
  }
  return { inbox: inbox.reduce<number>((a, b) => a + b, 0), pushed: sent };
}

/** All active office admins of one school. */
export async function getAdminUserIds(client: DataClient, schoolId: string): Promise<string[]> {
  if (!schoolId) return [];
  const admins = await listAll((nextToken) =>
    client.models.Profile.listProfilesBySchoolAndRole({ schoolId, role: { eq: 'ADMIN' } }, { limit: 100, nextToken }),
  );
  return admins.filter((p) => p.isActive !== false).map((p) => p.userId);
}
