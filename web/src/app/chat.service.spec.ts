import { describe, expect, it, vi } from 'vitest';
import { ChatService } from './chat.service';
import { setRuntimeApiBaseUrl } from './runtime-config';

describe('ChatService streaming', () => {
  it('creates a server-backed conversation and returns its opaque ID', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        id: 'Abc_123-opaque-id',
        ownerToken: 'owner-token-for-tests',
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const created = await new ChatService().createConversation('Hà Nội', [
      { id: 1, requestId: 1, role: 'user', text: 'Xin chào', status: 'complete' },
    ]);

    expect(created).toEqual({
      id: 'Abc_123-opaque-id',
      ownerToken: 'owner-token-for-tests',
      isPublic: undefined,
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/conversations', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        title: 'Hà Nội',
        messages: [{ id: 1, requestId: 1, role: 'user', text: 'Xin chào', status: 'complete' }],
      }),
    }));
    vi.unstubAllGlobals();
  });

  it('keeps a client-created conversation ID when creating its server record', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        id: 'Abc_123-opaque-id',
        ownerToken: 'owner-token-for-tests',
      }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new ChatService().createConversation(
      'Hà Nội',
      [{ id: 1, requestId: 1, role: 'user', text: 'Xin chào', status: 'complete' }],
      'Abc_123-opaque-id',
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/conversations', expect.objectContaining({
      body: JSON.stringify({
        id: 'Abc_123-opaque-id',
        title: 'Hà Nội',
        messages: [{ id: 1, requestId: 1, role: 'user', text: 'Xin chào', status: 'complete' }],
      }),
    }));
    vi.unstubAllGlobals();
  });

  it('loads a server conversation by ID', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        id: 'Abc_123-opaque-id',
        title: 'Hà Nội',
        messages: [{ id: 1, requestId: 1, role: 'user', text: 'Xin chào', status: 'complete' }],
      }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(new ChatService().getConversation('Abc_123-opaque-id')).resolves.toEqual({
      id: 'Abc_123-opaque-id',
      title: 'Hà Nội',
      messages: [{ id: 1, requestId: 1, role: 'user', text: 'Xin chào', status: 'complete' }],
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/conversations/Abc_123-opaque-id', expect.objectContaining({ method: 'GET' }));
    vi.unstubAllGlobals();
  });

  it('sends the conversation owner token when publishing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        id: 'Abc_123-opaque-id',
        title: 'Hà Nội',
        messages: [],
        isPublic: true,
      }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await new ChatService().publishConversation('Abc_123-opaque-id', 'owner-token');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/conversations/Abc_123-opaque-id/publish',
      expect.objectContaining({
        method: 'POST',
        headers: { 'X-Conversation-Token': 'owner-token' },
      }),
    );
    vi.unstubAllGlobals();
  });

  it('sends the configured API key using the OpenAI bearer header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('data: [DONE]\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({ apiKey: 'sk-test' })),
      setItem: vi.fn(),
    });

    await new ChatService().stream(
      'openai:test-model',
      [{ role: 'user', content: 'Hi' }],
      new AbortController().signal,
      vi.fn(),
    );

    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test',
    });
    vi.unstubAllGlobals();
  });

  it('surfaces an error event emitted after the stream has started', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('data: {"error":{"message":"Tool call failed."}}\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new ChatService().stream(
        'openai:test-model',
        [{ role: 'user', content: 'Hi' }],
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow('Tool call failed.');

    vi.unstubAllGlobals();
  });

  it('recovers a broken SSE transport with one non-streaming completion', async () => {
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Một phần"}}]}\n\n'),
        })
        .mockRejectedValueOnce(new TypeError('Load failed')),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, body: { getReader: () => reader } })
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: 'Câu trả lời đầy đủ' } }],
      }), { status: 200 }));
    const replace = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await new ChatService().stream(
      'openai:test-model',
      [{ role: 'user', content: 'Hi' }],
      new AbortController().signal,
      vi.fn(),
      replace,
    );

    expect(replace).toHaveBeenCalledWith('Câu trả lời đầy đủ');
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({
      body: JSON.stringify({
        model: 'openai:test-model',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
      }),
    }));

    vi.unstubAllGlobals();
  });

  it('recovers when the browser rejects the streaming request before headers arrive', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: 'Câu trả lời khôi phục' } }],
      }), { status: 200 }));
    const replace = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await new ChatService().stream(
      'openai:test-model',
      [{ role: 'user', content: 'Hi' }],
      new AbortController().signal,
      vi.fn(),
      replace,
    );

    expect(replace).toHaveBeenCalledWith('Câu trả lời khôi phục');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });

  it('recognizes a local OpenAI-compatible gateway when /health is unavailable', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    setRuntimeApiBaseUrl('http://127.0.0.1:8045/v1');

    await new ChatService().health(new AbortController().signal);

    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8045/v1/health');
    expect(fetchMock.mock.calls[1][0]).toBe('http://127.0.0.1:8045/v1/models');
    setRuntimeApiBaseUrl('');
    vi.unstubAllGlobals();
  });
});
