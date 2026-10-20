import { defineStorage } from '@aws-amplify/backend';
import { adminUsers } from '../functions/admin-users/resource';
import { comms } from '../functions/comms/resource';

/**
 * Private S3 bucket. Every path is explicit; nothing is public.
 * Clients always fetch short-lived signed URLs (see src/lib/storage/s3.ts).
 *
 * Every signed-in user belongs to exactly one Cognito group, and the identity pool hands group
 * members their *group* IAM role (token-based role mapping), not the generic "authenticated" role.
 * `allow.authenticated` and `allow.entity` therefore never apply to real users of this app, so each
 * path lists the groups explicitly (2026-10-20: drivers/students/teachers got AccessDenied on
 * every upload and download until this was added). The authenticated/entity rules stay for
 * completeness (users outside any group).
 */
const MEMBERS = ['TEACHER', 'DRIVER', 'STUDENT'];

export const storage = defineStorage({
  name: 'schoolMedia',
  access: (allow) => ({
    // Profile pictures: keys are avatars/<identity id>/…; the app only ever writes its own folder.
    'avatars/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
      allow.authenticated.to(['read']),
      allow.groups(['ADMIN', ...MEMBERS]).to(['read', 'write', 'delete']),
    ],
    // Chat attachments: any signed-in member can upload/read; only admins delete.
    'chat/*': [
      allow.authenticated.to(['read', 'write']),
      allow.groups(MEMBERS).to(['read', 'write']),
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
      allow.groups(MEMBERS).to(['read']),
      allow.authenticated.to(['read']),
    ],
    'school/branding/*': [
      allow.groups(['ADMIN']).to(['read', 'write', 'delete']),
      allow.groups(MEMBERS).to(['read']),
      allow.authenticated.to(['read']),
      allow.guest.to(['read']),
    ],
    'courses/*': [
      allow.groups(['ADMIN']).to(['read', 'write', 'delete']),
      allow.groups(MEMBERS).to(['read']),
      allow.authenticated.to(['read']),
    ],
    // CSV imports: admins upload under imports/<identity id>/…; the import Lambda reads them.
    'imports/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
      allow.groups(['ADMIN']).to(['read', 'write', 'delete']),
      allow.resource(adminUsers).to(['read', 'write']),
    ],
  }),
});
