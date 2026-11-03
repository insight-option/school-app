import React from 'react';
import { Stack } from 'expo-router';

export default function OwnerBillingStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="invoice" />
      <Stack.Screen name="plan" />
    </Stack>
  );
}
