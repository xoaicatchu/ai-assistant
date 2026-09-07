import { afterEach, describe, expect, it, vi } from 'vitest';
import '@angular/compiler';
import { App } from './app';
import { ChatMessage, ChatService, ConversationRequestError } from '../../infrastructure/http/chat.service';
import { setRuntimeApiBaseUrl } from '../../infrastructure/http/runtime-config';

describe('App message submission', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('focuses the composer with slash when focus is outside an editable field', () => {
    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);
    const focus = vi.fn();
    (app as any).composerInput = { nativeElement: { focus } };
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 0;
    });

    const event = { key: '/', ctrlKey: false, metaKey: false, shiftKey: false, target: null, preventDefault: vi.fn() };
    (app as any).onGlobalKeydown(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
  });

  it('creates a conversation with Ctrl+N and closes the active one with Ctrl+W', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 0;
    });
    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);
    const createConversation = vi.spyOn(app as any, 'createConversation');
    const deleteConversation = vi.spyOn(app as any, 'deleteConversation');

    const createEvent = { key: 'n', ctrlKey: true, metaKey: false, shiftKey: false, target: null, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    const closeEvent = { key: 'w', ctrlKey: true, metaKey: false, shiftKey: false, target: null, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    (app as any).onGlobalKeydown(createEvent);
    (app as any).onGlobalKeydown(closeEvent);

    expect(createEvent.preventDefault).toHaveBeenCalledOnce();
    expect(closeEvent.preventDefault).toHaveBeenCalledOnce();
    expect(createConversation).toHaveBeenCalledOnce();
    expect(deleteConversation).toHaveBeenCalledWith(2, expect.anything());
  });

  it('does not use slash while typing in an editable field', () => {
    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);
    const focus = vi.fn();
    (app as any).composerInput = { nativeElement: { focus } };
    const event = { key: '/', ctrlKey: false, metaKey: false, shiftKey: false, target: { tagName: 'TEXTAREA' }, preventDefault: vi.fn() };

    (app as any).onGlobalKeydown(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });

  it('scrolls the browser page after submitting a question and keeps streaming enabled', async () => {
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
    vi.stubGlobal('document', { documentElement: { scrollHeight: 420 } });
    vi.stubGlobal('scrollTo', scrollTo);
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });

    const app = new App(chatService);
    (app as any).draft.set('Câu hỏi cần gửi');

    await (app as any).send();

    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
    expect(chatService.stream).toHaveBeenCalledOnce();
    expect(chatService.complete).not.toHaveBeenCalled();
    expect((app as any).messages()[0].text).toBe('Câu hỏi cần gửi');
  });

  it('persists a normal chat in Redis so its conversation URL survives a reload', async () => {
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

    expect(stream).toHaveBeenCalledOnce();
    expect(createConversation).toHaveBeenCalledOnce();
    expect(updateConversation).toHaveBeenCalledOnce();
    expect((app as any).conversations()[0].serverToken).toBe('owner-token-for-tests');
  });

  it('falls back to a model available on the current server when setup contains a stale model', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({
        gatewayBaseUrl: '',
        customGatewayBaseUrl: 'http://localhost:9000',
        apiKey: '',
        customModels: ['kr/glm-5'],
        selectedModel: 'kr/glm-5',
        selectedModelExplicit: true,
      })),
      setItem: vi.fn(),
    });

    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);

    expect((app as any).model()).toBe('deepseek/deepseek-v4-flash');
    expect((app as any).modelOptions().some((option: { route: string }) => option.route === (app as any).model())).toBe(true);
  });

  it('does not send a model that is hidden by the current server selection', async () => {
    const stream = vi.fn();
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 0;
    });

    const app = new App({
      health: vi.fn().mockResolvedValue(undefined),
      stream,
    } as unknown as ChatService);
    (app as any).draft.set('Câu hỏi');
    (app as any).model.set('kr/glm-5');

    await (app as any).send();

    expect(stream).not.toHaveBeenCalled();
    expect((app as any).error()).toContain('không thuộc server');
  });

  it('continues answering when the conversation store is unavailable', async () => {
    const createConversation = vi.fn();
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

    expect(stream).toHaveBeenCalledOnce();
    expect((app as any).messages().map((message: { text: string }) => message.text)).toEqual([
      'Câu hỏi không được mất',
      'Câu trả lời vẫn hiển thị',
    ]);
    expect((app as any).shareMessage()).toBe('');
  });

  it('renders a transport error inside the failed assistant message', () => {
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

    expect((app as any).messages()[1].text).toContain('Lỗi:');
    expect((app as any).messages()[1].text).toContain('Kết nối tới gateway');
    expect((app as any).messages()[1].status).toBe('error');
    expect((app as any).error()).toBe('');
  });

  it('uses the Medical Harness Framework brand label', () => {
    const chatService = {
      health: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatService;

    const app = new App(chatService);

    expect((app as any).brandLabel).toBe('MEDICAL HARNESS FRAMEWORK');
  });

  it('shows the active chat endpoint instead of a generic server label', () => {
    vi.stubGlobal('location', { origin: 'https://example.com', pathname: '/' });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);

    expect((app as any).selectedEndpointLabel()).toBe('https://example.com/api/v1/chat/completions');
    expect((app as any).serverEndpointLabel('default')).toBe('https://example.com/api/v1/chat/completions');
  });

  it('toggles and saves the dark mode preference', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => 'light'), setItem });
    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);

    expect((app as any).darkMode()).toBe(false);
    (app as any).toggleTheme();

    expect((app as any).darkMode()).toBe(true);
    expect(setItem).toHaveBeenCalledWith('medical-harness-agent.theme.v1', 'dark');
  });

  it('toggles and saves the auto-scroll preference', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem });
    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);

    expect((app as any).autoScroll()).toBe(true);
    (app as any).toggleAutoScroll();

    expect((app as any).autoScroll()).toBe(false);
    expect(setItem).toHaveBeenCalledWith('medical-harness-agent.auto-scroll.v1', '0');
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

  it('does not restore conversation content from device storage', () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify({ activeConversationId: 4 })),
      setItem: vi.fn(),
    };
    vi.stubGlobal('localStorage', storage);
    const chatService = { health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService;

    const app = new App(chatService);

    expect((app as any).activeConversationId()).toBe(1);
    expect((app as any).messages()).toEqual([]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('does not allocate a conversation ID or server record for a blank tab', async () => {
    const replaceState = vi.fn();
    vi.stubGlobal('location', { href: 'https://example.com/' });
    vi.stubGlobal('history', { replaceState });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    const createConversation = vi.fn();

    const app = new App({
      health: vi.fn().mockResolvedValue(undefined),
      createConversation,
    } as unknown as ChatService);
    await Promise.resolve();

    expect((app as any).conversations()[0].serverId).toBeUndefined();
    expect(createConversation).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
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

  it('keeps provider tool-call markup out of the completed assistant message', async () => {
    const stream = vi.fn(async (
      _model: string,
      _messages: ChatMessage[],
      _signal: AbortSignal,
      onDelta: (text: string) => void,
    ) => {
      onDelta('Đang kiểm tra.\n<tool_call>\n');
      onDelta('web_search(query=thời tiết Hà Nội, num_results=5)');
      onDelta('\n</tool_call>\nKết quả từ nguồn web.');
    });
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });

    const app = new App({ health: vi.fn().mockResolvedValue(undefined), stream } as unknown as ChatService);
    (app as any).draft.set('Thời tiết Hà Nội hôm nay');

    await (app as any).send();

    const assistantText = (app as any).messages()[1].text;
    expect(assistantText).toContain('Kết quả từ nguồn web.');
    expect(assistantText).not.toContain('<tool_call>');
    expect(assistantText).not.toContain('web_search');
  });

  it('keeps Claude thinking and web markup out of the UI during streaming', async () => {
    const seenDeltas: string[] = [];
    const stream = vi.fn(async (
      _model: string,
      _messages: ChatMessage[],
      _signal: AbortSignal,
      onDelta: (text: string) => void,
    ) => {
      onDelta('<thinking>nội dung nội bộ</thinking>');
      seenDeltas.push((app as any).messages()[1]?.text ?? '');
      onDelta('\n<web search><query>private query</query></web search>');
      seenDeltas.push((app as any).messages()[1]?.text ?? '');
      onDelta('\nCâu trả lời sạch.');
    });
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });

    const app = new App({ health: vi.fn().mockResolvedValue(undefined), stream } as unknown as ChatService);
    (app as any).draft.set('Đọc repository');

    await (app as any).send();

    expect(seenDeltas.every((text) => !text.includes('<thinking>') && !text.includes('<web search>'))).toBe(true);
    expect((app as any).messages()[1].text).toBe('Câu trả lời sạch.');
  });

  it('disables image paste when the selected model has no Vision capability', async () => {
    const getAsFile = vi.fn();
    const preventDefault = vi.fn();
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });

    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);
    await (app as any).onComposerPaste({
      clipboardData: { items: [{ type: 'image/png', getAsFile }] },
      preventDefault,
    } as unknown as ClipboardEvent);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(getAsFile).not.toHaveBeenCalled();
    expect((app as any).pendingImage()).toBeNull();
    expect((app as any).error()).toContain('không hỗ trợ Vision');
  });

  it('removes an attached image when switching to a model without Vision', () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });

    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);
    (app as any).model.set('x-ai/grok-4.6');
    (app as any).pendingImage.set({
      dataUrl: 'data:image/png;base64,AA==',
      name: 'test.png',
      type: 'image/png',
    });

    (app as any).onModelChange('deepseek/deepseek-v4-flash');

    expect((app as any).pendingImage()).toBeNull();
    expect((app as any).model()).toBe('deepseek/deepseek-v4-flash');
    expect((app as any).error()).toContain('Đã bỏ ảnh');
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
    expect(replaceState).toHaveBeenCalledTimes(2);
    expect((app as any).shareMessage()).toContain('Đã sao chép');
    expect(chatService.publishConversation).toHaveBeenCalledWith(
      'abcdefghijklmnopqrstuv',
      'owner-token-for-tests',
    );
  });

  it('copies an assistant answer and keeps the feedback attached to that answer', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });

    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);
    (app as any).messages.set([
      { id: 1, requestId: 1, role: 'user', text: 'Câu hỏi', status: 'complete' },
      { id: 2, requestId: 1, role: 'assistant', text: 'Câu trả lời cần copy', status: 'complete' },
    ]);

    await (app as any).copyAssistantMessage(2);

    expect(writeText).toHaveBeenCalledWith('Câu trả lời cần copy');
    expect((app as any).messageActionFeedback()[2]).toEqual({
      text: 'Đã sao chép câu trả lời.',
      tone: 'success',
    });
  });

  it('shows a conversation persistence error below the selected answer action', async () => {
    const replaceState = vi.fn();
    vi.stubGlobal('location', { href: 'https://example.com/' });
    vi.stubGlobal('history', { replaceState });
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });

    const chatService = {
      health: vi.fn().mockResolvedValue(undefined),
      createConversation: vi.fn().mockRejectedValue(new ConversationRequestError(
        'Không thể kết nối PostgreSQL.',
        503,
        'storage_unavailable',
      )),
    } as unknown as ChatService;
    const app = new App(chatService);
    (app as any).messages.set([
      { id: 1, requestId: 1, role: 'user', text: 'Câu hỏi', status: 'complete' },
      { id: 2, requestId: 1, role: 'assistant', text: 'Câu trả lời', status: 'complete' },
    ]);

    await (app as any).shareActiveConversation(2);

    expect((app as any).messageActionFeedback()[2]).toEqual({
      text: 'Không thể lưu cuộc trò chuyện để tạo link chia sẻ.',
      tone: 'error',
    });
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

  it('keeps a shared conversation read-only for the link recipient', async () => {
    vi.stubGlobal('location', { href: 'https://example.com/conversation/abcdefghijklmnopqrstuv' });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 0;
    });
    const stream = vi.fn();
    const chatService = {
      health: vi.fn().mockResolvedValue(undefined),
      getConversation: vi.fn().mockResolvedValue({
        id: 'abcdefghijklmnopqrstuv',
        title: 'Conversation đã chia sẻ',
        messages: [
          { id: 20, requestId: 8, role: 'user', text: 'Câu hỏi công khai', status: 'complete' },
          { id: 21, requestId: 8, role: 'assistant', text: 'Câu trả lời công khai', status: 'complete' },
        ],
      }),
      stream,
    } as unknown as ChatService;
    const app = new App(chatService);
    await new Promise((resolve) => setTimeout(resolve, 0));

    (app as any).draft.set('Không được gửi vào link chia sẻ');
    await (app as any).send();
    await (app as any).replayAssistantMessage(21);
    (app as any).startEditingMessage(20);

    expect((app as any).isSharedConversationReadOnly()).toBe(true);
    expect(stream).not.toHaveBeenCalled();
    expect((app as any).editingMessageId()).toBeNull();
    expect((app as any).messages().map((message: { text: string }) => message.text)).toEqual([
      'Câu hỏi công khai',
      'Câu trả lời công khai',
    ]);
  });

  it('keeps the owner editable after reloading a conversation URL', async () => {
    vi.stubGlobal('location', { href: 'https://example.com/conversation/abcdefghijklmnopqrstuv' });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    const chatService = {
      health: vi.fn().mockResolvedValue(undefined),
      getConversation: vi.fn().mockResolvedValue({
        id: 'abcdefghijklmnopqrstuv',
        title: 'Cuộc trò chuyện của tôi',
        canEdit: true,
        messages: [
          { id: 20, requestId: 8, role: 'user', text: 'Câu hỏi của tôi', status: 'complete' },
        ],
      }),
    } as unknown as ChatService;
    const app = new App(chatService);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect((app as any).isSharedConversationReadOnly()).toBe(false);
    expect((app as any).sharedRouteMessage()).toBe('');
  });

  it('lets the owner share again after reloading a private conversation', async () => {
    const conversationId = 'abcdefghijklmnopqrstuv';
    const writeText = vi.fn().mockResolvedValue(undefined);
    const replaceState = vi.fn();
    vi.stubGlobal('location', { href: `https://example.com/conversation/${conversationId}` });
    vi.stubGlobal('history', { replaceState });
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    const getConversation = vi.fn().mockResolvedValue({
      id: conversationId,
      title: 'Cuộc trò chuyện của tôi',
      canEdit: true,
      messages: [
        { id: 20, requestId: 8, role: 'user', text: 'Câu hỏi của tôi', status: 'complete' },
        { id: 21, requestId: 8, role: 'assistant', text: 'Câu trả lời của tôi', status: 'complete' },
      ],
    });
    const updateConversation = vi.fn().mockResolvedValue({});
    const publishConversation = vi.fn().mockResolvedValue({ id: conversationId, isPublic: true });
    const app = new App({
      health: vi.fn().mockResolvedValue(undefined),
      getConversation,
      updateConversation,
      publishConversation,
    } as unknown as ChatService);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await (app as any).shareActiveConversation(21);

    expect(updateConversation).toHaveBeenCalledWith(
      conversationId,
      'Cuộc trò chuyện của tôi',
      expect.any(Array),
      undefined,
    );
    expect(publishConversation).toHaveBeenCalledWith(conversationId, undefined);
    expect(writeText).toHaveBeenCalledWith(`https://example.com/conversation/${conversationId}`);
  });

  it('allows creating another empty tab before the first message', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });

    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);

    (app as any).createConversation();

    expect((app as any).conversations()).toHaveLength(2);
    expect((app as any).activeConversationId()).toBe(2);
    expect((app as any).messages()).toEqual([]);
    expect((app as any).canCreateConversation()).toBe(true);
  });

  it('hides the new-tab button at three conversations on mobile', () => {
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);
    const conversations = Array.from({ length: 3 }, (_, index) => ({
      id: index + 1,
      title: `Chat ${index + 1}`,
      messages: [],
    }));
    (app as any).conversations.set(conversations);

    expect((app as any).canShowNewConversationButton()).toBe(false);
    expect((app as any).canCreateConversation()).toBe(false);

    (app as any).conversations.set(conversations.slice(0, 2));
    expect((app as any).canShowNewConversationButton()).toBe(true);
    expect((app as any).canCreateConversation()).toBe(true);
  });

  it('creates another empty tab even when an empty tab already exists', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });

    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);
    (app as any).conversations.set([
      {
        id: 1,
        title: 'Đã chat',
        serverId: 'abcdefghijklmnopqrstuv',
        messages: [{ id: 1, requestId: 1, role: 'user', text: 'Câu hỏi', status: 'complete' }],
      },
      { id: 2, title: 'Cuộc trò chuyện mới', serverId: 'zyxwvutsrqponmlkjihgfe', messages: [] },
    ]);
    (app as any).activeConversationId.set(1);
    (app as any).messages.set((app as any).conversations()[0].messages);

    (app as any).createConversation();

    expect((app as any).conversations()).toHaveLength(3);
    expect((app as any).activeConversationId()).toBe(2);
    expect((app as any).messages()).toEqual([]);
  });

  it('does not show the active local chat when a requested conversation link is missing', async () => {
    const remoteId = 'abcdefghijklmnopqrstuv';
    const localMessages = [
      { id: 1, requestId: 1, role: 'user', text: 'Lịch sử local', status: 'complete' },
      { id: 2, requestId: 1, role: 'assistant', text: 'Không được đổ sang link lỗi', status: 'complete' },
    ];
    vi.stubGlobal('location', { href: `https://example.com/conversation/${remoteId}` });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({
        activeConversationId: 1,
        conversations: [{
          id: 1,
          title: 'Chat local',
          serverId: 'zyxwvutsrqponmlkjihgfe',
          messages: localMessages,
        }],
      })),
      setItem: vi.fn(),
    });
    const getConversation = vi.fn().mockRejectedValue(
      new ConversationRequestError('Không tìm thấy conversation.', 404),
    );
    const app = new App({ health: vi.fn().mockResolvedValue(undefined), getConversation } as unknown as ChatService);
    (app as any).conversations.set([{
      id: 1,
      title: 'Chat local',
      serverId: 'zyxwvutsrqponmlkjihgfe',
      messages: localMessages,
    }]);

    expect((app as any).messages()).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect((app as any).messages()).toEqual([]);
    expect((app as any).conversations()[0].messages).toEqual(localMessages);
    expect((app as any).sharedRouteState()).toBe('missing');
    expect((app as any).sharedRouteMessage()).toContain('Không tìm thấy');
    expect(getConversation).toHaveBeenCalledWith(remoteId);
  });

  it('does not let a pending link load overwrite a conversation selected by the user', async () => {
    const remoteId = 'abcdefghijklmnopqrstuv';
    let resolveRemote!: (value: unknown) => void;
    const remoteLoad = new Promise((resolve) => {
      resolveRemote = resolve;
    });
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal('location', { href: `https://example.com/conversation/${remoteId}` });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({
        activeConversationId: 1,
        conversations: [
          {
            id: 1,
            title: 'Cuộc trò chuyện trên link',
            serverId: remoteId,
            serverToken: 'owner-token-that-is-long-enough',
            isPublic: true,
            messages: [{ id: 1, requestId: 1, role: 'user', text: 'Link cũ', status: 'complete' }],
          },
          {
            id: 2,
            title: 'Chat local',
            serverId: 'zyxwvutsrqponmlkjihgfe',
            messages: [{ id: 2, requestId: 2, role: 'user', text: 'Tab đang chọn', status: 'complete' }],
          },
        ],
      })),
      setItem: vi.fn(),
    });
    const getConversation = vi.fn().mockReturnValue(remoteLoad);
    const app = new App({ health: vi.fn().mockResolvedValue(undefined), getConversation } as unknown as ChatService);
    (app as any).conversations.set([
      {
        id: 1,
        title: 'Cuộc trò chuyện trên link',
        serverId: remoteId,
        serverToken: 'owner-token-that-is-long-enough',
        isPublic: true,
        messages: [{ id: 1, requestId: 1, role: 'user', text: 'Link cũ', status: 'complete' }],
      },
      {
        id: 2,
        title: 'Chat local',
        serverId: 'zyxwvutsrqponmlkjihgfe',
        messages: [{ id: 2, requestId: 2, role: 'user', text: 'Tab đang chọn', status: 'complete' }],
      },
    ]);
    (app as any).activeConversationId.set(1);
    (app as any).messages.set((app as any).conversations()[0].messages);

    (app as any).selectConversation(2);
    resolveRemote({
      id: remoteId,
      title: 'Nội dung link đã tải',
      messages: [{ id: 20, requestId: 8, role: 'user', text: 'Không được ghi đè', status: 'complete' }],
    });
    await remoteLoad;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect((app as any).activeConversationId()).toBe(2);
    expect((app as any).messages()[0].text).toBe('Tab đang chọn');
    expect((app as any).sharedRouteState()).toBe('none');
  });

  it('replays an assistant answer from the selected question context', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    const stream = vi.fn(async (
      _model: string,
      requestMessages: ChatMessage[],
      _signal: AbortSignal,
      onDelta: (text: string) => void,
    ) => {
      expect(requestMessages.map((message) => `${message.role}:${message.content}`)).toEqual([
        'user:Câu hỏi trước',
        'assistant:Câu trả lời trước',
        'user:Câu hỏi cần chạy lại',
      ]);
      onDelta('Câu trả lời mới');
    });
    const app = new App({ health: vi.fn().mockResolvedValue(undefined), stream } as unknown as ChatService);
    const messages = [
      { id: 1, requestId: 1, role: 'user', text: 'Câu hỏi trước', status: 'complete' },
      { id: 2, requestId: 1, role: 'assistant', text: 'Câu trả lời trước', status: 'complete' },
      { id: 3, requestId: 2, role: 'user', text: 'Câu hỏi cần chạy lại', status: 'complete' },
      { id: 4, requestId: 2, role: 'assistant', text: 'Câu trả lời chưa ưng ý', status: 'complete' },
      { id: 5, requestId: 3, role: 'user', text: 'Nhánh phía sau bị bỏ', status: 'complete' },
      { id: 6, requestId: 3, role: 'assistant', text: 'Câu trả lời phía sau', status: 'complete' },
    ];
    (app as any).messages.set(messages);
    (app as any).conversations.set([{ id: 1, title: 'Chat', serverId: 'abcdefghijklmnopqrstuv', messages }]);

    await (app as any).replayAssistantMessage(4);

    expect(stream).toHaveBeenCalledOnce();
    expect((app as any).messages().map((message: { text: string }) => message.text)).toEqual([
      'Câu hỏi trước',
      'Câu trả lời trước',
      'Câu hỏi cần chạy lại',
      'Câu trả lời mới',
    ]);
    expect((app as any).messages()[3].status).toBe('complete');
  });

  it('keeps replay available when an assistant request failed without response text', () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);
    (app as any).messages.set([
      { id: 1, requestId: 1, role: 'user', text: 'Câu hỏi lỗi', status: 'complete' },
      { id: 2, requestId: 1, role: 'assistant', text: '', status: 'error' },
    ]);

    expect((app as any).canReplayAssistant(2)).toBe(true);
  });

  it('allows changing the selected model while a response is active', () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);
    (app as any).busy.set(true);

    (app as any).onModelChange('x-ai/grok-4.6');

    expect((app as any).model()).toBe('x-ai/grok-4.6');
  });

  it('hides the new-tab button at five conversations and keeps it below the limit', () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);
    const conversations = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      title: `Chat ${index + 1}`,
      messages: [{ id: index + 1, requestId: index + 1, role: 'user', text: 'Câu hỏi', status: 'complete' }],
    }));
    (app as any).conversations.set(conversations);
    (app as any).activeConversationId.set(1);

    expect((app as any).canShowNewConversationButton()).toBe(false);
    expect((app as any).canCreateConversation()).toBe(false);

    (app as any).conversations.set(conversations.slice(0, 4));
    expect((app as any).canShowNewConversationButton()).toBe(true);
    expect((app as any).canCreateConversation()).toBe(true);
  });

  it('edits a user question and replaces that answer branch on Enter', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 0;
    });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    const stream = vi.fn(async (
      _model: string,
      requestMessages: ChatMessage[],
      _signal: AbortSignal,
      onDelta: (text: string) => void,
    ) => {
      expect(requestMessages.at(-1)?.content).toBe('Câu hỏi đã sửa');
      onDelta('Câu trả lời mới');
    });
    const app = new App({ health: vi.fn().mockResolvedValue(undefined), stream } as unknown as ChatService);
    const messages = [
      { id: 1, requestId: 1, role: 'user', text: 'Câu hỏi cũ', status: 'complete' },
      { id: 2, requestId: 1, role: 'assistant', text: 'Câu trả lời cũ', status: 'complete' },
      { id: 3, requestId: 2, role: 'user', text: 'Nhánh sau', status: 'complete' },
      { id: 4, requestId: 2, role: 'assistant', text: 'Câu trả lời sau', status: 'complete' },
    ];
    (app as any).messages.set(messages);
    (app as any).conversations.set([{ id: 1, title: 'Chat', serverId: 'abcdefghijklmnopqrstuv', messages }]);

    (app as any).startEditingMessage(1);
    (app as any).editingDraft.set('Câu hỏi đã sửa');
    await (app as any).submitEditedMessage(1);

    expect(stream).toHaveBeenCalledOnce();
    expect((app as any).messages().map((message: { text: string }) => message.text)).toEqual([
      'Câu hỏi đã sửa',
      'Câu trả lời mới',
    ]);
    expect((app as any).editingMessageId()).toBeNull();
  });

  it('switches between the default and remembered custom model servers', () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify({
        gatewayBaseUrl: 'http://127.0.0.1:8045/v1',
        customGatewayBaseUrl: 'http://127.0.0.1:8045/v1',
      })),
      setItem: vi.fn(),
    };
    vi.stubGlobal('localStorage', storage);
    const app = new App({ health: vi.fn().mockResolvedValue(undefined) } as unknown as ChatService);

    (app as any).switchServer('default');
    expect((app as any).gatewayBaseUrl()).toBe('');
    expect((app as any).customGatewayBaseUrl()).toBe('http://127.0.0.1:8045/v1');
    expect((app as any).isUsingDefaultServer()).toBe(true);

    (app as any).switchServer('custom');
    expect((app as any).gatewayBaseUrl()).toBe('http://127.0.0.1:8045/v1');
    expect((app as any).isUsingDefaultServer()).toBe(false);
    setRuntimeApiBaseUrl('');
  });
});
