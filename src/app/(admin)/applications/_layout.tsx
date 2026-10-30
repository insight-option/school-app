import React from 'react';
import { Stack } from 'expo-router';

export default function ApplicationsStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[applicationId]" />
    </Stack>
  );
}
