import { defineBackend } from '@aws-amplify/backend';
import { ArnFormat, Duration, Fn, Names, Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { adminUsers } from './functions/admin-users/resource';
import { trips } from './functions/trips/resource';
import { alarm } from './functions/alarm/resource';
import { comms } from './functions/comms/resource';
import { platform } from './functions/platform/resource';

const backend = defineBackend({
  auth,
  data,
  storage,
  adminUsers,
  trips,
  alarm,
  comms,
  platform,
});

// ───────────────────────────── Cognito: free-form usernames (school ID) ─────────────────────────────
// Gen 2's `loginWith.email` makes e-mail the username attribute. Removing `UsernameAttributes`
// makes the username a free-form string (the school ID). `email` stays a required, mutable
// attribute used for delivering credentials and password resets.
// NOTE: `UsernameAttributes` is immutable on an existing pool – the first deploy after this change
// replaces the user pool (sandbox: `npx ampx sandbox delete` first if the update is refused).
const { cfnUserPool, cfnUserPoolClient } = backend.auth.resources.cfnResources;
cfnUserPool.addPropertyDeletionOverride('UsernameAttributes');
cfnUserPool.usernameConfiguration = { caseSensitive: false };
cfnUserPool.addPropertyOverride('Policies.PasswordPolicy', {
  MinimumLength: 8,
  RequireLowercase: true,
  RequireUppercase: true,
  RequireNumbers: true,
  RequireSymbols: false,
  TemporaryPasswordValidityDays: 30,
});
// Schools sign themselves up ("Create my school"): self sign-up is on. Teachers, drivers and students
// are still created by their school's office through the admin-users Lambda.
cfnUserPool.addPropertyOverride('AdminCreateUserConfig.AllowAdminCreateUserOnly', false);
// The API trusts `custom:schoolId` / `custom:role` (school isolation, see data/resource.ts), so the app
// client may read them but never write them – only the backend (admin APIs) sets them.
const STANDARD_ATTRIBUTES = [
  'address',
  'birthdate',
  'email',
  'family_name',
  'gender',
  'given_name',
  'locale',
  'middle_name',
  'name',
  'nickname',
  'phone_number',
  'picture',
  'preferred_username',
  'profile',
  'updated_at',
  'website',
  'zoneinfo',
];
cfnUserPoolClient.readAttributes = [...STANDARD_ATTRIBUTES, 'email_verified', 'phone_number_verified', 'custom:role', 'custom:schoolId'];
cfnUserPoolClient.writeAttributes = STANDARD_ATTRIBUTES;
// SRP for real builds; USER_PASSWORD_AUTH lets Expo Go (no Amplify native module) sign in during previews.
cfnUserPoolClient.explicitAuthFlows = ['ALLOW_USER_SRP_AUTH', 'ALLOW_USER_PASSWORD_AUTH', 'ALLOW_CUSTOM_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'];
// Keep tokens short-lived but refresh for a long time so parents stay signed in.
cfnUserPoolClient.refreshTokenValidity = 3650;
cfnUserPoolClient.tokenValidityUnits = { refreshToken: 'days', accessToken: 'minutes', idToken: 'minutes' };
cfnUserPoolClient.accessTokenValidity = 60;
cfnUserPoolClient.idTokenValidity = 60;

// ───────────────────────────── admin-users Lambda: Cognito + SES permissions ─────────────────────────────
// Granting through `defineAuth({ access })` would create an auth ⇄ data stack cycle (the function
// lives in the data stack), so the policy is attached here instead.
const userPool = backend.auth.resources.userPool;
backend.adminUsers.addEnvironment('USER_POOL_ID', userPool.userPoolId);
backend.adminUsers.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: [
      'cognito-idp:AdminCreateUser',
      'cognito-idp:AdminSetUserPassword',
      'cognito-idp:AdminAddUserToGroup',
      'cognito-idp:AdminRemoveUserFromGroup',
      'cognito-idp:AdminDeleteUser',
      'cognito-idp:AdminDisableUser',
      'cognito-idp:AdminEnableUser',
      'cognito-idp:AdminResetUserPassword',
      'cognito-idp:AdminGetUser',
      'cognito-idp:AdminUpdateUserAttributes',
      'cognito-idp:ListUsers',
      // per-school admin groups (school isolation) – created by registerSchool / syncMyAccess
      'cognito-idp:CreateGroup',
      'cognito-idp:DeleteGroup', // rollback of a failed registerSchool
      'cognito-idp:GetGroup',
      'cognito-idp:AdminListGroupsForUser',
    ],
    resources: [userPool.userPoolArn],
  }),
);
backend.adminUsers.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['ses:SendEmail', 'ses:SendRawEmail'],
    resources: ['*'],
  }),
);

// ───────────────────────────── platform Lambda: partners, customers, owner console ─────────────────────────────
backend.platform.addEnvironment('USER_POOL_ID', userPool.userPoolId);
backend.platform.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: [
      'cognito-idp:AdminAddUserToGroup',
      'cognito-idp:AdminRemoveUserFromGroup',
      'cognito-idp:AdminDeleteUser',
      'cognito-idp:AdminDisableUser',
      'cognito-idp:AdminEnableUser',
      'cognito-idp:AdminResetUserPassword',
      'cognito-idp:AdminGetUser',
      'cognito-idp:AdminUpdateUserAttributes',
      'cognito-idp:AdminListGroupsForUser',
      'cognito-idp:ListUsers',
      // per-business admin groups (biz-…) and deleting school / business groups
      'cognito-idp:CreateGroup',
      'cognito-idp:DeleteGroup',
      'cognito-idp:GetGroup',
    ],
    resources: [userPool.userPoolArn],
  }),
);

// ───────────────────────────── alarm: "repeat until acknowledged" Step Functions loop ─────────────────────────────
// Wait(waitSeconds) → invoke alarm Lambda (ALARM_REPEAT) → continue? → Wait … else Succeed.
// The state machine lives in the same stack as the Lambda; the Lambda learns the ARN from a
// deterministic *name* (no resource reference) to avoid a Lambda ⇄ StateMachine cycle.
const alarmStack = Stack.of(backend.alarm.resources.lambda);
const alarmStateMachineName = `school-alarm-repeat-${Names.uniqueId(alarmStack).slice(-12)}`;

const wait = new sfn.Wait(alarmStack, 'AlarmWait', { time: sfn.WaitTime.secondsPath('$.waitSeconds') });
const invoke = new tasks.LambdaInvoke(alarmStack, 'AlarmRepeatInvoke', {
  lambdaFunction: backend.alarm.resources.lambda,
  payloadResponseOnly: true,
  retryOnServiceExceptions: true,
});
const done = new sfn.Succeed(alarmStack, 'AlarmDone');
const shouldContinue = new sfn.Choice(alarmStack, 'AlarmContinue').when(sfn.Condition.booleanEquals('$.continue', true), wait).otherwise(done);
wait.next(invoke).next(shouldContinue);

new sfn.StateMachine(alarmStack, 'AlarmRepeatStateMachine', {
  stateMachineName: alarmStateMachineName,
  definitionBody: sfn.DefinitionBody.fromChainable(wait),
  timeout: Duration.hours(2),
  comment: 'Re-sends the bus alarm push until the student acknowledges, boards, or the max attempts are reached.',
});

const alarmStateMachineArn = alarmStack.formatArn({
  service: 'states',
  resource: 'stateMachine',
  resourceName: alarmStateMachineName,
  arnFormat: ArnFormat.COLON_RESOURCE_NAME,
});
backend.alarm.addEnvironment('ALARM_STATE_MACHINE_ARN', alarmStateMachineArn);
// HMAC key for the "I'm coming" token carried by alarm pushes (acknowledge while signed out). The
// stack id is stable across deploys and never exposed to clients.
backend.alarm.addEnvironment('ALARM_ACK_SECRET', Fn.join('|', [alarmStack.stackId, 'alarm-ack-v1']));
backend.alarm.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['states:StartExecution'],
    resources: [alarmStateMachineArn],
  }),
);

// ───────────────────────────── storage: identity-scoped writes for group roles ─────────────────────────────
// Signed-in users receive their Cognito group's IAM role, which Amplify's `allow.entity` storage rules do
// not cover. Grant each group role write/delete on its own identity folder only (never other people's).
// The policies live in the storage stack (which already depends on auth) to avoid an auth ⇄ storage cycle.
const bucket = backend.storage.resources.bucket;
const storageStack = Stack.of(bucket);
const ownFolder = (prefix: string) => bucket.arnForObjects(`${prefix}/\${cognito-identity.amazonaws.com:sub}/*`);
for (const [groupName, group] of Object.entries(backend.auth.resources.groups)) {
  const prefixes =
    groupName === 'ADMIN' ? ['avatars', 'school-media', 'imports'] : groupName === 'PARTNER' || groupName === 'OWNER' ? ['avatars', 'school-media'] : ['avatars'];
  new iam.Policy(storageStack, `OwnFolderWrites${groupName}`, {
    roles: [group.role],
    statements: [
      new iam.PolicyStatement({
        actions: ['s3:PutObject', 's3:DeleteObject', 's3:AbortMultipartUpload'],
        resources: prefixes.map(ownFolder),
      }),
    ],
  });
}

// App branding (logo, icon, hero image) is written only by the platform owner.
new iam.Policy(storageStack, 'OwnerBrandingWrites', {
  roles: [backend.auth.resources.groups['OWNER'].role],
  statements: [
    new iam.PolicyStatement({
      actions: ['s3:PutObject', 's3:DeleteObject', 's3:AbortMultipartUpload'],
      resources: [bucket.arnForObjects('branding/*')],
    }),
  ],
});

// ───────────────────────────── outputs ─────────────────────────────
backend.addOutput({
  custom: {
    schoolId: process.env.EXPO_PUBLIC_SCHOOL_ID ?? 'default',
    schoolName: process.env.SCHOOL_NAME ?? 'Our School',
    sesFromEmail: process.env.SES_FROM_EMAIL ?? '',
  },
});
