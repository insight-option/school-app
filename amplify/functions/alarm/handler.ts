import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import type { Schema } from '../../data/resource';
import { getDataClient, getSettings, nowIso, type DataClient, type DataEnv, unwrap } from '../shared/data';
import { t } from '../shared/i18n';
import { notifyUsers } from '../shared/notify';
import { alarmPushPayload, pushToUsers } from '../shared/push';
import { HandlerError, opName, requireIdentity, type AppSyncEvent, type Caller } from '../shared/types';

type Env = DataEnv & { ALARM_STATE_MACHINE_ARN?: string };
const env = process.env as unknown as Env;
const sfn = new SFNClient({});

type TripStop = Schema['TripStop']['type'];

/** Payload exchanged with the Step Functions loop (Wait → invoke → Choice). */
export type AlarmRepeatEvent = {
  action: 'ALARM_REPEAT';
  tripStopId: string;
  attempt: number;
  maxRepeats: number;
  waitSeconds: number;
  continue?: boolean;
};

const ALARM_RATE_LIMIT_MS = 15_000;

async function alarmContext(client: DataClient, stop: TripStop) {
  const trip = await client.models.Trip.get({ id: stop.tripId });
  const [student, settings] = await Promise.all([
    client.models.Profile.get({ userId: stop.studentId }),
    trip.data ? getSettings(client, trip.data.schoolId) : Promise.resolve(null),
  ]);
  return { trip: trip.data, student: student.data, settings };
}

function payloadFor(stop: TripStop, ctx: Awaited<ReturnType<typeof alarmContext>>) {
  const s = t(ctx.student?.language);
  return alarmPushPayload(
    {
      type: 'ALARM',
      tripStopId: stop.id,
      tripId: stop.tripId,
      busId: stop.busId,
      driverName: ctx.trip?.driverName ?? '',
      plate: ctx.trip?.busPlate ?? '',
      etaSeconds: stop.etaSeconds ?? null,
    },
    { title: s.alarmTitle, body: s.alarmBody },
  );
}

async function alarmStudent(client: DataClient, caller: Caller, args: { tripStopId: string }): Promise<TripStop> {
  const stop = unwrap(await client.models.TripStop.get({ id: args.tripStopId }), 'TripStop.get');
  const ctx = await alarmContext(client, stop);
  if (!ctx.trip) throw new HandlerError('Trip not found', 'NOT_FOUND');
  if (!caller.isAdmin) {
    const profile = await client.models.Profile.get({ userId: caller.sub });
    if (!profile.data || profile.data.role !== 'DRIVER' || profile.data.busId !== ctx.trip.busId) {
      throw new HandlerError('Only the driver of this bus can alarm', 'FORBIDDEN');
    }
  }
  if (ctx.trip.status !== 'ACTIVE') throw new HandlerError('Trip is not active', 'CONFLICT');
  if (['BOARDED', 'DROPPED', 'ABSENT'].includes(stop.status)) throw new HandlerError(`Cannot alarm a stop with status ${stop.status}`, 'CONFLICT');
  if (stop.alarmedAt && Date.now() - Date.parse(stop.alarmedAt) < ALARM_RATE_LIMIT_MS) {
    throw new HandlerError('Please wait a few seconds before alarming again', 'RATE_LIMITED');
  }

  const now = nowIso();
  const updated = unwrap(
    await client.models.TripStop.update({ id: stop.id, status: 'ALARMED', alarmedAt: now, alarmCount: (stop.alarmCount ?? 0) + 1, acknowledgedAt: null }),
    'TripStop.update',
  );
  const s = t(ctx.student?.language);
  await notifyUsers(client, {
    schoolId: ctx.trip.schoolId,
    userIds: [stop.studentId],
    type: 'ALARM',
    title: s.alarmTitle,
    body: s.alarmBody,
    data: { tripStopId: stop.id, tripId: stop.tripId },
    push: payloadFor(updated, ctx),
  });

  if (env.ALARM_STATE_MACHINE_ARN) {
    const input: AlarmRepeatEvent = {
      action: 'ALARM_REPEAT',
      tripStopId: stop.id,
      attempt: 0,
      maxRepeats: Math.max(0, Math.min(20, ctx.settings?.alarmMaxRepeats ?? 5)),
      waitSeconds: Math.max(5, Math.min(300, ctx.settings?.alarmRepeatSeconds ?? 20)),
    };
    if (input.maxRepeats > 0) {
      try {
        await sfn.send(
          new StartExecutionCommand({
            stateMachineArn: env.ALARM_STATE_MACHINE_ARN,
            name: `alarm-${stop.id}-${Date.now()}`.slice(0, 80),
            input: JSON.stringify(input),
          }),
        );
      } catch (e) {
        console.error('failed to start alarm repeat loop', e);
      }
    }
  }
  return updated;
}

/** Invoked by Step Functions every `waitSeconds` until acknowledged / boarded / max attempts. */
async function alarmRepeat(client: DataClient, event: AlarmRepeatEvent): Promise<AlarmRepeatEvent> {
  const stop = await client.models.TripStop.get({ id: event.tripStopId });
  if (!stop.data || stop.data.status !== 'ALARMED') return { ...event, continue: false };
  const ctx = await alarmContext(client, stop.data);
  if (!ctx.trip || ctx.trip.status !== 'ACTIVE') return { ...event, continue: false };
  const attempt = event.attempt + 1;
  await pushToUsers(client, [stop.data.studentId], payloadFor(stop.data, ctx));
  await client.models.TripStop.update({ id: stop.data.id, alarmCount: (stop.data.alarmCount ?? 0) + 1 });
  return { ...event, attempt, continue: attempt < event.maxRepeats };
}

async function acknowledgeAlarm(client: DataClient, caller: Caller, args: { tripStopId: string }): Promise<TripStop> {
  const stop = unwrap(await client.models.TripStop.get({ id: args.tripStopId }), 'TripStop.get');
  if (!caller.isAdmin && stop.studentId !== caller.sub) throw new HandlerError('Not your stop', 'FORBIDDEN');
  if (stop.status !== 'ALARMED') return stop;
  return unwrap(await client.models.TripStop.update({ id: stop.id, status: 'ACKNOWLEDGED', acknowledgedAt: nowIso() }), 'TripStop.update');
}

async function testAlarm(client: DataClient, caller: Caller) {
  const profile = await client.models.Profile.get({ userId: caller.sub });
  const s = t(profile.data?.language);
  const sent = await pushToUsers(client, [caller.sub], alarmPushPayload({ type: 'TEST_ALARM' }, { title: s.testAlarmTitle, body: s.testAlarmBody }));
  return { ok: sent > 0, count: sent, message: sent > 0 ? undefined : 'No registered devices with a push token' };
}

// ────────────────────────────── entry point ──────────────────────────────
export const handler = async (event: AppSyncEvent<Record<string, unknown>> | AlarmRepeatEvent) => {
  const client = await getDataClient(env);
  if ('action' in event && event.action === 'ALARM_REPEAT') {
    return alarmRepeat(client, event);
  }
  const appsync = event as AppSyncEvent<Record<string, unknown>>;
  const caller = requireIdentity(appsync);
  const args = appsync.arguments as never;
  try {
    switch (opName(appsync)) {
      case 'alarmStudent':
        return await alarmStudent(client, caller, args);
      case 'acknowledgeAlarm':
        return await acknowledgeAlarm(client, caller, args);
      case 'testAlarm':
        return await testAlarm(client, caller);
      default:
        throw new HandlerError(`Unknown operation ${opName(appsync)}`);
    }
  } catch (e) {
    if (e instanceof HandlerError) throw new Error(`[${e.code}] ${e.message}`);
    console.error(e);
    throw e;
  }
};
