import { defineAuth } from '@aws-amplify/backend';

const schoolName = process.env.SCHOOL_NAME ?? 'Our School';
const sesFromEmail = process.env.SES_FROM_EMAIL;
const sesFromName = process.env.SES_FROM_NAME ?? 'School Office';

/**
 * Cognito user pool.
 *
 * - Usernames are the school ID number (free-form string). `loginWith.email` is what Gen 2 requires
 *   to make `email` a required attribute; `backend.ts` then removes `UsernameAttributes` from the
 *   user pool with a CDK override so that sign-in uses the raw username instead of the e-mail.
 * - Groups decide which workspace a user can open.
 * - Admin-created users receive the invitation e-mail below (username + temporary password).
 * - When SES_FROM_EMAIL is set (a *verified* SES identity in the same region) Cognito sends through
 *   SES; otherwise the Cognito default sender is used (sandbox only, 50 e-mails/day).
 */
export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailStyle: 'CODE',
      verificationEmailSubject: `${schoolName} – your verification code`,
      verificationEmailBody: (createCode) =>
        `Your ${schoolName} verification code is ${createCode()}. It expires in 24 hours.`,
      userInvitation: {
        emailSubject: `Your ${schoolName} app account`,
        emailBody: (user, code) =>
          [
            `Welcome to the ${schoolName} app.`,
            '',
            'Install the "School Bus" app from the App Store / Google Play (or open the web app link your school shared), then sign in with:',
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
  groups: ['ADMIN', 'TEACHER', 'DRIVER', 'STUDENT'],
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
