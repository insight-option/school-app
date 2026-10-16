import React from 'react';
import { Stack } from 'expo-router';
import { useSession } from '../../lib/auth/session';
import { useMyProfile } from '../../features/profiles';
import { needsHomeLocation } from '../../lib/auth/routing';

/** Student / parent workspace. Home-location onboarding is mandatory before the tabs open. */
export default function StudentLayout() {
  const session = useSession();
  const me = useMyProfile();
  const needsHome = needsHomeLocation(session.role, me.data);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={needsHome}>
        <Stack.Screen name="onboarding/home-location" />
      </Stack.Protected>
      <Stack.Protected guard={!needsHome}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding/notifications" />
        <Stack.Screen name="classmates" />
        <Stack.Screen name="home-location" />
        <Stack.Screen name="course/[courseId]" />
      </Stack.Protected>
    </Stack>
  );
}
