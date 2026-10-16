import { defineBackend } from '@aws-amplify/backend';
import { ArnFormat, Duration, Names, Stack } from 'aws-cdk-lib';
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

const backend = defineBackend({
  auth,
  data,
  storage,
  adminUsers,
  trips,
  alarm,
  comms,
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
// Only the office creates accounts – no self sign-up.
cfnUserPool.addPropertyOverride('AdminCreateUserConfig.AllowAdminCreateUserOnly', true);
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
backend.alarm.resources.lambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['states:StartExecution'],
    resources: [alarmStateMachineArn],
  }),
);

// ───────────────────────────── outputs ─────────────────────────────
backend.addOutput({
  custom: {
    schoolId: process.env.EXPO_PUBLIC_SCHOOL_ID ?? 'default',
    schoolName: process.env.SCHOOL_NAME ?? 'Our School',
    sesFromEmail: process.env.SES_FROM_EMAIL ?? '',
  },
});
