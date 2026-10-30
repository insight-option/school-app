import React from 'react';
import { Redirect } from 'expo-router';
import { useSession, useSessionStore } from '../lib/auth/session';
import { homeRouteForRole } from '../lib/auth/routing';
import { DirectoryScreen } from '../components/directory/DirectoryScreen';

/**
 * Entry. Signed out → the public school directory (sign in / create my school). Signed in → the
 * user's workspace, or the school set-up wizard for a new account that has no school yet.
 * While the session loads the native splash screen is still visible.
 */
export default function Index() {
  const session = useSession();
  const pendingUsername = useSessionStore((s) => s.pendingUsername);

  if (session.status === 'loading') return null;
  if (session.status === 'signedOut') {
    if (pendingUsername) return <Redirect href="/(auth)/new-password" />;
    return <DirectoryScreen />;
  }
  if (!session.role) return <Redirect href={'/onboarding/school' as never} />;
  return <Redirect href={homeRouteForRole(session.role) as never} />;
}
