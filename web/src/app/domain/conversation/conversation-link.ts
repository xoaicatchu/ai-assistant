const CONVERSATION_PATH = /^\/conversation\/([A-Za-z0-9_-]{22})\/?$/u;

export interface ConversationApiMessage {
  id: number;
  requestId: number;
  role: 'user' | 'assistant';
  text: string;
  status: 'complete' | 'error' | 'stopped';
}

export interface ConversationApiDocument {
  id: string;
  title: string;
  messages: ConversationApiMessage[];
  isPublic?: boolean;
  canEdit?: boolean;
}

export function createOpaqueConversationId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const bytes = new Uint8Array(22);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (byte) => alphabet[byte & 63]).join('');
}

export function createConversationUrl(id: string, baseHref: string): string | null {
  if (!isOpaqueConversationId(id) || !baseHref) {
    return null;
  }

  try {
    const url = new URL(baseHref);
    url.pathname = `/conversation/${encodeURIComponent(id)}`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function readConversationId(href: string): string | null {
  if (!href) {
    return null;
  }

  try {
    const pathname = new URL(href).pathname;
    return pathname.match(CONVERSATION_PATH)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isOpaqueConversationId(value: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/u.test(value);
}
