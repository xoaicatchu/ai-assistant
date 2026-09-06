import { describe, expect, it, vi } from 'vitest';
import { ChatService } from './chat.service';

describe('ChatService streaming', () => {
  it('creates a server-backed conversation and returns its opaque ID', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'Abc_123-opaque-id' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const id = await new ChatService().createConversation('Hà Nội', [
      { id: 1, requestId: 1, role: 'user', text: 'Xin chào', status: 'complete' },
    ]);

    expect(id).toBe('Abc_123-opaque-id');
    expect(fetchMock).toHaveBeenCalledWith('/api/conversations', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
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
});
