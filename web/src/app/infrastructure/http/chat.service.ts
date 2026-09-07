import { Injectable } from '@angular/core';
import { apiUrl, serverApiUrl } from './runtime-config';
import type { ConversationApiDocument, ConversationApiMessage } from '../../domain/conversation/conversation-link';
import { loadSetupSettings, normalizeGatewayBaseUrl } from '../browser/setup-storage';
import type { ChatMessage } from '../../domain/chat/chat-types';

export type { ChatMessage, ChatMessageContent, ChatMessagePart, ChatRole } from '../../domain/chat/chat-types';

interface ChatResponse {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
}

interface ChatStreamChunk {
  choices?: Array<{
    delta?: { content?: string | null };
  }>;
  error?: { code?: string | null; message?: string | null };
}

class ChatStreamError extends Error {
  constructor(message: string, readonly code?: string | null) {
    super(message);
    this.name = 'ChatStreamError';
  }
}

export class ConversationRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ConversationRequestError';
  }
}

export interface ConversationCreated {
  id: string;
  ownerToken: string;
  isPublic?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  async complete(model: string, messages: ChatMessage[], signal: AbortSignal): Promise<string> {
    const response = await this.request(model, messages, false, signal);
    const payload = (await response.json()) as ChatResponse;
    return payload.choices?.[0]?.message?.content ?? '';
  }

  async stream(
    model: string,
    messages: ChatMessage[],
    signal: AbortSignal,
    onDelta: (text: string) => void,
    onRecovered: (text: string) => void = onDelta,
  ): Promise<void> {
    let response: Response;
    try {
      response = await this.request(model, messages, true, signal);
    } catch (caughtError) {
      if (!signal.aborted && this.isTransientTransportError(caughtError)) {
        await this.recoverWithCompletion(model, messages, signal, onRecovered);
        return;
      }

      throw this.toGatewayError(caughtError);
    }
    if (!response.body) {
      throw new Error('Gateway did not return a streaming response body.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? '';

        for (const line of lines) {
          if (this.consumeSseLine(line, onDelta)) {
            await reader.cancel();
            return;
          }
        }

        if (done) {
          if (pending) {
            this.consumeSseLine(pending, onDelta);
          }
          return;
        }
      }
    } catch (caughtError) {
      if (!signal.aborted && this.isTransientTransportError(caughtError)) {
        try {
          await reader.cancel();
        } catch {
          // The reader may already be closed after a transport failure.
        }
        await this.recoverWithCompletion(model, messages, signal, onRecovered);
        return;
      }

      throw this.toGatewayError(caughtError);
    }
  }

  async health(signal: AbortSignal, baseUrl?: string): Promise<void> {
    const normalizedBaseUrl = baseUrl === undefined ? null : normalizeGatewayBaseUrl(baseUrl);
    const healthUrl = normalizedBaseUrl === null
      ? apiUrl('/health')
      : `${normalizedBaseUrl || '/api'}/health`;
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: this.authHeaders(),
      signal,
    });
    if (!response.ok) {
      if (response.status === 404 || response.status === 405) {
        const compatibleUrl = normalizedBaseUrl === null
          ? apiUrl('/v1/models')
          : `${normalizedBaseUrl || '/api'}${normalizedBaseUrl?.endsWith('/v1') ? '/models' : '/v1/models'}`;
        const compatibleResponse = await fetch(compatibleUrl, {
          method: 'GET',
          headers: this.authHeaders(),
          signal,
        });
        if (compatibleResponse.ok) {
          return;
        }
      }

      throw new Error(`Gateway health check failed with HTTP ${response.status}.`);
    }
  }

  async createConversation(
    title: string,
    messages: readonly ConversationApiMessage[],
    requestedId?: string,
  ): Promise<ConversationCreated> {
    const response = await this.requestConversation('/conversations', 'POST', {
      ...(requestedId ? { id: requestedId } : {}),
      title,
      messages,
    });
    const payload = (await response.json()) as Partial<ConversationCreated>;
    if (!payload.id || !payload.ownerToken) {
      throw new Error('The server did not return conversation ownership details.');
    }
    return { id: payload.id, ownerToken: payload.ownerToken, isPublic: payload.isPublic };
  }

  async getConversation(id: string, ownerToken?: string): Promise<ConversationApiDocument> {
    const response = await this.requestConversation(
      `/conversations/${encodeURIComponent(id)}`,
      'GET',
      undefined,
      ownerToken,
    );
    return (await response.json()) as ConversationApiDocument;
  }

  async updateConversation(
    id: string,
    title: string,
    messages: readonly ConversationApiMessage[],
    ownerToken?: string,
  ): Promise<ConversationApiDocument> {
    const response = await this.requestConversation(
      `/conversations/${encodeURIComponent(id)}`,
      'PUT',
      { title, messages },
      ownerToken,
    );
    return (await response.json()) as ConversationApiDocument;
  }

  async publishConversation(id: string, ownerToken?: string): Promise<ConversationApiDocument> {
    const response = await this.requestConversation(
      `/conversations/${encodeURIComponent(id)}/publish`,
      'POST',
      undefined,
      ownerToken,
    );
    return (await response.json()) as ConversationApiDocument;
  }

  private async request(
    model: string,
    messages: ChatMessage[],
    stream: boolean,
    signal: AbortSignal,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(apiUrl('/v1/chat/completions'), {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ model, messages, stream }),
        signal,
      });
    } catch (caughtError) {
      throw this.toGatewayError(caughtError);
    }

    if (!response.ok) {
      throw new Error(await this.readError(response));
    }

    return response;
  }

  private async requestConversation(
    path: string,
    method: 'GET' | 'POST' | 'PUT',
    body?: unknown,
    ownerToken?: string,
  ): Promise<Response> {
    const headers = body === undefined
      ? this.authHeaders()
      : this.authHeaders({ 'Content-Type': 'application/json' });
    if (ownerToken) {
      headers['X-Conversation-Token'] = ownerToken;
    }

    let response: Response;
    try {
      response = await fetch(serverApiUrl(path), {
        method,
        headers,
        credentials: 'include',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (caughtError) {
      throw this.toGatewayError(caughtError);
    }
    if (!response.ok) {
      throw new ConversationRequestError(
        await this.readError(response),
        response.status,
      );
    }
    return response;
  }

  private authHeaders(headers: Record<string, string> = {}): Record<string, string> {
    const apiKey = loadSetupSettings().apiKey;
    return apiKey ? { ...headers, Authorization: `Bearer ${apiKey}` } : headers;
  }

  private async readError(response: Response): Promise<string> {
    const fallback = `Gateway request failed with HTTP ${response.status}.`;
    const text = await response.text();
    if (!text) {
      return fallback;
    }

    try {
      const payload = JSON.parse(text) as { error?: { message?: string } };
      return payload.error?.message || fallback;
    } catch {
      return text;
    }
  }

  private consumeSseLine(line: string, onDelta: (text: string) => void): boolean {
    if (!line.startsWith('data:')) {
      return false;
    }

    const data = line.slice('data:'.length).trim();
    if (!data) {
      return false;
    }
    if (data === '[DONE]') {
      return true;
    }

    const chunk = JSON.parse(data) as ChatStreamChunk;
    if (chunk.error) {
      throw new ChatStreamError(
        chunk.error.message || 'Gateway stream failed.',
        chunk.error.code,
      );
    }
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) {
      onDelta(text);
    }
    return false;
  }

  private async recoverWithCompletion(
    model: string,
    messages: ChatMessage[],
    signal: AbortSignal,
    onRecovered: (text: string) => void,
  ): Promise<void> {
    const text = await this.complete(model, messages, signal);
    if (!text.trim()) {
      throw new Error('Gateway returned an empty response after the streaming connection failed.');
    }
    onRecovered(text);
  }

  private isTransientTransportError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return (
      (error instanceof ChatStreamError && error.code === 'backend_stream_interrupted')
      || /load failed|failed to fetch|networkerror|network request failed|kết nối tới gateway bị gián đoạn/iu.test(error.message)
    );
  }

  private toGatewayError(error: unknown): Error {
    if (this.isAbortError(error)) {
      return error instanceof Error ? error : new Error('Request was cancelled.');
    }
    if (this.isTransientTransportError(error)) {
      return new Error('Kết nối tới gateway bị gián đoạn. Hãy thử gửi lại.');
    }
    return error instanceof Error ? error : new Error('Không thể kết nối tới gateway.');
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
  }
}
