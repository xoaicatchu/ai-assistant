import { ViewMessage } from '../../domain/conversation/conversation-state';

export interface StoredConversation {
  id: number;
  title: string;
  messages: ViewMessage[];
  serverId?: string;
  serverToken?: string;
  isPublic?: boolean;
  canEdit?: boolean;
  serverSyncedFingerprint?: string;
}

export interface ConversationStateSnapshot {
  activeConversationId: number;
  conversations: StoredConversation[];
}

const DEFAULT_CONVERSATION: StoredConversation = {
  id: 1,
  title: 'Cuộc trò chuyện mới',
  messages: [],
};

export function loadConversationState(): ConversationStateSnapshot {
  // Conversation content is server-owned. The client starts with an empty tab
  // and hydrates it from Redis through the conversation URL when available.
  return freshConversationState();
}

export function saveConversationState(
  conversations: readonly StoredConversation[],
  activeConversationId: number,
): void {
  // Kept as a no-op compatibility seam. Conversation content is written to
  // Redis only when the user explicitly shares the conversation.
  void conversations;
  void activeConversationId;
}

function freshConversationState(): ConversationStateSnapshot {
  return {
    activeConversationId: DEFAULT_CONVERSATION.id,
    conversations: [{ ...DEFAULT_CONVERSATION, messages: [] }],
  };
}
