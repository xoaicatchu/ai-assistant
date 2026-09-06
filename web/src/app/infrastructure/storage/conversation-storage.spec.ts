import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConversationState, saveConversationState } from './conversation-storage';

describe('conversation storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with an empty tab instead of reading conversation content from browser storage', () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify({
        activeConversationId: 7,
        conversations: [{ id: 7, title: 'Cũ', messages: [{ id: 1, requestId: 1, role: 'user', text: 'Cũ', status: 'complete' }] }],
      })),
      setItem: vi.fn(),
    };
    vi.stubGlobal('localStorage', storage);

    expect(loadConversationState()).toEqual({
      activeConversationId: 1,
      conversations: [{ id: 1, title: 'Cuộc trò chuyện mới', messages: [] }],
    });
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it('never writes conversation content to browser storage', () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);

    saveConversationState([
      { id: 7, title: 'Hà Nội', messages: [] },
    ], 7);

    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
