/**
 * One-time data repair after the multi-school upgrade: rows written by older app/APK versions may
 * lack `schoolId`, which hides them from students and drivers (member reads are school-scoped):
 *   BusLocation ← Bus.schoolId, TripStop ← Trip.schoolId, CourseLesson / CourseEnrollment ← Course.schoolId.
 * Uses DynamoDB directly (rows without schoolId are invisible to the GraphQL API).
 *
 *   AWS_PROFILE=school DATA_API_ID=<api id> npx tsx scripts/repair-school-ids.ts [--dry-run]
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const API_ID = process.env.DATA_API_ID ?? 'jaf5ci4r5zap3nn24upr27k5me';
const dry = process.argv.includes('--dry-run');
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' }));
const table = (m: string) => `${m}-${API_ID}-NONE`;

async function scanMissing(model: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(new ScanCommand({ TableName: table(model), FilterExpression: 'attribute_not_exists(schoolId) OR schoolId = :e', ExpressionAttributeValues: { ':e': '' }, ExclusiveStartKey: start }));
    out.push(...((page.Items ?? []) as Record<string, unknown>[]));
    start = page.LastEvaluatedKey;
  } while (start);
  return out;
}

const parentCache = new Map<string, string | null>();
async function parentSchool(model: string, key: Record<string, unknown>): Promise<string | null> {
  const id = `${model}:${JSON.stringify(key)}`;
  if (parentCache.has(id)) return parentCache.get(id)!;
  const res = await ddb.send(new GetCommand({ TableName: table(model), Key: key }));
  const v = (res.Item?.schoolId as string | undefined) || null;
  parentCache.set(id, v);
  return v;
}

async function repair(model: string, key: (row: Record<string, unknown>) => Record<string, unknown>, parent: (row: Record<string, unknown>) => Promise<string | null>) {
  const rows = await scanMissing(model);
  let fixed = 0;
  for (const row of rows) {
    const schoolId = await parent(row);
    if (!schoolId) {
      console.log(`  ${model} ${JSON.stringify(key(row))}: parent has no school – skipped`);
      continue;
    }
    if (!dry) await ddb.send(new UpdateCommand({ TableName: table(model), Key: key(row), UpdateExpression: 'SET schoolId = :s', ExpressionAttributeValues: { ':s': schoolId } }));
    fixed++;
  }
  console.log(`${model}: ${rows.length} without school, ${fixed} ${dry ? 'would be ' : ''}fixed`);
}

async function main() {
  await repair('BusLocation', (r) => ({ busId: r.busId }), (r) => parentSchool('Bus', { busId: r.busId }));
  await repair('TripStop', (r) => ({ id: r.id }), (r) => parentSchool('Trip', { id: r.tripId }));
  await repair('CourseLesson', (r) => ({ id: r.id }), (r) => parentSchool('Course', { id: r.courseId }));
  await repair('CourseEnrollment', (r) => ({ id: r.id }), (r) => parentSchool('Course', { id: r.courseId }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
