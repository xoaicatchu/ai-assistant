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

  it('creates a server ID before the first request and syncs the conversation after streaming', async () => {
    const createConversation = vi.fn().mockResolvedValue({
      id: 'abcdefghijklmnopqrstuv',
      ownerToken: 'owner-token-for-tests',
    });
    const updateConversation = vi.fn().mockResolvedValue({});
    const stream = vi.fn(async (
      _model: string,
      _messages: ChatMessage[],
      _signal: AbortSignal,
      onDelta: (text: string) => void,
    ) => {
      onDelta('Câu trả lời');
    });
    const chatService = {
      health: vi.fn().mockResolvedValue(undefined),
      createConversation,
      updateConversation,
      stream,
    } as unknown as ChatService;
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });

    const app = new App(chatService);
    (app as any).draft.set('Câu hỏi cần lưu');

    await (app as any).send();

    expect(createConversation).toHaveBeenCalledBefore(stream);
    expect(createConversation).toHaveBeenCalledWith('Câu hỏi cần lưu', [
      expect.objectContaining({ role: 'user', text: 'Câu hỏi cần lưu', status: 'complete' }),
    ], expect.any(String));
    expect(updateConversation).toHaveBeenCalledWith(
      'abcdefghijklmnopqrstuv',
      'Câu hỏi cần lưu',
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', text: 'Câu hỏi cần lưu' }),
        expect.objectContaining({ role: 'assistant', text: 'Câu trả lời', status: 'complete' }),
      ]),
      'owner-token-for-tests',
    );
    expect((app as any).conversations()[0].serverId).toBe('abcdefghijklmnopqrstuv');
  });

  it('continues answering when conversation persistence is temporarily unavailable', async () => {
    const createConversation = vi.fn().mockRejectedValue(new Error('Database unavailable'));
    const stream = vi.fn(async (
      _model: string,
      _messages: ChatMessage[],
      _signal: AbortSignal,
      onDelta: (text: string) => void,
    ) => {
      onDelta('Câu trả lời vẫn hiển thị');
    });
    const chatService = {
      health: vi.fn().mockResolvedValue(undefined),
      createConversation,
      stream,
    } as unknown as ChatService;
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });

    const app = new App(chatService);
    (app as any).draft.set('Câu hỏi không được mất');

    await (app as any).send();

    expect(createConversation).toHaveBeenCalledOnce();
    expect(stream).toHaveBeenCalledOnce();
    expect((app as any).messages().map((message: { text: string }) => message.text)).toEqual([
      'Câu hỏi không được mất',
      'Câu trả lời vẫn hiển thị',
    ]);
    expect((app as any).shareMessage()).toContain('chưa đồng bộ');
  });

  it('keeps a transport error out of the assistant message markup', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);
    (app as any).messages.set([
      { id: 1, requestId: 1, role: 'user', text: 'Câu hỏi', status: 'complete' },
      { id: 2, requestId: 1, role: 'assistant', text: 'Phần đã nhận', status: 'pending' },
    ]);
    (app as any).conversations.set([{
      id: 1,
      title: 'Câu hỏi',
      messages: (app as any).messages(),
    }]);

    (app as any).setAssistantError(1, 2, 'Kết nối tới gateway bị gián đoạn. Hãy thử gửi lại.');

    expect((app as any).messages()[1].text).toBe('Phần đã nhận');
    expect((app as any).messages()[1].text).not.toContain('Lỗi:');
    expect((app as any).error()).toContain('Kết nối tới gateway');
  });

  it('uses the Medical Harness Framework brand label', () => {
    const chatService = {
      health: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatService;

    const app = new App(chatService);

    expect((app as any).brandLabel).toBe('MEDICAL HARNESS FRAMEWORK');
  });

  it('renders the protected admin route without starting chat health checks', () => {
    vi.stubGlobal('location', { pathname: '/admin', href: 'https://example.com/admin' });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    const health = vi.fn().mockResolvedValue(undefined);
    const chatService = { health } as unknown as ChatService;

    const app = new App(chatService);

    expect((app as any).isAdminRoute).toBe(true);
    expect(health).not.toHaveBeenCalled();
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

  it('assigns an opaque conversation ID to the URL before the first message', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('location', { href: 'https://example.com/' });
    vi.stubGlobal('history', { replaceState });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });

    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);
    const serverId = (app as any).conversations()[0].serverId;

    expect(serverId).toMatch(/^[A-Za-z0-9_-]{22}$/u);
    expect(replaceState).toHaveBeenCalledWith(
      null,
      '',
      `https://example.com/conversation/${serverId}`,
    );
  });

  it('does not send an image to a known text-only model', async () => {
    const stream = vi.fn();
    const chatService = {
      health: vi.fn().mockResolvedValue(undefined),
      stream,
    } as unknown as ChatService;
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });

    const app = new App(chatService);
    (app as any).model.set('deepseek/deepseek-v4-flash');
    (app as any).draft.set('Đọc ảnh này');
    (app as any).pendingImage.set({
      dataUrl: 'data:image/png;base64,AA==',
      name: 'test.png',
      type: 'image/png',
    });

    await (app as any).send();

    expect(stream).not.toHaveBeenCalled();
    expect((app as any).error()).toContain('không hỗ trợ Vision');
  });

  it('copies a shareable URL for the active conversation on desktop', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const replaceState = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('location', { href: 'https://example.com/' });
    vi.stubGlobal('history', { replaceState });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });

    const chatService = {
      health: vi.fn().mockResolvedValue(undefined),
      createConversation: vi.fn().mockResolvedValue({
        id: 'abcdefghijklmnopqrstuv',
        ownerToken: 'owner-token-for-tests',
      }),
      updateConversation: vi.fn().mockResolvedValue({}),
      publishConversation: vi.fn().mockResolvedValue({
        id: 'abcdefghijklmnopqrstuv',
        isPublic: true,
      }),
    } as unknown as ChatService;
    const app = new App(chatService);
    (app as any).messages.set([
      { id: 1, requestId: 1, role: 'user', text: 'Câu hỏi chia sẻ', status: 'complete' },
      { id: 2, requestId: 1, role: 'assistant', text: 'Câu trả lời chia sẻ', status: 'complete' },
    ]);

    await (app as any).shareActiveConversation();

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toBe('https://example.com/conversation/abcdefghijklmnopqrstuv');
    expect(chatService.createConversation).toHaveBeenCalledOnce();
    expect(replaceState).toHaveBeenCalledTimes(3);
    expect((app as any).shareMessage()).toContain('Đã sao chép');
    expect(chatService.publishConversation).toHaveBeenCalledWith(
      'abcdefghijklmnopqrstuv',
      'owner-token-for-tests',
    );
  });

  it('loads a shared conversation from its server ID without removing the URL', async () => {
    const replaceState = vi.fn();
    vi.stubGlobal('location', { href: 'https://example.com/conversation/abcdefghijklmnopqrstuv' });
    vi.stubGlobal('history', { replaceState });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });

    const chatService = {
      health: vi.fn().mockResolvedValue(undefined),
      getConversation: vi.fn().mockResolvedValue({
        id: 'abcdefghijklmnopqrstuv',
        title: 'Cuộc trò chuyện được gửi',
        messages: [
          { id: 20, requestId: 8, role: 'user', text: 'Nội dung gửi cho người khác', status: 'complete' },
          { id: 21, requestId: 8, role: 'assistant', text: 'Nội dung đã chia sẻ', status: 'complete' },
        ],
      }),
    } as unknown as ChatService;
    const app = new App(chatService);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect((app as any).messages().map((message: { text: string }) => message.text)).toEqual([
      'Nội dung gửi cho người khác',
      'Nội dung đã chia sẻ',
    ]);
    expect((app as any).conversations()).toHaveLength(1);
    expect((app as any).shareMessage()).toContain('Đã mở cuộc trò chuyện');
    expect(chatService.getConversation).toHaveBeenCalledWith('abcdefghijklmnopqrstuv');
    expect(replaceState).not.toHaveBeenCalled();
  });
});
