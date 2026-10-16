import { defineStorage } from '@aws-amplify/backend';
import { adminUsers } from '../functions/admin-users/resource';
import { comms } from '../functions/comms/resource';

/**
 * Private S3 bucket. Every path is explicit; nothing is public.
 * Clients always fetch short-lived signed URLs (see src/lib/storage.ts).
 */
export const storage = defineStorage({
  name: 'schoolMedia',
  access: (allow) => ({
    // Profile pictures: the owner (Cognito identity) writes, everyone signed-in can view.
    'avatars/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
      allow.authenticated.to(['read']),
      allow.groups(['ADMIN']).to(['read', 'write', 'delete']),
    ],
    // Chat attachments: any signed-in member can upload/read; only admins delete.
    'chat/*': [
      allow.authenticated.to(['read', 'write']),
      allow.groups(['ADMIN']).to(['read', 'write', 'delete']),
      allow.resource(comms).to(['read']),
    ],
    // Feedback attachments: teachers & admins write; everyone signed-in can read (feedback rows are
    // only returned to the student they concern, see data auth rules).
    'feedback/*': [
      allow.groups(['TEACHER']).to(['read', 'write']),
      allow.groups(['ADMIN']).to(['read', 'write', 'delete']),
      allow.groups(['STUDENT', 'DRIVER']).to(['read']),
    ],
    'broadcasts/*': [
      allow.groups(['ADMIN']).to(['read', 'write', 'delete']),
      allow.authenticated.to(['read']),
    ],
    'school/branding/*': [
      allow.groups(['ADMIN']).to(['read', 'write', 'delete']),
      allow.authenticated.to(['read']),
      allow.guest.to(['read']),
    ],
    'courses/*': [
      allow.groups(['ADMIN']).to(['read', 'write', 'delete']),
      allow.authenticated.to(['read']),
    ],
    // CSV imports: each admin keeps their own uploads; the import Lambda reads them.
    'imports/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
      allow.groups(['ADMIN']).to(['read']),
      allow.resource(adminUsers).to(['read', 'write']),
    ],
  }),
});
