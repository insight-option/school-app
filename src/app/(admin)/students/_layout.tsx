import React from 'react';
import { Stack } from 'expo-router';

export default function StudentsStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" />
      <Stack.Screen name="import" />
      <Stack.Screen name="[userId]" />
    </Stack>
  );
}
