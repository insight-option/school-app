/* eslint-disable no-console */
/**
 * Create the first school-office (ADMIN) account.
 *
 *   ADMIN_USERNAME=ADMIN-01 ADMIN_PASSWORD='Admin#2026' ADMIN_EMAIL=office@school.example npm run create-admin
 *
 * Needs AWS credentials for the sandbox account (same as `npx ampx sandbox`).
 */
import { ensureCognitoUser, loadOutputs, log, must, signInAs, dataClient } from './lib';

async function main() {
  const outputs = loadOutputs();
  const username = process.env.ADMIN_USERNAME ?? 'ADMIN-01';
  const password = process.env.ADMIN_PASSWORD ?? 'Admin#2026';
  const email = process.env.ADMIN_EMAIL ?? 'office@example.com';
  const schoolId = outputs.custom?.schoolId ?? 'default';

  const { sub, created } = await ensureCognitoUser(outputs, { username, password, email, name: 'School Office', group: 'ADMIN', schoolId });
  log(created ? 'Admin created' : 'Admin already existed', { username, sub });

  const signedIn = await signInAs(username, password);
  if (!signedIn.ok) throw new Error(`Could not sign in as ${username}: ${signedIn.step}`);
  const client = dataClient();
  const existing = await client.models.Profile.get({ userId: sub });
  if (!existing.data) {
    must(
      await client.models.Profile.create({ userId: sub, username, role: 'ADMIN', schoolId, fullName: 'School Office', email, isActive: true, language: 'en' }),
      'Profile.create',
    );
    log('Admin profile created');
  }
  const settings = await client.models.SchoolSettings.get({ schoolId });
  if (!settings.data) {
    must(await client.models.SchoolSettings.create({ schoolId, name: outputs.custom?.schoolName ?? 'Our School' }), 'SchoolSettings.create');
    log('School settings created');
  }
  console.log(`\nSign in with  ID: ${username}   password: ${password}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
