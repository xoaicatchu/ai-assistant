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
