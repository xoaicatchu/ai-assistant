import type { StoredConversation } from './conversation-storage';
import type { ViewMessage } from './conversation-state';

const SHARE_HASH_KEY = 'share';
const SHARE_VERSION = 1;
const VALID_MESSAGE_STATUSES: readonly ViewMessage['status'][] = ['complete', 'error', 'stopped'];

export type SharedMessage = Omit<ViewMessage, 'image'>;

export interface SharedConversation {
  title: string;
  messages: SharedMessage[];
}

interface SharedPayload {
  version: number;
  title: string;
  messages: SharedMessage[];
}

export function createConversationShareUrl(
  conversation: StoredConversation,
  baseHref: string,
): string | null {
  if (!baseHref) {
    return null;
  }

  try {
    const url = new URL(baseHref);
    const payload: SharedPayload = {
      version: SHARE_VERSION,
      title: conversation.title,
      messages: conversation.messages
        .filter((message) => Boolean(message.text.trim()))
        .filter((message) => message.role === 'user' || message.status !== 'pending')
        .map(({ id, requestId, role, text, status }) => ({ id, requestId, role, text, status })),
    };
    if (payload.messages.length === 0) {
      return null;
    }

    url.hash = `${SHARE_HASH_KEY}=${encodeBase64Url(JSON.stringify(payload))}`;
    return url.toString();
  } catch {
    return null;
  }
}

export function readConversationShare(href: string): SharedConversation | null {
  if (!href) {
    return null;
  }

  try {
    const url = new URL(href);
    const encoded = new URLSearchParams(url.hash.slice(1)).get(SHARE_HASH_KEY);
    if (!encoded) {
      return null;
    }

    const parsed: unknown = JSON.parse(decodeBase64Url(encoded));
    if (!isRecord(parsed) || parsed['version'] !== SHARE_VERSION) {
      return null;
    }

    const title = typeof parsed['title'] === 'string' ? parsed['title'].trim() : '';
    const rawMessages = parsed['messages'];
    if (!title || !Array.isArray(rawMessages)) {
      return null;
    }

    const messages = rawMessages.map(normalizeSharedMessage);
    if (messages.some((message) => message === null)) {
      return null;
    }

    return { title, messages: messages as SharedMessage[] };
  } catch {
    return null;
  }
}

function normalizeSharedMessage(value: unknown): SharedMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = positiveInteger(value['id']);
  const requestId = positiveInteger(value['requestId']);
  const role = value['role'] === 'user' || value['role'] === 'assistant' ? value['role'] : null;
  const status = VALID_MESSAGE_STATUSES.includes(value['status'] as ViewMessage['status'])
    ? value['status'] as ViewMessage['status']
    : null;
  const text = typeof value['text'] === 'string' ? value['text'] : null;

  if (!id || !requestId || !role || !status || text === null || !text.trim()) {
    return null;
  }

  return { id, requestId, role, text, status: role === 'user' ? 'complete' : status };
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
