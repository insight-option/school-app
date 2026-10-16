import React from 'react';
import { Stack } from 'expo-router';

export default function BusesStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" />
      <Stack.Screen name="[busId]" />
    </Stack>
  );
}
