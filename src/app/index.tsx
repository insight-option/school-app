import React, { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useSession, useSessionStore } from '../lib/auth/session';
import { homeRouteForRole } from '../lib/auth/routing';
import { ExploreScreen } from '../components/explore/ExploreScreen';

/**
 * Entry. Signed out → Explore (venues, activities, schools; sign in / sign up). Signed in → the
 * user's workspace, or the set-up chooser for a verified account that has no workspace yet.
 * While the session loads the native splash screen is still visible.
 */
export default function Index() {
  const session = useSession();
  const pendingUsername = useSessionStore((s) => s.pendingUsername);
  const returnTo = useSessionStore((s) => s.returnTo);

  if (session.status === 'loading') return null;
  if (session.status === 'signedOut') {
    if (pendingUsername) return <Redirect href="/(auth)/new-password" />;
    return <ExploreScreen mode="guest" />;
  }
  if (!session.role) return <Redirect href={'/onboarding' as never} />;
  if (returnTo) return <Resume to={returnTo} />;
  return <Redirect href={homeRouteForRole(session.role) as never} />;
}

/** Reopens the public page the guest was on before signing in (e.g. a booking) – once. */
function Resume({ to }: { to: string }) {
  useEffect(() => {
    useSessionStore.getState().setReturnTo(null);
  }, []);
  return <Redirect href={to as never} />;
}
