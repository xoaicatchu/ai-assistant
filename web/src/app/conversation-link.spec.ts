import { describe, expect, it } from 'vitest';
import { createConversationUrl, readConversationId } from './conversation-link';

describe('conversation links', () => {
  it('creates a clean server conversation URL without serializing the conversation', () => {
    const result = createConversationUrl('abcdefghijklmnopqrstuv', 'https://example.com/chat#old-share');

    expect(result).toBe('https://example.com/conversation/abcdefghijklmnopqrstuv');
    expect(result).not.toContain('#share');
    expect(result).not.toContain('Xin chào');
  });

  it('reads only valid path IDs and rejects old hash snapshots', () => {
    expect(readConversationId('https://example.com/conversation/abcdefghijklmnopqrstuv')).toBe('abcdefghijklmnopqrstuv');
    expect(readConversationId('https://example.com/#share=eyJ2ZXJzaW9uIjoxfQ')).toBeNull();
    expect(readConversationId('https://example.com/conversation/not valid')).toBeNull();
  });
});
