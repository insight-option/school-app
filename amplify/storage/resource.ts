import { defineStorage } from '@aws-amplify/backend';
import { adminUsers } from '../functions/admin-users/resource';
import { comms } from '../functions/comms/resource';

/**
 * Private S3 bucket. Every path is explicit; nothing is public except school directory media.
 * Clients always fetch short-lived signed URLs (see src/lib/storage/s3.ts).
 *
 * Multi-school isolation:
 *  - Readers get `get` (download a known key) but never `list`, so nobody can enumerate another
 *    school's files. Keys contain 128-bit random ids and are only discoverable through data that is
 *    already school-scoped (messages, feedback, courses …).
 *  - Per-person folders (`avatars/`, `school-media/`, `imports/`) are keyed by the Cognito identity id
 *    and only that identity may write there. Every signed-in user belongs to one Cognito group and
 *    therefore receives the group's IAM role (token-based role mapping), which Amplify's
 *    `allow.entity` rules do not cover – backend.ts adds the identity-scoped write statements to the
 *    group roles.
 *  - `school-media/` holds logos and cover photos of the public school directory: guests can view them.
 */
const MEMBERS = ['TEACHER', 'DRIVER', 'STUDENT'];
const EVERYONE = ['ADMIN', ...MEMBERS];
// Platform roles: the owner reads everything; partners and customers see public media.
const PLATFORM = ['OWNER', 'PARTNER', 'CUSTOMER'];
const ALL_GROUPS = [...EVERYONE, ...PLATFORM];

export const storage = defineStorage({
  name: 'schoolMedia',
  access: (allow) => ({
    // Profile pictures: avatars/<identity id>/…, viewable by every signed-in user who has the key.
    'avatars/{entity_id}/*': [
      allow.entity('identity').to(['get', 'write', 'delete']),
      allow.authenticated.to(['get']),
      allow.groups(ALL_GROUPS).to(['get']),
    ],
    // Public school directory media (logos, covers): school-media/<identity id>/…
    // Also business logos, covers and venue photos (partners upload to their identity folder).
    'school-media/{entity_id}/*': [
      allow.entity('identity').to(['get', 'write', 'delete']),
      allow.guest.to(['get']),
      allow.authenticated.to(['get']),
      allow.groups(ALL_GROUPS).to(['get']),
    ],
    // App logo / icon / hero image chosen in the owner console (OWNER writes – see backend.ts).
    'branding/*': [allow.guest.to(['get']), allow.authenticated.to(['get']), allow.groups(ALL_GROUPS).to(['get'])],
    // Chat attachments: chat/<conversationId>/<random>…; members upload, nobody lists.
    'chat/*': [
      allow.groups(EVERYONE).to(['get', 'write']),
      allow.groups(['OWNER']).to(['get']),
      allow.resource(comms).to(['read']),
    ],
    // Feedback attachments: teachers & the office write; the family reads (rows are school-scoped).
    'feedback/*': [allow.groups(['TEACHER', 'ADMIN']).to(['get', 'write']), allow.groups(['STUDENT', 'DRIVER', 'OWNER']).to(['get'])],
    'broadcasts/*': [allow.groups(['ADMIN']).to(['get', 'write']), allow.groups([...MEMBERS, 'OWNER']).to(['get'])],
    // Legacy location of the first school's logo (new uploads go to school-media/).
    'school/branding/*': [allow.guest.to(['get']), allow.authenticated.to(['get']), allow.groups(ALL_GROUPS).to(['get'])],
    'courses/*': [allow.groups(['ADMIN']).to(['get', 'write']), allow.groups([...MEMBERS, 'OWNER']).to(['get'])],
    // CSV imports: imports/<identity id>/…; the import Lambda reads them.
    'imports/{entity_id}/*': [
      allow.entity('identity').to(['get', 'write', 'delete']),
      allow.groups(['ADMIN']).to(['get']),
      allow.resource(adminUsers).to(['read', 'write']),
    ],
  }),
});
