import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSession, useSessionStore } from '../lib/auth/session';
import { homeRouteForRole } from '../lib/auth/routing';
import { useTheme } from '../ui/theme';

/** Entry: wait for the session, then send the user to their workspace (or sign-in). */
export default function Index() {
  const session = useSession();
  const pendingUsername = useSessionStore((s) => s.pendingUsername);
  const { colors } = useTheme();

  if (session.status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  if (session.status === 'signedOut') return <Redirect href={pendingUsername ? '/(auth)/new-password' : '/(auth)/sign-in'} />;
  if (!session.role) return <Redirect href="/(auth)/sign-in" />;
  return <Redirect href={homeRouteForRole(session.role) as never} />;
}
