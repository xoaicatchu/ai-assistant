import { Injectable } from '@angular/core';
import { apiUrl } from './runtime-config';
import { loadSetupSettings } from './setup-storage';

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

interface ChatResponse {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
}

interface ChatStreamChunk {
  choices?: Array<{
    delta?: { content?: string | null };
  }>;
  error?: { message?: string | null };
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
  ): Promise<void> {
    const response = await this.request(model, messages, true, signal);
    if (!response.body) {
      throw new Error('Gateway did not return a streaming response body.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';

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
  }

  async health(signal: AbortSignal): Promise<void> {
    const response = await fetch(apiUrl('/health'), {
      method: 'GET',
      headers: this.authHeaders(),
      signal,
    });
    if (!response.ok) {
      throw new Error(`Gateway health check failed with HTTP ${response.status}.`);
    }
  }

  private async request(
    model: string,
    messages: ChatMessage[],
    stream: boolean,
    signal: AbortSignal,
  ): Promise<Response> {
    const response = await fetch(apiUrl('/v1/chat/completions'), {
      method: 'POST',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ model, messages, stream }),
      signal,
    });

    if (!response.ok) {
      throw new Error(await this.readError(response));
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
    if (chunk.error?.message) {
      throw new Error(chunk.error.message);
    }
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) {
      onDelta(text);
    }
    return false;
  }
}
