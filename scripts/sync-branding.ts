/**
 * Pulls the app name and icon chosen in the owner console (Branding) into the native build.
 * The in-app name, logo and colours change instantly; the home-screen icon and the name under it
 * are baked into the APK / iOS build, so run this before `eas build`:
 *
 *   npm run sync-branding        (uses ./amplify_outputs.json, guest access – no AWS login needed)
 *
 * Writes assets/branding/icon.png (when an icon was uploaded) and assets/branding/branding.json,
 * which app.config.ts picks up.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateClient } from 'aws-amplify/data';
import { getUrl } from 'aws-amplify/storage';
import type { Schema } from '../amplify/data/resource';
import { loadOutputs } from './lib';

async function main() {
  loadOutputs();
  const guest = generateClient<Schema>({ authMode: 'identityPool' });
  const res = await guest.models.AppConfig.get({ id: 'app' });
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '));
  const cfg = res.data;
  if (!cfg) {
    console.log('No branding saved yet (owner console → Branding). Nothing to do.');
    return;
  }
  const dir = resolve(process.cwd(), 'assets/branding');
  mkdirSync(dir, { recursive: true });
  let icon = false;
  if (cfg.iconKey) {
    const { url } = await getUrl({ path: cfg.iconKey, options: { expiresIn: 300 } });
    const r = await fetch(url.toString());
    if (!r.ok) throw new Error(`icon download failed: HTTP ${r.status}`);
    writeFileSync(resolve(dir, 'icon.png'), Buffer.from(await r.arrayBuffer()));
    icon = true;
  }
  writeFileSync(resolve(dir, 'branding.json'), `${JSON.stringify({ appName: cfg.appName, primaryColor: cfg.primaryColor ?? null, icon }, null, 2)}\n`);
  console.log(`Branding synced: "${cfg.appName}"${icon ? ' + icon' : ''} → assets/branding/. Build the app to apply it.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
