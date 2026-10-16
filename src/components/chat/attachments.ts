import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { MessageType } from '../../lib/data/client';
import { MAX_ATTACHMENT_MB, fileExtension, randomId, uploadFile } from '../../lib/storage/s3';
import type { AttachmentMeta } from './uploadStore';

export type PickedAttachment = {
  type: MessageType;
  uri: string;
  mime: string;
  name: string;
  size?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  file?: Blob; // web
};

const IMAGE_MAX = 1600;
const THUMB_MAX = 320;

export async function pickFromLibrary(kind: 'images' | 'videos' | 'both' = 'both'): Promise<PickedAttachment[] | null> {
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: kind === 'both' ? ['images', 'videos'] : [kind],
    allowsMultipleSelection: true,
    selectionLimit: 5,
    quality: 0.9,
    videoMaxDuration: 180,
  });
  if (res.canceled) return null;
  return res.assets.map(assetToAttachment);
}

export async function captureWithCamera(): Promise<PickedAttachment[] | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.9, videoMaxDuration: 120 });
  if (res.canceled) return null;
  return res.assets.map(assetToAttachment);
}

export async function pickDocument(): Promise<PickedAttachment[] | null> {
  const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return null;
  return res.assets.map((a) => ({
    type: 'FILE' as const,
    uri: a.uri,
    mime: a.mimeType ?? 'application/octet-stream',
    name: a.name,
    size: a.size ?? undefined,
    file: a.file ?? undefined,
  }));
}

function assetToAttachment(a: ImagePicker.ImagePickerAsset): PickedAttachment {
  const isVideo = a.type === 'video';
  return {
    type: isVideo ? 'VIDEO' : 'IMAGE',
    uri: a.uri,
    mime: a.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
    name: a.fileName ?? `${isVideo ? 'video' : 'photo'}.${fileExtension(a.uri, isVideo ? 'mp4' : 'jpg')}`,
    size: a.fileSize ?? undefined,
    width: a.width,
    height: a.height,
    durationMs: a.duration ?? undefined,
    file: a.file ?? undefined,
  };
}

export function tooLarge(att: PickedAttachment): boolean {
  return !!att.size && att.size > MAX_ATTACHMENT_MB * 1024 * 1024;
}

/** Downscale + re-encode an image; returns the new uri and dimensions. */
async function compressImage(uri: string, max: number, quality: number): Promise<{ uri: string; width: number; height: number }> {
  const ctx = ImageManipulator.manipulate(uri);
  // Resizing with only one dimension keeps the aspect ratio.
  const ref = await ctx.resize({ width: max }).renderAsync();
  const out = await ref.saveAsync({ compress: quality, format: SaveFormat.JPEG });
  ref.release();
  return { uri: out.uri, width: out.width, height: out.height };
}

/**
 * Upload one attachment (plus a client-side thumbnail for images) under `chat/{conversationId}/…`.
 * Returns the storage key and metadata for the message.
 */
export async function uploadAttachment(att: PickedAttachment, basePath: string, onProgress?: (p: number) => void): Promise<{ key: string; meta: AttachmentMeta }> {
  const id = randomId();
  const meta: AttachmentMeta = { name: att.name, size: att.size, mime: att.mime, durationMs: att.durationMs, width: att.width, height: att.height };
  let uri = att.uri;
  let ext = fileExtension(att.name || att.uri, att.type === 'IMAGE' ? 'jpg' : att.type === 'VIDEO' ? 'mp4' : att.type === 'VOICE' ? 'm4a' : 'bin');
  let mime = att.mime;

  if (att.type === 'IMAGE' && Platform.OS !== 'web') {
    try {
      const needsResize = !att.width || att.width > IMAGE_MAX;
      const main = needsResize ? await compressImage(att.uri, IMAGE_MAX, 0.82) : await compressImage(att.uri, att.width!, 0.85);
      uri = main.uri;
      meta.width = main.width;
      meta.height = main.height;
      ext = 'jpg';
      mime = 'image/jpeg';
      const thumb = await compressImage(att.uri, THUMB_MAX, 0.7);
      const thumbKey = `${basePath}/${id}.thumb.jpg`;
      await uploadFile(thumbKey, thumb.uri, 'image/jpeg');
      meta.thumbKey = thumbKey;
    } catch (e) {
      console.warn('image compression skipped', e);
    }
  }
  const key = `${basePath}/${id}.${ext}`;
  await uploadFile(key, att.file ?? uri, mime, onProgress);
  return { key, meta };
}
