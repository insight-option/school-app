import React from 'react';
import { Stack } from 'expo-router';

export default function CoursesStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[courseId]" />
    </Stack>
  );
}
