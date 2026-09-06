import { ImageAttachment } from './chat-content';
import { MessageStatus, ViewMessage } from './conversation-state';

export const CONVERSATIONS_STORAGE_KEY = 'medical-harness-agent.conversations.v1';

export interface StoredConversation {
  id: number;
  title: string;
  messages: ViewMessage[];
  shareId?: string;
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
const VALID_MESSAGE_STATUSES: readonly MessageStatus[] = ['pending', 'complete', 'error', 'stopped'];
const MAX_PERSISTED_IMAGE_DATA_URL_LENGTH = 250_000;

export function loadConversationState(): ConversationStateSnapshot {
  const stored = readStorage();
  if (!stored) {
    return freshConversationState();
  }

  try {
    return normalizeState(JSON.parse(stored));
  } catch {
    return freshConversationState();
  }
}

export function saveConversationState(
  conversations: readonly StoredConversation[],
  activeConversationId: number,
): void {
  const normalized = normalizeState({ conversations, activeConversationId });

  try {
    globalThis.localStorage?.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // A large pasted image or disabled browser storage must not break chat.
    try {
      globalThis.localStorage?.setItem(
        CONVERSATIONS_STORAGE_KEY,
        JSON.stringify(stripImages(normalized)),
      );
    } catch {
      // Browser storage can be unavailable in private mode or when disabled.
    }
  }
}

function normalizeState(value: unknown): ConversationStateSnapshot {
  const input = isRecord(value) ? value : {};
  const rawConversations = Array.isArray(input['conversations']) ? input['conversations'] : [];
  const seenIds = new Set<number>();
  const conversations = rawConversations
    .map((conversation) => normalizeConversation(conversation))
    .filter((conversation): conversation is StoredConversation => {
      if (!conversation || seenIds.has(conversation.id)) {
        return false;
      }
      seenIds.add(conversation.id);
      return true;
    });

  if (conversations.length === 0) {
    return freshConversationState();
  }

  const requestedActiveId = positiveInteger(input['activeConversationId']);
  const activeConversationId = requestedActiveId && seenIds.has(requestedActiveId)
    ? requestedActiveId
    : conversations[0].id;

  return { activeConversationId, conversations };
}

function normalizeConversation(value: unknown): StoredConversation | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = positiveInteger(value['id']);
  if (!id) {
    return null;
  }

  const title = typeof value['title'] === 'string'
    ? value['title'].trim().slice(0, 80) || 'Cuộc trò chuyện mới'
    : 'Cuộc trò chuyện mới';
  const shareId = typeof value['shareId'] === 'string' && isOpaqueConversationId(value['shareId'])
    ? value['shareId']
    : undefined;
  const rawMessages = Array.isArray(value['messages']) ? value['messages'] : [];
  const seenMessageIds = new Set<number>();
  const messages = rawMessages
    .map((message) => normalizeMessage(message))
    .filter((message): message is ViewMessage => {
      if (!message || seenMessageIds.has(message.id)) {
        return false;
      }
      seenMessageIds.add(message.id);
      return true;
    });

  return { id, title, messages, ...(shareId ? { shareId } : {}) };
}

function normalizeMessage(value: unknown): ViewMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = positiveInteger(value['id']);
  const requestId = positiveInteger(value['requestId']);
  const role = value['role'] === 'user' || value['role'] === 'assistant' ? value['role'] : null;
  const rawStatus = value['status'];
  const status = VALID_MESSAGE_STATUSES.includes(rawStatus as MessageStatus)
    ? rawStatus as MessageStatus
    : null;
  const text = typeof value['text'] === 'string' ? value['text'] : null;

  if (!id || !requestId || !role || !status || text === null) {
    return null;
  }
  if (role === 'assistant' && status === 'pending') {
    // A pending marker cannot be resumed after a full page navigation.
    return null;
  }

  const image = normalizeImage(value['image']);
  if (role === 'user' && !text && !image) {
    return null;
  }

  return {
    id,
    requestId,
    role,
    text,
    status: role === 'user' ? 'complete' : status,
    ...(image ? { image } : {}),
  };
}

function normalizeImage(value: unknown): ImageAttachment | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const dataUrl = typeof value['dataUrl'] === 'string' ? value['dataUrl'] : '';
  if (!dataUrl.startsWith('data:image/') || dataUrl.length > MAX_PERSISTED_IMAGE_DATA_URL_LENGTH) {
    return undefined;
  }

  const name = typeof value['name'] === 'string' ? value['name'].slice(0, 160) : 'pasted-image';
  const type = typeof value['type'] === 'string' ? value['type'].slice(0, 80) : 'image/*';
  return { dataUrl, name, type };
}

function stripImages(state: ConversationStateSnapshot): ConversationStateSnapshot {
  return {
    activeConversationId: state.activeConversationId,
    conversations: state.conversations.map((conversation) => ({
      ...conversation,
      messages: conversation.messages.map(({ image: _image, ...message }) => message),
    })),
  };
}

function freshConversationState(): ConversationStateSnapshot {
  return {
    activeConversationId: DEFAULT_CONVERSATION.id,
    conversations: [{ ...DEFAULT_CONVERSATION, messages: [] }],
  };
}

function readStorage(): string | null {
  try {
    return globalThis.localStorage?.getItem(CONVERSATIONS_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOpaqueConversationId(value: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/u.test(value);
}
