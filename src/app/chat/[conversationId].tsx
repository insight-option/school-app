import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '../../components/chat/ChatScreen';

export default function ChatRoute() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return <ChatScreen conversationId={String(conversationId)} />;
}
