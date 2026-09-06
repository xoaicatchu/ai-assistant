import { afterEach, describe, expect, it, vi } from 'vitest';
import '@angular/compiler';
import { App } from './app';
import { ChatMessage, ChatService } from './chat.service';
import { CONVERSATIONS_STORAGE_KEY } from './conversation-storage';

describe('App message submission', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('scrolls the conversation after submitting a question and keeps streaming enabled', async () => {
    const scrollTo = vi.fn();
    const chatService = {
      health: vi.fn().mockResolvedValue(undefined),
      stream: vi.fn(async (
        _model: string,
        _messages: ChatMessage[],
        _signal: AbortSignal,
        onDelta: (text: string) => void,
      ) => {
        onDelta('Câu trả lời');
      }),
      complete: vi.fn(),
    } as unknown as ChatService;
    const requestAnimationFrame = vi.fn((callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });

    const app = new App(chatService);
    (app as any).conversation = {
      nativeElement: { scrollHeight: 420, scrollTo },
    };
    (app as any).draft.set('Câu hỏi cần gửi');

    await (app as any).send();

    expect(scrollTo).toHaveBeenCalledWith({ top: 420, behavior: 'smooth' });
    expect(chatService.stream).toHaveBeenCalledOnce();
    expect(chatService.complete).not.toHaveBeenCalled();
    expect((app as any).messages()[0].text).toBe('Câu hỏi cần gửi');
  });

  it('uses the Medical Harness Framework brand label', () => {
    const chatService = {
      health: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatService;

    const app = new App(chatService);

    expect((app as any).brandLabel).toBe('MEDICAL HARNESS FRAMEWORK');
  });

  it('restores the active conversation from device storage', () => {
    const stored = {
      activeConversationId: 4,
      conversations: [
        {
          id: 4,
          title: 'Lịch sử cũ',
          messages: [
            { id: 10, requestId: 6, role: 'user', text: 'Câu hỏi cũ', status: 'complete' },
            { id: 11, requestId: 6, role: 'assistant', text: 'Câu trả lời cũ', status: 'complete' },
          ],
        },
      ],
    };
    const storage = {
      getItem: vi.fn((key: string) => key === CONVERSATIONS_STORAGE_KEY ? JSON.stringify(stored) : null),
      setItem: vi.fn(),
    };
    vi.stubGlobal('localStorage', storage);
    const chatService = { health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService;

    const app = new App(chatService);

    expect((app as any).activeConversationId()).toBe(4);
    expect((app as any).messages().map((message: { text: string }) => message.text)).toEqual([
      'Câu hỏi cũ',
      'Câu trả lời cũ',
    ]);
  });
});
