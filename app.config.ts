import { existsSync } from 'node:fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';

const androidMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? '';
const iosMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY ?? '';
// EAS project (account masta-jazz). The env var wins so forks can point at their own project.
const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || 'e081390e-15bc-4648-8903-133ad6b3eb9b';
// Android push (FCM) needs the Firebase config file in the build. Point GOOGLE_SERVICES_JSON at it
// (EAS "file" env var) or drop google-services.json into the project root; see README §7.
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? (existsSync('./google-services.json') ? './google-services.json' : undefined);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'School Bus',
  slug: 'school-app',
  owner: 'masta-jazz',
  version: '1.0.0',
  scheme: 'schoolbus',
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  // EAS Update: builds and Expo Go load JS updates from this URL. The `sdkVersion` runtime policy
  // keeps every build of the same SDK (and Expo Go) compatible with published updates.
  updates: { url: `https://u.expo.dev/${easProjectId}`, fallbackToCacheTimeout: 0 },
  runtimeVersion: { policy: 'sdkVersion' },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.oneqapp.schoolapp',
    buildNumber: '1',
    infoPlist: {
      UIBackgroundModes: ['location', 'audio', 'remote-notification'],
      NSLocationWhenInUseUsageDescription:
        'Your location is used to set your home pickup point and to show the bus on the map.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'Drivers share the bus location with parents during a trip, including while the app is in the background.',
      NSCameraUsageDescription: 'Take photos and videos to send in chat or attach to feedback.',
      NSMicrophoneUsageDescription: 'Record voice notes to send in chat.',
      NSPhotoLibraryUsageDescription: 'Pick photos and videos to send in chat or attach to feedback.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.oneqapp.schoolapp',
    versionCode: 1,
    googleServicesFile,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.RECORD_AUDIO',
      'android.permission.CAMERA',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.VIBRATE',
      'android.permission.USE_FULL_SCREEN_INTENT',
      'android.permission.WAKE_LOCK',
    ],
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
        dark: { backgroundColor: '#0B1220' },
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Your location is used to set your home pickup point and to show the bus on the map.',
        locationAlwaysAndWhenInUsePermission:
          'Drivers share the bus location with parents during a trip, including while the app is in the background.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/images/notification-icon.png',
        color: '#2563EB',
        defaultChannel: 'default',
        sounds: ['./assets/sounds/alarm.wav'],
        enableBackgroundRemoteNotifications: true,
      },
    ],
    ['expo-audio', { microphonePermission: 'Record voice notes to send in chat.' }],
    [
      'expo-image-picker',
      {
        photosPermission: 'Pick photos and videos to send in chat or attach to feedback.',
        cameraPermission: 'Take photos and videos to send in chat or attach to feedback.',
        microphonePermission: 'Record videos with sound to send in chat.',
      },
    ],
    ['expo-video', { supportsBackgroundPlayback: false, supportsPictureInPicture: false }],
    ['react-native-maps', { androidGoogleMapsApiKey: androidMapsKey, iosGoogleMapsApiKey: iosMapsKey }],
    'expo-localization',
    'expo-web-browser',
    'expo-font',
    './plugins/withAlarmFullScreenIntent.js',
  ],
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: easProjectId },
    schoolId: process.env.EXPO_PUBLIC_SCHOOL_ID ?? 'default',
  },
});
