import 'react-native-get-random-values';
import '../lib/amplify';
import { isRTL, type AppLanguage } from '../lib/i18n';
import '../lib/query/mutationDefaults';
import '../lib/location/busLocationTask';
import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold, IBMPlexSansArabic_700Bold } from '@expo-google-fonts/ibm-plex-sans-arabic';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useTranslation } from 'react-i18next';
import { QUERY_CACHE_BUSTER, queryClient, queryPersister } from '../lib/query/client';
import { bootstrapSession, startAuthListener, useSession } from '../lib/auth/session';
import { useSettings, useSettingsSubscription } from '../features/settings';
import { ThemeContext, buildTheme } from '../ui/theme';
import { ToastHost } from '../ui/Toast';
import { OfflineBanner, startNetworkListener } from '../lib/net/offline';
import { useResolvedScheme } from '../lib/appearance';
import { getPushPermissionStatus, installNotificationHandler, isPushSupported, registerDeviceForPush, requestPushPermission, routeForPush, setupNotificationChannels, type PushData } from '../lib/push/notifications';
import { KV_KEYS, kv } from '../lib/storage/mmkv';
import { useAlarmStore } from '../lib/alarm/alarmPlayer';
import { useBranding, useDocumentTitle } from '../features/branding';
import { SuspendedScreen, useTenantStatus } from '../components/platform/SuspendedScreen';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Everything the alarm screen needs, straight from the push (works without network or sign-in). */
function alarmFromPush(data: PushData) {
  return {
    tripStopId: data.tripStopId ?? 'unknown',
    driverName: data.driverName,
    plate: data.plate,
    etaSeconds: data.etaSeconds ?? null,
    studentName: data.studentName,
    ackToken: data.ackToken,
    ackExpires: data.ackExpires,
  };
}

export const unstable_settings = { anchor: 'index' };

const FONTS = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
};

export default function RootLayout() {
  // Fonts load in parallel with the session; the splash stays up until both are ready (a font
  // error falls back to the system font instead of blocking the app).
  const [fontsLoaded, fontError] = useFonts(FONTS);
  const sessionStatus = useSession().status;
  useEffect(() => {
    startAuthListener();
    startNetworkListener();
    installNotificationHandler();
    void bootstrapSession();
  }, []);
  const ready = (fontsLoaded || !!fontError) && sessionStatus !== 'loading';
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  // Android resolves a Text's typeface when it is first drawn – render nothing until the fonts are
  // in, otherwise early screens keep the system font (the splash screen covers this moment).
  if (!fontsLoaded && !fontError) return null;

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
  useSettingsSubscription();
  const { t, i18n } = useTranslation();
  const branding = useBranding();
  useDocumentTitle(branding.appName);
  const arabic = i18n.language === 'ar';
  // School workspaces wear their school's colour; everything else wears the app brand.
  const primary = settings.data?.primaryColor || branding.primaryColor;
  const theme = useMemo(() => buildTheme(scheme, primary, { arabic, accent: branding.accentColor }), [scheme, primary, arabic, branding.accentColor]);
  // react-native-web resolves start/end and left/right from the nearest `dir` prop, not the page's
  // <html dir>, so Arabic needs it on the root view (native flips via I18nManager instead).
  const webDir = Platform.OS === 'web' ? ({ dir: isRTL(i18n.language as AppLanguage) ? 'rtl' : 'ltr' } as object) : null;

  // Android channels (needed before the first token request on Android 13+).
  useEffect(() => {
    // Expo Go on Android has no notification channels (push needs a real build) – never crash on it.
    setupNotificationChannels({
      alarmName: t('alarm.channelName'),
      alarmDescription: t('alarm.channelDescription'),
      messages: t('alarm.messagesChannel'),
      general: t('alarm.defaultChannel'),
    }).catch(() => undefined);
  }, [t]);

  // Register this device for push once per signed-in session (if permission already granted).
  const registeredFor = useRef<string | null>(null);
  useEffect(() => {
    if (session.status !== 'signedIn' || !session.userId || registeredFor.current === session.userId) return;
    registeredFor.current = session.userId;
    const userId = session.userId;
    void getPushPermissionStatus().then(async (s) => {
      if (s === 'granted') return void registerDeviceForPush(userId);
      // Booking requests / confirmations need notifications: partners, customers and the owner are
      // asked once (students get the dedicated alarm onboarding screen instead).
      if (s === 'undetermined' && (session.role === 'PARTNER' || session.role === 'CUSTOMER' || session.role === 'OWNER') && !kv.getString(KV_KEYS.onboardingNotif)) {
        kv.setString(KV_KEYS.onboardingNotif, 'asked');
        if (await requestPushPermission()) void registerDeviceForPush(userId);
      }
    });
  }, [session.status, session.userId, session.role]);

  return (
    <ThemeContext.Provider value={theme}>
      <View {...webDir} style={[styles.fill, { backgroundColor: theme.colors.background }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <OfflineBanner />
        <TenantGate>
          <RootNavigator />
        </TenantGate>
        <ToastHost />
        {/* expo-notifications' response hooks throw on web (no native module). */}
        {isPushSupported ? <PushRouter /> : null}
        <AlarmRouter />
      </View>
    </ThemeContext.Provider>
  );
}

/**
 * A school or business suspended by the platform owner sees a "paused" screen instead of its
 * workspace (school members read their School row, partners their Business row – both public).
 */
function TenantGate({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const status = useTenantStatus(session.status === 'signedIn' ? session.role : null, session.schoolId);
  if (status === 'SUSPENDED') return <SuspendedScreen />;
  return <>{children}</>;
}

function RootNavigator() {
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  const role = session.role;
  // Mount the guarded stack only once the session is known: with every guard still false the
  // router would redirect the requested URL (web refresh, deep link) to the index screen.
  // The splash screen stays up meanwhile.
  if (session.status === 'loading') return null;
  return (
    <Stack screenOptions={{ headerShown: false, animation: Platform.OS === 'web' ? 'none' : 'default' }}>
      {/* Public: school directory (signed out) / redirect to the workspace (signed in) */}
      <Stack.Screen name="index" />
      <Stack.Screen name="schools/[schoolId]/index" />
      <Stack.Screen name="schools/[schoolId]/apply" />
      <Stack.Screen name="application-status" />
      <Stack.Screen name="explore/[categoryId]" />
      <Stack.Screen name="venues/[venueId]/index" />
      <Stack.Screen name="venues/[venueId]/book" />
      <Stack.Screen name="businesses/[businessId]" />
      {/* The alarm must open from a notification even when the phone is signed out. */}
      <Stack.Screen name="alarm/[tripStopId]" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !role}>
        <Stack.Screen name="onboarding/index" />
        <Stack.Screen name="onboarding/school" />
        <Stack.Screen name="onboarding/business" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && role === 'OWNER'}>
        <Stack.Screen name="(owner)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && role === 'PARTNER'}>
        <Stack.Screen name="(partner)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && role === 'CUSTOMER'}>
        <Stack.Screen name="(customer)" />
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
    if (!lastResponse || session.status === 'loading') return;
    const data = lastResponse.notification.request.content.data as PushData | undefined;
    const isAlarm = data?.type === 'ALARM' || data?.type === 'TEST_ALARM';
    // Alarms open even on a signed-out phone; everything else needs the account.
    if (session.status !== 'signedIn' && !isAlarm) return;
    const id = lastResponse.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    if (data?.type === 'ALARM' && data.tripStopId) show(alarmFromPush(data));
    const route = routeForPush(data, session.role);
    if (route) router.push(route as never);
    void Notifications.clearLastNotificationResponseAsync?.();
  }, [lastResponse, session.status, session.role, router, show]);

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data as PushData | undefined;
      if (data?.type === 'ALARM' && data.tripStopId) show(alarmFromPush(data));
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
