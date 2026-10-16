/**
 * Expo config plugin: lets the alarm screen show over the lock screen on Android.
 *
 * - Adds USE_FULL_SCREEN_INTENT (declared permission; Android 14+ / Play may ask for justification).
 * - Marks MainActivity with showWhenLocked / turnScreenOn so that when the `bus-alarm` notification
 *   is tapped (or a full-screen intent fires) the activity is shown above the keyguard, screen on.
 *
 * NOTE: expo-notifications does not expose NotificationCompat.setFullScreenIntent(). Posting a true
 * full-screen-intent notification from a *remote* push requires a small native module (see README
 * "Alarm over the lock screen"). This plugin prepares the manifest so that module – or the MAX
 * importance `bus-alarm` channel heads-up notification – opens the alarm screen over the lock screen.
 */
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const withAlarmFullScreenIntent = (config) =>
  withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    AndroidConfig.Permissions.ensurePermissions(manifest, ['android.permission.USE_FULL_SCREEN_INTENT']);
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
    mainActivity.$['android:showWhenLocked'] = 'true';
    mainActivity.$['android:turnScreenOn'] = 'true';
    if (!mainActivity.$['android:launchMode']) {
      mainActivity.$['android:launchMode'] = 'singleTask';
    }
    return mod;
  });

module.exports = withAlarmFullScreenIntent;
