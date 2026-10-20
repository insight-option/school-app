/* eslint-disable no-console */
/**
 * Register a bus + driver account through the real `registerBus` mutation (signed in as an admin).
 *
 *   BUS_ID=BUS-01 BUS_PLATE='RUH 1234' DRIVER_NAME='Abu Khalid' DRIVER_PASSWORD='Driver#2026' npm run create-bus
 *
 * Optional: DRIVER_PHONE, DRIVER_EMAIL, BUS_CAPACITY (default 40), ADMIN_USERNAME / ADMIN_PASSWORD
 * (default ADMIN-01 / Admin#2026), AMPLIFY_OUTPUTS (another backend's amplify_outputs.json).
 * The driver's password is permanent – drivers sign in straight away.
 */
import { dataClient, loadOutputs, log, must, signInAs } from './lib';

async function main() {
  loadOutputs();
  const admin = { username: process.env.ADMIN_USERNAME ?? 'ADMIN-01', password: process.env.ADMIN_PASSWORD ?? 'Admin#2026' };
  const bus = {
    username: process.env.BUS_ID ?? 'BUS-01',
    password: process.env.DRIVER_PASSWORD ?? 'Driver#2026',
    plate: process.env.BUS_PLATE ?? process.env.BUS_ID ?? 'BUS-01',
    driverName: process.env.DRIVER_NAME ?? 'Bus driver',
    driverPhone: process.env.DRIVER_PHONE ?? null,
    email: process.env.DRIVER_EMAIL ?? null,
    capacity: Number(process.env.BUS_CAPACITY ?? 40),
  };

  const signedIn = await signInAs(admin.username, admin.password);
  if (!signedIn.ok) throw new Error(`Could not sign in as ${admin.username}: ${signedIn.step}`);
  const client = dataClient();
  const res = must(await client.mutations.registerBus(bus), 'registerBus');
  log('Bus registered', res);
  console.log(`\nDriver signs in with  ID: ${bus.username}   password: ${bus.password}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
