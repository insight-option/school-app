import React from 'react';
import { Stack } from 'expo-router';

export default function TeacherLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="student/[userId]" />
      <Stack.Screen name="send-feedback" />
      <Stack.Screen name="broadcasts" />
    </Stack>
  );
}
