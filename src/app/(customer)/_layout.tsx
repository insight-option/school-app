import React from 'react';
import { Stack } from 'expo-router';
import { useMyBookingsLive } from '../../features/platform';

/** Customer workspace (people who book activities): tabs + booking details. */
export default function CustomerLayout() {
  // Confirmations / declines from the venue update My bookings and the booking page instantly.
  useMyBookingsLive();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="booking/[bookingId]" />
    </Stack>
  );
}
