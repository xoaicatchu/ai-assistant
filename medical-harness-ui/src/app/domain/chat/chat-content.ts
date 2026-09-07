import { ChatMessage, ChatMessagePart, ChatRole } from './chat-types';

export interface ImageAttachment {
  dataUrl: string;
  name: string;
  type: string;
}

export function toChatMessage(role: ChatRole, text: string, imageDataUrl?: string): ChatMessage {
  if (!imageDataUrl) {
    return { role, content: text };
  }

  const content: ChatMessagePart[] = [];
  if (text) {
    content.push({ type: 'text', text });
  }
  content.push({ type: 'image_url', image_url: { url: imageDataUrl } });
  return { role, content };
}
