import type { Schema } from '../../data/resource';
import type { DataClient } from './data';
import { listAll, mapLimit, nowIso } from './data';
import { pushToUsers, type PushPayload } from './push';

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
  const userIds = Array.from(new Set(opts.userIds.filter((u) => u && u !== 'OFFICE')));
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

/** All active admins of a school (the "office"). */
export async function getAdminUserIds(client: DataClient): Promise<string[]> {
  const admins = await listAll((nextToken) => client.models.Profile.listProfilesByRole({ role: 'ADMIN' }, { limit: 100, nextToken }));
  return admins.filter((p) => p.isActive !== false).map((p) => p.userId);
}
