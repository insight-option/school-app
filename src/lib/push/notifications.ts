import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { client, unwrap } from '../data/client';
import { KV_KEYS, kv } from '../storage/mmkv';

export const ALARM_CHANNEL_ID = 'bus-alarm';
export const MESSAGES_CHANNEL_ID = 'messages';
export const DEFAULT_CHANNEL_ID = 'default';

export type PushData = {
  type?: 'ALARM' | 'TEST_ALARM' | 'MESSAGE' | 'FEEDBACK' | 'BROADCAST' | 'BUS_NEAR' | 'BOARDED' | 'DROPPED' | 'SYSTEM';
  tripStopId?: string;
  tripId?: string;
  busId?: string;
  conversationId?: string;
  messageId?: string;
  feedbackId?: string;
  broadcastId?: string;
  driverName?: string;
  plate?: string;
  etaSeconds?: number | null;
};

export const isPushSupported = Platform.OS !== 'web';

let handlerInstalled = false;
/** Foreground presentation: alarms always ring; everything else shows a banner. */
export function installNotificationHandler() {
  if (!isPushSupported || handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = (notification.request.content.data ?? {}) as PushData;
      const isAlarm = data.type === 'ALARM' || data.type === 'TEST_ALARM';
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: !isAlarm,
      };
    },
  });
}

export async function setupNotificationChannels(labels: { alarmName: string; alarmDescription: string; messages: string; general: string }) {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
    name: labels.alarmName,
    description: labels.alarmDescription,
    importance: Notifications.AndroidImportance.MAX,
    sound: 'alarm.wav',
    vibrationPattern: [0, 800, 400, 800, 400, 800],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    enableLights: true,
    lightColor: '#FF0000',
    enableVibrate: true,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      flags: { enforceAudibility: true, requestHardwareAudioVideoSynchronization: false },
    },
  });
  await Notifications.setNotificationChannelAsync(MESSAGES_CHANNEL_ID, {
    name: labels.messages,
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 200],
  });
  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
    name: labels.general,
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function getPushPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined' | 'unsupported'> {
  if (!isPushSupported) return 'unsupported';
  const res = await Notifications.getPermissionsAsync();
  const ios = res.ios?.status;
  if (res.granted || ios === Notifications.IosAuthorizationStatus.AUTHORIZED || ios === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
  return res.canAskAgain ? 'undetermined' : 'denied';
}

export async function requestPushPermission(): Promise<boolean> {
  if (!isPushSupported) return false;
  const res = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true, allowCriticalAlerts: ENABLE_IOS_CRITICAL_ALERTS },
  });
  return res.granted || res.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED || res.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

/**
 * iOS Critical Alerts bypass the mute switch and Do Not Disturb but need an Apple entitlement
 * (com.apple.developer.usernotifications.critical-alerts). Flip this flag after approval and add
 * the entitlement in app.config.ts → ios.entitlements. Until then alarms use "time-sensitive".
 */
export const ENABLE_IOS_CRITICAL_ALERTS = false;

function projectId(): string | undefined {
  const extra = (Constants.expoConfig?.extra ?? {}) as { eas?: { projectId?: string } };
  return extra.eas?.projectId ?? (Constants.easConfig as { projectId?: string } | undefined)?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
}

/** Obtain the Expo push token and upsert a Device row for this user. Multiple devices per account are allowed. */
export async function registerDeviceForPush(userId: string): Promise<string | null> {
  if (!isPushSupported) return null;
  if (!Device.isDevice) return null; // simulators have no push token
  const status = await getPushPermissionStatus();
  if (status !== 'granted') return null;
  let token: string;
  try {
    const id = projectId();
    const res = await Notifications.getExpoPushTokenAsync(id ? { projectId: id } : undefined);
    token = res.data;
  } catch (e) {
    console.warn('push token unavailable (set EXPO_PUBLIC_EAS_PROJECT_ID / run eas init)', e);
    return null;
  }
  kv.setString(KV_KEYS.pushToken, token);
  const now = new Date().toISOString();
  const name = `${Device.manufacturer ?? ''} ${Device.modelName ?? ''}`.trim() || Platform.OS;
  try {
    const existing = await client.models.Device.listDevicesByToken({ expoPushToken: token }, { limit: 5 });
    unwrap(existing);
    const mine = existing.data.find((d) => d.userId === userId);
    for (const d of existing.data) if (d.userId !== userId) await client.models.Device.delete({ id: d.id }); // device changed hands
    if (mine) await client.models.Device.update({ id: mine.id, lastSeenAt: now, platform: Platform.OS, deviceName: name });
    else await client.models.Device.create({ userId, expoPushToken: token, platform: Platform.OS, deviceName: name, lastSeenAt: now });
  } catch (e) {
    console.warn('device registration failed', e);
  }
  return token;
}

/** On sign-out: stop pushing to this device. */
export async function unregisterDevice(userId: string) {
  const token = kv.getString(KV_KEYS.pushToken);
  if (!token) return;
  try {
    const existing = await client.models.Device.listDevicesByToken({ expoPushToken: token }, { limit: 5 });
    for (const d of existing.data) if (d.userId === userId) await client.models.Device.delete({ id: d.id });
  } catch {
    // best effort
  }
}

export async function openSystemNotificationSettings() {
  const { Linking } = await import('react-native');
  if (Platform.OS === 'ios') await Linking.openURL('app-settings:');
  else await Linking.openSettings();
}

/** Resolve the route a push notification should open. Returns null when nothing to open. */
export function routeForPush(data: PushData | undefined, role: string | null): string | null {
  if (!data?.type) return null;
  switch (data.type) {
    case 'ALARM':
      return data.tripStopId ? `/alarm/${data.tripStopId}` : null;
    case 'TEST_ALARM':
      return '/alarm/test';
    case 'MESSAGE':
      return data.conversationId ? `/chat/${data.conversationId}` : null;
    case 'FEEDBACK':
      return role === 'STUDENT' ? '/(student)/feedback' : role === 'ADMIN' ? '/(admin)/feedback' : '/notifications';
    case 'BUS_NEAR':
    case 'BOARDED':
    case 'DROPPED':
      return role === 'STUDENT' ? '/(student)/bus' : '/notifications';
    case 'BROADCAST':
    case 'SYSTEM':
    default:
      return '/notifications';
  }
}
