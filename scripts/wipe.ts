/**
 * Wipes a deployment back to an empty school. Every table row, every Cognito account and every
 * media object is removed, except:
 *   - SchoolSettings and the branding files under `school/` (edit them in Office → Settings),
 *   - the accounts listed in KEEP_USERS (default `ADMIN-01,T-1001,BUS-01`), which are reset:
 *     no class, no bus, no avatar, active. A kept DRIVER keeps its (emptied) bus, live-position
 *     row and bus group chat; every other conversation is removed.
 *
 *   AWS_PROFILE=school npm run wipe -- --yes                     # backend in amplify_outputs.json
 *   AMPLIFY_OUTPUTS=./hosting/amplify_outputs.json npm run wipe -- --yes
 *   KEEP_USERS=ADMIN-01 npm run wipe -- --yes                    # keep only the office account
 *
 * The script talks to DynamoDB, Cognito and S3 directly with your AWS credentials, so it does not
 * depend on the app's auth rules or on the Lambdas. It is destructive and cannot be undone.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DescribeTableCommand, DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { AdminDeleteUserCommand, CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const MODELS = [
  'SchoolSettings',
  'Profile',
  'Device',
  'Class',
  'Bus',
  'BusLocation',
  'StudentDayStatus',
  'Trip',
  'TripStop',
  'Conversation',
  'ConversationMember',
  'Message',
  'MessageReport',
  'Feedback',
  'Broadcast',
  'Notification',
  'Course',
  'CourseLesson',
  'CourseEnrollment',
  'AuditLog',
  'ImportJob',
] as const;

type Item = Record<string, unknown>;
const OFFICE = 'OFFICE';
const KEEP_PREFIXES = ['school/'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadOutputs() {
  const path = resolve(process.cwd(), process.env.AMPLIFY_OUTPUTS ?? 'amplify_outputs.json');
  if (!existsSync(path)) {
    console.error(`${path} not found. Set AMPLIFY_OUTPUTS to the backend's amplify_outputs.json.`);
    process.exit(1);
  }
  const o = JSON.parse(readFileSync(path, 'utf8')) as {
    auth: { user_pool_id: string; aws_region: string };
    data: { url: string; aws_region: string };
    storage?: { bucket_name: string; aws_region: string };
  };
  console.log(`▸ Using ${path}`);
  return o;
}

/** Table names are `<Model>-<AppSync api id>-NONE`; the api id is not the GraphQL host name. */
async function resolveApiId(ddb: DynamoDBClient, region: string, graphqlUrl: string): Promise<string> {
  if (process.env.AMPLIFY_API_ID) return process.env.AMPLIFY_API_ID;
  try {
    const out = execFileSync('aws', ['appsync', 'list-graphql-apis', '--region', region, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const apis = JSON.parse(out).graphqlApis as { apiId: string; uris?: { GRAPHQL?: string } }[];
    const hit = apis.find((a) => a.uris?.GRAPHQL === graphqlUrl);
    if (hit) return hit.apiId;
  } catch {
    /* no AWS CLI – fall through */
  }
  const names: string[] = [];
  let token: string | undefined;
  do {
    const res = await ddb.send(new ListTablesCommand({ ExclusiveStartTableName: token, Limit: 100 }));
    names.push(...(res.TableNames ?? []));
    token = res.LastEvaluatedTableName;
  } while (token);
  const ids = names.map((n) => /^SchoolSettings-([a-z0-9]+)-NONE$/.exec(n)?.[1]).filter((x): x is string => !!x);
  if (ids.length === 1) return ids[0];
  console.error(`Cannot tell which tables belong to ${graphqlUrl}. Set AMPLIFY_API_ID to one of: ${ids.join(', ') || '(none found)'}`);
  process.exit(1);
}

async function scanAll(doc: DynamoDBDocumentClient, table: string): Promise<Item[]> {
  const items: Item[] = [];
  let key: Item | undefined;
  do {
    const res = await doc.send(new ScanCommand({ TableName: table, ExclusiveStartKey: key }));
    items.push(...((res.Items as Item[] | undefined) ?? []));
    key = res.LastEvaluatedKey as Item | undefined;
  } while (key);
  return items;
}

async function batchDelete(doc: DynamoDBDocumentClient, table: string, keys: Item[]): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < keys.length; i += 25) {
    let requests = keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } }));
    for (let attempt = 0; requests.length && attempt < 8; attempt++) {
      const res = await doc.send(new BatchWriteCommand({ RequestItems: { [table]: requests } }));
      const left = (res.UnprocessedItems?.[table] ?? []) as typeof requests;
      deleted += requests.length - left.length;
      requests = left;
      if (requests.length) await sleep(200 * 2 ** attempt);
    }
    if (requests.length) throw new Error(`${table}: ${requests.length} deletes still unprocessed after retries`);
  }
  return deleted;
}

async function main() {
  const yes = process.argv.includes('--yes') || process.env.WIPE_CONFIRM === 'yes';
  const outputs = loadOutputs();
  const region = outputs.data.aws_region ?? outputs.auth.aws_region;
  const keep = new Set(
    (process.env.KEEP_USERS ?? 'ADMIN-01,T-1001,BUS-01')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

  const ddb = new DynamoDBClient({ region });
  const doc = DynamoDBDocumentClient.from(ddb, { marshallOptions: { removeUndefinedValues: true } });
  const cognito = new CognitoIdentityProviderClient({ region: outputs.auth.aws_region });
  const s3 = outputs.storage ? new S3Client({ region: outputs.storage.aws_region ?? region }) : null;
  const apiId = await resolveApiId(ddb, region, outputs.data.url);
  const table = (model: string) => `${model}-${apiId}-NONE`;
  await ddb.send(new DescribeTableCommand({ TableName: table('Profile') })); // fail early if the id is wrong

  console.log(`▸ Target: user pool ${outputs.auth.user_pool_id}, tables *-${apiId}-NONE, bucket ${outputs.storage?.bucket_name ?? '(none)'}`);
  console.log(`▸ Keeping accounts: ${[...keep].join(', ') || '(none)'} – everything else will be deleted.`);
  if (!yes) {
    console.error('Refusing to continue without --yes (or WIPE_CONFIRM=yes). Nothing was changed.');
    process.exit(2);
  }

  // ── 1. Cognito ────────────────────────────────────────────────────────────────
  const users: { username: string; sub: string }[] = [];
  let pageToken: string | undefined;
  do {
    const res = await cognito.send(new ListUsersCommand({ UserPoolId: outputs.auth.user_pool_id, Limit: 60, PaginationToken: pageToken }));
    for (const u of res.Users ?? []) {
      users.push({ username: u.Username!, sub: u.Attributes?.find((a) => a.Name === 'sub')?.Value ?? '' });
    }
    pageToken = res.PaginationToken;
  } while (pageToken);
  const keptUsers = users.filter((u) => keep.has(u.username.toLowerCase()));
  const doomedUsers = users.filter((u) => !keep.has(u.username.toLowerCase()));
  let cognitoDeleted = 0;
  for (const u of doomedUsers) {
    for (let attempt = 0; ; attempt++) {
      try {
        await cognito.send(new AdminDeleteUserCommand({ UserPoolId: outputs.auth.user_pool_id, Username: u.username }));
        cognitoDeleted++;
        break;
      } catch (e) {
        const name = (e as { name?: string }).name;
        if (name === 'UserNotFoundException') break;
        if (name === 'TooManyRequestsException' && attempt < 6) {
          await sleep(300 * 2 ** attempt);
          continue;
        }
        throw e;
      }
    }
  }
  for (const k of keep) if (!keptUsers.some((u) => u.username.toLowerCase() === k)) console.log(`  ! ${k} has no Cognito account – its profile (if any) is removed too`);
  console.log(`▸ Cognito: deleted ${cognitoDeleted}, kept ${keptUsers.map((u) => u.username).join(', ') || '(none)'}`);

  // ── 2. Decide what stays ──────────────────────────────────────────────────────
  const profiles = await scanAll(doc, table('Profile'));
  const keptSubs = new Set(keptUsers.map((u) => u.sub));
  const keptProfiles = profiles.filter((p) => keptSubs.has(String(p.userId)) && keep.has(String(p.username).toLowerCase()));
  const keptUserIds = new Set(keptProfiles.map((p) => String(p.userId)));
  const buses = await scanAll(doc, table('Bus'));
  const keptBusIds = new Set(
    keptProfiles
      .filter((p) => p.role === 'DRIVER' && p.busId && buses.some((b) => b.busId === p.busId))
      .map((p) => String(p.busId)),
  );
  const keptConversationIds = new Set([...keptBusIds].map((b) => `bus_${b}`));

  const keepRow = (model: string, it: Item): boolean => {
    switch (model) {
      case 'SchoolSettings':
        return true;
      case 'Profile':
        return keptUserIds.has(String(it.userId));
      case 'Bus':
      case 'BusLocation':
        return keptBusIds.has(String(it.busId));
      case 'Conversation':
        return keptConversationIds.has(String(it.id));
      case 'ConversationMember':
        return keptConversationIds.has(String(it.conversationId)) && (keptUserIds.has(String(it.userId)) || it.userId === OFFICE);
      default:
        return false;
    }
  };

  // ── 3. Tables ─────────────────────────────────────────────────────────────────
  const summary: { table: string; deleted: number; kept: number }[] = [];
  const keptMembersByConversation = new Map<string, number>();
  for (const model of MODELS) {
    const name = table(model);
    const desc = await ddb.send(new DescribeTableCommand({ TableName: name }));
    const keyAttrs = (desc.Table?.KeySchema ?? []).map((k) => k.AttributeName!);
    const items = await scanAll(doc, name);
    const doomed = items.filter((it) => !keepRow(model, it));
    const kept = items.length - doomed.length;
    if (model === 'ConversationMember') {
      for (const it of items) if (keepRow(model, it)) keptMembersByConversation.set(String(it.conversationId), (keptMembersByConversation.get(String(it.conversationId)) ?? 0) + 1);
    }
    const deleted = await batchDelete(
      doc,
      name,
      doomed.map((it) => Object.fromEntries(keyAttrs.map((k) => [k, it[k]]))),
    );
    summary.push({ table: model, deleted, kept });
  }

  // ── 4. Reset what stays ───────────────────────────────────────────────────────
  const now = new Date().toISOString();
  for (const p of keptProfiles) {
    const keepsBus = p.role === 'DRIVER' && keptBusIds.has(String(p.busId));
    const remove = ['classId', 'className', 'avatarKey', ...(keepsBus ? [] : ['busId', 'busName'])];
    await doc.send(
      new UpdateCommand({
        TableName: table('Profile'),
        Key: { userId: p.userId },
        UpdateExpression: `SET isActive = :t, classIds = :empty, updatedAt = :now REMOVE ${remove.join(', ')}`,
        ExpressionAttributeValues: { ':t': true, ':empty': [], ':now': now },
      }),
    );
    if (keepsBus) {
      await doc.send(
        new UpdateCommand({
          TableName: table('Bus'),
          Key: { busId: p.busId },
          UpdateExpression: 'SET studentCount = :z, isActive = :t, driverUserId = :d, updatedAt = :now',
          ExpressionAttributeValues: { ':z': 0, ':t': true, ':d': p.userId, ':now': now },
        }),
      );
    }
  }
  for (const id of keptConversationIds) {
    await doc.send(
      new UpdateCommand({
        TableName: table('Conversation'),
        Key: { id },
        UpdateExpression: 'SET memberCount = :m, lastMessageAt = :now, updatedAt = :now REMOVE lastMessageText, lastMessageSenderName, lastMessageType',
        ExpressionAttributeValues: { ':m': keptMembersByConversation.get(id) ?? 0, ':now': now },
      }),
    );
    for (const userId of [...keptUserIds, OFFICE]) {
      await doc
        .send(
          new UpdateCommand({
            TableName: table('ConversationMember'),
            Key: { conversationId: id, userId },
            ConditionExpression: 'attribute_exists(conversationId)',
            UpdateExpression: 'SET unreadCount = :z, isViewing = :f, lastMessageAt = :now, updatedAt = :now REMOVE lastMessageText, lastMessageSenderName, lastMessageType, lastReadAt',
            ExpressionAttributeValues: { ':z': 0, ':f': false, ':now': now },
          }),
        )
        .catch((e: { name?: string }) => {
          if (e.name !== 'ConditionalCheckFailedException') throw e;
        });
    }
  }

  // ── 5. Media ──────────────────────────────────────────────────────────────────
  let objectsDeleted = 0;
  if (s3 && outputs.storage) {
    let token: string | undefined;
    do {
      const res = await s3.send(new ListObjectsV2Command({ Bucket: outputs.storage.bucket_name, ContinuationToken: token }));
      const doomed = (res.Contents ?? []).map((o) => o.Key!).filter((k) => !KEEP_PREFIXES.some((p) => k.startsWith(p)));
      for (let i = 0; i < doomed.length; i += 1000) {
        await s3.send(new DeleteObjectsCommand({ Bucket: outputs.storage.bucket_name, Delete: { Objects: doomed.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true } }));
        objectsDeleted += Math.min(1000, doomed.length - i);
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
  }

  // ── 6. Report ─────────────────────────────────────────────────────────────────
  console.log('\n▸ Tables');
  for (const row of summary) console.log(`  ${row.table.padEnd(20)} deleted ${String(row.deleted).padStart(5)}   kept ${row.kept}`);
  console.log(`▸ Media objects deleted: ${objectsDeleted} (kept prefixes: ${KEEP_PREFIXES.join(', ')})`);
  console.log(`▸ Remaining accounts: ${keptProfiles.map((p) => `${p.username} (${p.role})`).join(', ') || '(none)'}`);
  if (keptBusIds.size) console.log(`▸ Remaining buses: ${[...keptBusIds].join(', ')} (no students, no trips)`);
  console.log('\nDone. Sign in to the office and create classes, buses, teachers and students from scratch.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
