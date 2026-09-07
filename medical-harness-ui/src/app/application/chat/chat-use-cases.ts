import type { ChatMessage } from '../../domain/chat/chat-types';
import type {
  ConversationApiDocument,
  ConversationApiMessage,
} from '../../domain/conversation/conversation-link';

export interface ChatGatewayPort {
  complete(model: string, messages: ChatMessage[], signal: AbortSignal): Promise<string>;
  stream(
    model: string,
    messages: ChatMessage[],
    signal: AbortSignal,
    onDelta: (text: string) => void,
    onRecovered?: (text: string) => void,
  ): Promise<void>;
  health(signal: AbortSignal, baseUrl?: string): Promise<void>;
  createConversation(
    title: string,
    messages: readonly ConversationApiMessage[],
    requestedId?: string,
  ): Promise<{ id: string; ownerToken: string; isPublic?: boolean }>;
  getConversation(id: string, ownerToken?: string): Promise<ConversationApiDocument>;
  updateConversation(
    id: string,
    title: string,
    messages: readonly ConversationApiMessage[],
    ownerToken?: string,
  ): Promise<ConversationApiDocument>;
  publishConversation(id: string, ownerToken?: string): Promise<ConversationApiDocument>;
}

/** Application use cases. Transport details remain behind ChatGatewayPort. */
export class ChatUseCases {
  constructor(private readonly gateway: ChatGatewayPort) {}

  complete(...args: Parameters<ChatGatewayPort['complete']>) {
    return this.gateway.complete(...args);
  }

  stream(...args: Parameters<ChatGatewayPort['stream']>) {
    return this.gateway.stream(...args);
  }

  health(...args: Parameters<ChatGatewayPort['health']>) {
    return this.gateway.health(...args);
  }

  createConversation(...args: Parameters<ChatGatewayPort['createConversation']>) {
    return this.gateway.createConversation(...args);
  }

  getConversation(...args: Parameters<ChatGatewayPort['getConversation']>) {
    return this.gateway.getConversation(...args);
  }

  updateConversation(...args: Parameters<ChatGatewayPort['updateConversation']>) {
    return this.gateway.updateConversation(...args);
  }

  publishConversation(...args: Parameters<ChatGatewayPort['publishConversation']>) {
    return this.gateway.publishConversation(...args);
  }
}
