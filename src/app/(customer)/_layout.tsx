import React from 'react';
import { Stack } from 'expo-router';

/** Customer workspace (people who book activities): tabs + booking details. */
export default function CustomerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="booking/[bookingId]" />
    </Stack>
  );
}
