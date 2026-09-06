import { describe, expect, it } from 'vitest';
import { toChatMessage } from './chat-content';

describe('toChatMessage', () => {
  it('keeps a text-only message in the existing string format', () => {
    expect(toChatMessage('user', 'Xin chào')).toEqual({ role: 'user', content: 'Xin chào' });
  });

  it('builds an OpenAI-compatible multimodal message for pasted images', () => {
    expect(toChatMessage('user', 'Ảnh này có gì?', 'data:image/png;base64,AA==')).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'Ảnh này có gì?' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } },
      ],
    });
  });

  it('supports an image-only message', () => {
    expect(toChatMessage('user', '', 'data:image/jpeg;base64,AA==')).toEqual({
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AA==' } }],
    });
  });
});
