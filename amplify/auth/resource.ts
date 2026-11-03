import { defineAuth } from '@aws-amplify/backend';

/** Product name used in the pool-wide Cognito e-mails (one user pool serves every school). */
const appName = process.env.APP_NAME ?? 'School Bus';
const sesFromEmail = process.env.SES_FROM_EMAIL;
const sesFromName = process.env.SES_FROM_NAME ?? appName;

/**
 * Cognito user pool (shared by every school; isolation is enforced by `custom:schoolId` + per-school
 * admin groups, see data/resource.ts).
 *
 * - Usernames are free-form: school ID numbers for staff/students, the e-mail address for school
 *   owners who sign up themselves. `loginWith.email` is what Gen 2 requires to make `email` a required
 *   attribute; `backend.ts` then removes `UsernameAttributes` from the user pool with a CDK override.
 * - Self sign-up is enabled for "Create my school"; the sign-up e-mail code verifies the address.
 * - Groups decide which workspace a user can open.
 * - Users created by a school office receive the invitation e-mail below.
 * - When SES_FROM_EMAIL is set (a *verified* SES identity in the same region) Cognito sends through
 *   SES; otherwise the Cognito default sender is used (50 e-mails/day).
 */
export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailStyle: 'CODE',
      verificationEmailSubject: `${appName} – your verification code`,
      verificationEmailBody: (createCode) =>
        `Your ${appName} verification code is ${createCode()}. Enter it in the app to finish creating your school account. It expires in 24 hours.`,
      userInvitation: {
        emailSubject: `Your ${appName} account`,
        emailBody: (user, code) =>
          [
            `Your school created an account for you in the ${appName} app.`,
            '',
            `Install the "${appName}" app from the App Store / Google Play (or open the web app link your school shared), then sign in with:`,
            '',
            `  School ID (username): ${user()}`,
            `  Temporary password:   ${code()}`,
            '',
            'You will be asked to set a new password on first login. Parents and the student share this login.',
            '',
            'If you did not expect this e-mail, contact the school office.',
          ].join('\n'),
      },
    },
  },
  userAttributes: {
    email: { required: true, mutable: true },
    fullname: { required: false, mutable: true },
    phoneNumber: { required: false, mutable: true },
    'custom:role': { dataType: 'String', mutable: true, minLen: 1, maxLen: 16 },
    'custom:schoolId': { dataType: 'String', mutable: true, minLen: 1, maxLen: 64 },
  },
  // OWNER: platform owner (members added by hand in Cognito). PARTNER: activity businesses.
  // CUSTOMER: people who book activities.
  groups: ['ADMIN', 'TEACHER', 'DRIVER', 'STUDENT', 'OWNER', 'PARTNER', 'CUSTOMER'],
  ...(sesFromEmail
    ? {
        senders: {
          email: {
            fromEmail: sesFromEmail,
            fromName: sesFromName,
          },
        },
      }
    : {}),
});
