/**
 * Create (or repair) a platform-owner account in the user pool the app uses.
 *
 *   AWS_PROFILE=school OWNER_EMAIL=you@example.com OWNER_NAME="Your Name" npm run create-owner
 *
 * - The username is the e-mail address (lower-case), so the owner signs in with the e-mail.
 * - Without OWNER_PASSWORD Cognito e-mails a temporary password (the app then asks for a new one);
 *   with OWNER_PASSWORD that password is set as permanent and no e-mail is sent.
 * - An existing user (any username with that e-mail, or OWNER_USERNAME) is only added to OWNER.
 * - Uses ./amplify_outputs.json (the hosted backend) unless AMPLIFY_OUTPUTS points elsewhere.
 */
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { cognito, loadOutputs, log } from './lib';

async function main() {
  const outputs = loadOutputs();
  const email = (process.env.OWNER_EMAIL ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set OWNER_EMAIL to the owner’s e-mail address');
  const name = (process.env.OWNER_NAME ?? '').trim();
  const password = process.env.OWNER_PASSWORD;
  const UserPoolId = outputs.auth.user_pool_id;
  const idp = cognito(outputs.auth.aws_region);
  log('User pool', UserPoolId);

  // Reuse an account that already carries this e-mail (e.g. one created by hand in the console).
  let username = process.env.OWNER_USERNAME?.trim() || '';
  if (!username) {
    const existing = await idp.send(new ListUsersCommand({ UserPoolId, Filter: `email = "${email}"`, Limit: 5 }));
    if ((existing.Users ?? []).length > 1)
      throw new Error(`Several accounts use ${email}: ${existing.Users!.map((u) => u.Username).join(', ')} – set OWNER_USERNAME`);
    username = existing.Users?.[0]?.Username ?? email;
  }

  let created = false;
  try {
    await idp.send(new AdminGetUserCommand({ UserPoolId, Username: username }));
  } catch (e) {
    if ((e as { name?: string }).name !== 'UserNotFoundException') throw e;
    await idp.send(
      new AdminCreateUserCommand({
        UserPoolId,
        Username: username,
        UserAttributes: [{ Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' }, ...(name ? [{ Name: 'name', Value: name }] : [])],
        DesiredDeliveryMediums: ['EMAIL'],
        ...(password ? { TemporaryPassword: password, MessageAction: 'SUPPRESS' as const } : {}),
      }),
    );
    created = true;
  }
  if (password) await idp.send(new AdminSetUserPasswordCommand({ UserPoolId, Username: username, Password: password, Permanent: true }));
  if (!created)
    await idp.send(new AdminUpdateUserAttributesCommand({ UserPoolId, Username: username, UserAttributes: [{ Name: 'email_verified', Value: 'true' }] }));
  await idp.send(new AdminAddUserToGroupCommand({ UserPoolId, Username: username, GroupName: 'OWNER' }));

  log(created ? 'Owner created' : 'Existing account added to OWNER', { username, email });
  console.log(
    password
      ? `\nSign in with  ${email}  and the password you set.\n`
      : created
        ? `\nCognito e-mailed a temporary password to ${email}. Sign in with the e-mail and that password; the app asks for a new one.\n`
        : `\nSign in with  ${email}  and the account's current password (use "Forgot password?" if unknown).\n`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
