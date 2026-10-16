import { Linking, Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { toast } from '../../ui/Toast';

export async function callPhone(phone: string | null | undefined) {
  if (!phone) return;
  const url = `tel:${phone.replace(/\s+/g, '')}`;
  try {
    await Linking.openURL(url);
  } catch {
    toast.error(phone);
  }
}

export async function copyText(text: string, confirmation?: string) {
  await Clipboard.setStringAsync(text);
  if (confirmation) toast.success(confirmation);
}

export async function shareText(message: string, title?: string) {
  try {
    await Share.share({ message, title });
  } catch {
    // user cancelled
  }
}

export function haptic(kind: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'selection' = 'light') {
  if (Platform.OS === 'web') return;
  switch (kind) {
    case 'light':
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      break;
    case 'medium':
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    case 'heavy':
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      break;
    case 'success':
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      break;
    case 'error':
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      break;
    case 'selection':
      void Haptics.selectionAsync();
      break;
  }
}

/** Save text as a file and hand it to the system share sheet (native) or trigger a download (web). */
export async function downloadTextFile(filename: string, content: string, mime = 'text/csv') {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new FileSystem.File(FileSystem.Paths.cache, filename);
  file.write(content);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: filename });
  else toast.info(file.uri);
}

export async function openExternal(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    toast.error(url);
  }
}

export const isWeb = Platform.OS === 'web';
