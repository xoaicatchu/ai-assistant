import { describe, expect, it, vi } from 'vitest';
import { ChatService } from './chat.service';

describe('ChatService streaming', () => {
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
