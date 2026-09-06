import { afterEach, describe, expect, it, vi } from 'vitest';
import '@angular/compiler';
import { App } from './app';
import { ChatMessage, ChatService } from './chat.service';

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
});
