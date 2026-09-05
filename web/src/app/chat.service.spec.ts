import { describe, expect, it, vi } from 'vitest';
import { ChatService } from './chat.service';

describe('ChatService streaming', () => {
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
