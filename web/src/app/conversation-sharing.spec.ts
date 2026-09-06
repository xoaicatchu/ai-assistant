import { describe, expect, it } from 'vitest';
import { StoredConversation } from './conversation-storage';
import { createConversationShareUrl, readConversationShare } from './conversation-sharing';

describe('conversation sharing', () => {
  it('round-trips a conversation without embedding attached image data', () => {
    const conversation: StoredConversation = {
      id: 4,
      title: 'Hà Nội hôm nay',
      messages: [
        {
          id: 10,
          requestId: 6,
          role: 'user',
          text: 'Thời tiết Hà Nội thế nào?',
          status: 'complete',
          image: {
            dataUrl: 'data:image/png;base64,very-private-image-data',
            name: 'private.png',
            type: 'image/png',
          },
        },
        {
          id: 11,
          requestId: 6,
          role: 'assistant',
          text: 'Câu trả lời có dấu tiếng Việt.',
          status: 'complete',
        },
      ],
    };

    const url = createConversationShareUrl(conversation, 'https://example.com/chat?mode=share');

    expect(url).toMatch(/^https:\/\/example\.com\/chat\?mode=share#share=/u);
    expect(url).not.toContain('very-private-image-data');
    expect(readConversationShare(url)).toEqual({
      title: 'Hà Nội hôm nay',
      messages: [
        {
          id: 10,
          requestId: 6,
          role: 'user',
          text: 'Thời tiết Hà Nội thế nào?',
          status: 'complete',
        },
        {
          id: 11,
          requestId: 6,
          role: 'assistant',
          text: 'Câu trả lời có dấu tiếng Việt.',
          status: 'complete',
        },
      ],
    });
  });

  it('ignores malformed or unrelated URL hashes', () => {
    expect(readConversationShare('https://example.com/#other=value')).toBeNull();
    expect(readConversationShare('https://example.com/#share=not-valid-base64')).toBeNull();
  });
});
