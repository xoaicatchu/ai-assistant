export type ChatRole = 'user' | 'assistant';

export interface ChatTextPart {
  type: 'text';
  text: string;
}

export interface ChatImagePart {
  type: 'image_url';
  image_url: { url: string };
}

export type ChatMessagePart = ChatTextPart | ChatImagePart;
export type ChatMessageContent = string | ChatMessagePart[];

export interface ChatMessage {
  role: ChatRole;
  content: ChatMessageContent;
}
