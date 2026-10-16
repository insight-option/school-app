/* eslint-disable no-console */
/**
 * Smoke test against the deployed sandbox:
 *   1. signs in as each demo role – accounts with a temporary password must come back with the
 *      forced "set new password" step (we do NOT complete it, so the demo logins stay valid);
 *      permanent accounts must land in the right Cognito group and run one query;
 *   2. as the driver, runs a whole trip through the Lambdas: startTrip → computeTripRoute →
 *      alarmStudent → setStopStatus(BOARDED) → endTrip (set SMOKE_TRIP=0 to skip).
 * Exit code 1 on any failure.
 *
 *   npm run smoke
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { signOut } from 'aws-amplify/auth';
import { currentGroups, dataClient, loadOutputs, must, signInAs } from './lib';

type Demo = { admin: { id: string; password: string }; teacher: { id: string; temporaryPassword: string }; driver: { id: string; password: string }; student: { id: string; temporaryPassword: string } };

const results: { step: string; ok: boolean; detail: string }[] = [];
const record = (step: string, ok: boolean, detail: string) => {
  results.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step} – ${detail}`);
};

async function main() {
  const outputs = loadOutputs();
  const path = resolve(process.cwd(), 'seed-output.json');
  const demo: Demo = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as Demo)
    : { admin: { id: 'ADMIN-01', password: 'Admin#2026' }, teacher: { id: 'T-1001', temporaryPassword: 'Welcome#2026' }, driver: { id: 'BUS-01', password: 'Driver#2026' }, student: { id: 'S-1001', temporaryPassword: 'Welcome#2026' } };
  const schoolId = outputs.custom?.schoolId ?? 'default';
  const client = dataClient();

  // ── permanent accounts: sign in, check group, run a query ──
  const permanent = async (role: string, id: string, password: string, group: string, query: () => Promise<string>) => {
    try {
      const res = await signInAs(id, password);
      if (!res.ok) throw new Error(`sign-in step ${res.step}`);
      const groups = await currentGroups();
      if (!groups.includes(group)) throw new Error(`expected group ${group}, got ${groups.join(',')}`);
      record(`${role} sign-in`, true, `group ${group} · ${await query()}`);
    } catch (e) {
      record(`${role} sign-in`, false, (e as Error).message);
    } finally {
      await signOut().catch(() => undefined);
    }
  };
  // ── temporary-password accounts: Cognito must demand a new password ──
  const forcedChange = async (role: string, id: string, temporaryPassword: string) => {
    try {
      const res = await signInAs(id, temporaryPassword);
      if (res.step === 'NEW_PASSWORD') record(`${role} first login`, true, 'forced password change requested (CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED)');
      else record(`${role} first login`, false, `unexpected step ${res.step}`);
    } catch (e) {
      record(`${role} first login`, false, (e as Error).message);
    } finally {
      await signOut().catch(() => undefined);
    }
  };

  await permanent('ADMIN', demo.admin.id, demo.admin.password, 'ADMIN', async () => {
    const r = await client.models.Profile.listProfilesByRole({ role: 'STUDENT' }, { limit: 50 });
    return `${r.data.length} students visible`;
  });
  await forcedChange('TEACHER', demo.teacher.id, demo.teacher.temporaryPassword);
  await forcedChange('STUDENT', demo.student.id, demo.student.temporaryPassword);
  await permanent('DRIVER', demo.driver.id, demo.driver.password, 'DRIVER', async () => {
    const r = await client.models.Bus.get({ busId: demo.driver.id });
    return r.data ? `bus ${r.data.plate}, ${r.data.studentCount} students` : 'bus not found';
  });

  // ── trip lifecycle as the driver ──
  if (process.env.SMOKE_TRIP !== '0') {
    try {
      const res = await signInAs(demo.driver.id, demo.driver.password);
      if (!res.ok) throw new Error(`driver sign-in ${res.step}`);
      const settings = await client.models.SchoolSettings.get({ schoolId });
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: settings.data?.timezone ?? 'UTC' }).format(new Date());
      const existing = (await client.models.Trip.listTripsByBusAndDate({ busId: demo.driver.id, date: { eq: today } }, { limit: 10 })).data.find((t) => t.status === 'ACTIVE');
      if (existing) await client.mutations.endTrip({ tripId: existing.id });

      const trip = must(await client.mutations.startTrip({ busId: demo.driver.id, type: 'MORNING_PICKUP' }), 'startTrip');
      let metaRaw: unknown = trip.routeMeta;
      for (let i = 0; i < 3 && typeof metaRaw === 'string'; i++) metaRaw = JSON.parse(metaRaw);
      const meta = (metaRaw as Record<string, unknown> | null) ?? {};
      record('startTrip', trip.status === 'ACTIVE', `trip ${trip.id} · ${trip.stopCount} stops · route ${String(meta.source)} (${String(meta.stopCount)} routed, ${String(meta.durationSeconds)} s)`);

      const stops = (await client.models.TripStop.listStopsByTrip({ tripId: trip.id }, { limit: 100 })).data;
      const absent = stops.filter((s) => s.status === 'ABSENT').length;
      const pending = stops.filter((s) => s.status === 'PENDING').sort((a, b) => a.order - b.order);
      record('stops created', stops.length > 0 && pending.length > 0, `${stops.length} stops, ${pending.length} pending, ${absent} absent (not going)`);

      const recomputed = must(await client.mutations.computeTripRoute({ tripId: trip.id }), 'computeTripRoute');
      record('computeTripRoute', !!recomputed.routePolyline, `polyline ${recomputed.routePolyline?.length ?? 0} chars (rate-limited cache allowed)`);

      const target = pending[0];
      const alarmed = must(await client.mutations.alarmStudent({ tripStopId: target.id }), 'alarmStudent');
      record('alarmStudent', alarmed.status === 'ALARMED', `${alarmed.studentName} → ${alarmed.status}, alarmCount ${alarmed.alarmCount} (repeat loop started in Step Functions)`);

      const boarded = must(await client.mutations.setStopStatus({ tripStopId: target.id, status: 'BOARDED' }), 'setStopStatus');
      record('setStopStatus BOARDED', boarded.status === 'BOARDED' && !!boarded.boardedAt, `boardedAt ${boarded.boardedAt}`);

      const ended = must(await client.mutations.endTrip({ tripId: trip.id }), 'endTrip');
      record('endTrip', ended.status === 'COMPLETED', `endedAt ${ended.endedAt}`);
    } catch (e) {
      record('trip lifecycle', false, (e as Error).message);
    } finally {
      await signOut().catch(() => undefined);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
