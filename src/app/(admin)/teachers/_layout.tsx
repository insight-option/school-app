import React from 'react';
import { Stack } from 'expo-router';

export default function TeachersStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" />
      <Stack.Screen name="[userId]" />
    </Stack>
  );
}
