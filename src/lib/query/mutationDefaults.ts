import { client, unwrap } from '../data/client';
import { SEND_MESSAGE_KEY, type SendMessageInput } from '../../features/messaging';
import { queryClient } from './client';

/**
 * Mutation defaults let paused (offline) mutations resume after an app restart: the persisted
 * mutation only stores its key + variables, and the function is looked up here.
 */
queryClient.setMutationDefaults(SEND_MESSAGE_KEY, {
  mutationFn: async (input: SendMessageInput) =>
    unwrap(await client.mutations.sendMessage({ ...input, attachmentMeta: input.attachmentMeta ? JSON.stringify(input.attachmentMeta) : undefined }), 'send'),
});
