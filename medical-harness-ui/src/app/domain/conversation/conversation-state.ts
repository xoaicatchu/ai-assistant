import { ChatMessage } from '../chat/chat-types';
import { sanitizeAssistantText } from '../chat/assistant-text';
import { ImageAttachment, toChatMessage } from '../chat/chat-content';

export type MessageStatus = 'pending' | 'complete' | 'error' | 'stopped';

export interface ViewMessage {
  id: number;
  requestId: number;
  role: 'user' | 'assistant';
  text: string;
  status: MessageStatus;
  image?: ImageAttachment;
}

export function buildRequestMessages(messages: ViewMessage[]): ChatMessage[] {
  return messages
    .filter((message) => message.role === 'user' || (message.status === 'complete' && Boolean(message.text.trim())))
    .map((message) => toChatMessage(
      message.role,
      message.role === 'assistant' ? sanitizeAssistantText(message.text) : message.text,
      message.image?.dataUrl,
    ))
    .filter((message) => {
      if (Array.isArray(message.content)) {
        return message.content.length > 0;
      }

      return Boolean(message.content.trim());
    });
}

export function findAssistantForUser(messages: ViewMessage[], userMessageId: number): ViewMessage | null {
  const userMessage = messages.find((message) => message.id === userMessageId && message.role === 'user');
  if (!userMessage) {
    return null;
  }

  return messages.find((message) => message.role === 'assistant' && message.requestId === userMessage.requestId) ?? null;
}

export function formatAssistantError(message: string): string {
  return `> **Lỗi:** ${message}`;
}
