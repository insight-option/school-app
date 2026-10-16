import '../lib/amplify';
import '../lib/i18n';
import '../lib/query/mutationDefaults';
import '../lib/location/busLocationTask';
import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useTranslation } from 'react-i18next';
import { QUERY_CACHE_BUSTER, queryClient, queryPersister } from '../lib/query/client';
import { bootstrapSession, startAuthListener, useSession } from '../lib/auth/session';
import { useSettings } from '../features/settings';
import { ThemeContext, buildTheme } from '../ui/theme';
import { ToastHost } from '../ui/Toast';
import { OfflineBanner, startNetworkListener } from '../lib/net/offline';
import { useResolvedScheme } from '../lib/appearance';
import { getPushPermissionStatus, installNotificationHandler, isPushSupported, registerDeviceForPush, routeForPush, setupNotificationChannels, type PushData } from '../lib/push/notifications';
import { useAlarmStore } from '../lib/alarm/alarmPlayer';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export const unstable_settings = { anchor: 'index' };

export default function RootLayout() {
  useEffect(() => {
    startAuthListener();
    startNetworkListener();
    installNotificationHandler();
    void bootstrapSession().finally(() => SplashScreen.hideAsync().catch(() => undefined));
  }, []);

  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: queryPersister,
            buster: QUERY_CACHE_BUSTER,
            maxAge: 1000 * 60 * 60 * 24 * 7,
            dehydrateOptions: {
              shouldDehydrateQuery: (q) => q.state.status === 'success' && !q.queryKey.includes('busLocation'),
              shouldDehydrateMutation: (m) => m.state.isPaused,
            },
          }}
          onSuccess={() => {
            void queryClient.resumePausedMutations();
          }}
        >
          <ThemedApp />
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedApp() {
  const scheme = useResolvedScheme();
  const session = useSession();
  const settings = useSettings();
  const theme = useMemo(() => buildTheme(scheme, settings.data?.primaryColor), [scheme, settings.data?.primaryColor]);
  const { t } = useTranslation();

  // Android channels (needed before the first token request on Android 13+).
  useEffect(() => {
    void setupNotificationChannels({
      alarmName: t('alarm.channelName'),
      alarmDescription: t('alarm.channelDescription'),
      messages: t('alarm.messagesChannel'),
      general: t('alarm.defaultChannel'),
    });
  }, [t]);

  // Register this device for push once per signed-in session (if permission already granted).
  const registeredFor = useRef<string | null>(null);
  useEffect(() => {
    if (session.status !== 'signedIn' || !session.userId || registeredFor.current === session.userId) return;
    registeredFor.current = session.userId;
    void getPushPermissionStatus().then((s) => {
      if (s === 'granted') void registerDeviceForPush(session.userId!);
    });
  }, [session.status, session.userId]);

  return (
    <ThemeContext.Provider value={theme}>
      <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <OfflineBanner />
        <RootNavigator />
        <ToastHost />
        <PushRouter />
        <AlarmRouter />
      </View>
    </ThemeContext.Provider>
  );
}

function RootNavigator() {
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  const role = session.role;
  return (
    <Stack screenOptions={{ headerShown: false, animation: Platform.OS === 'web' ? 'none' : 'default' }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!signedIn || !role}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && role === 'STUDENT'}>
        <Stack.Screen name="(student)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && role === 'DRIVER'}>
        <Stack.Screen name="(driver)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && role === 'TEACHER'}>
        <Stack.Screen name="(teacher)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && role === 'ADMIN'}>
        <Stack.Screen name="(admin)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="chat/[conversationId]" />
        <Stack.Screen name="alarm/[tripStopId]" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="change-password" />
      </Stack.Protected>
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

/** Opens the right screen when the user taps a push notification, and shows alarms arriving in the foreground. */
function PushRouter() {
  const router = useRouter();
  const session = useSession();
  const lastResponse = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  const show = useAlarmStore((s) => s.show);

  useEffect(() => {
    if (!isPushSupported || !lastResponse || session.status !== 'signedIn') return;
    const id = lastResponse.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const data = lastResponse.notification.request.content.data as PushData | undefined;
    const route = routeForPush(data, session.role);
    if (route) router.push(route as never);
    void Notifications.clearLastNotificationResponseAsync?.();
  }, [lastResponse, session.status, session.role, router]);

  useEffect(() => {
    if (!isPushSupported) return;
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data as PushData | undefined;
      if (data?.type === 'ALARM' && data.tripStopId) show({ tripStopId: data.tripStopId, driverName: data.driverName, plate: data.plate, etaSeconds: data.etaSeconds ?? null });
      if (data?.type === 'TEST_ALARM') show({ tripStopId: 'test', test: true });
    });
    return () => sub.remove();
  }, [show]);
  return null;
}

function AlarmRouter() {
  const active = useAlarmStore((s) => s.active);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!active) return;
    const target = `/alarm/${active.tripStopId}`;
    if (pathname !== target) router.push(target as never);
  }, [active, pathname, router]);
  return null;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
