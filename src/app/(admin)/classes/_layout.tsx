import React from 'react';
import { Stack } from 'expo-router';

export default function ClassesStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[classId]" />
    </Stack>
  );
}
