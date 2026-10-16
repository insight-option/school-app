import React from 'react';
import { Stack } from 'expo-router';

export default function FeedbackStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" />
    </Stack>
  );
}
