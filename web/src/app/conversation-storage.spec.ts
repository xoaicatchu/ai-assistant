import { afterEach, describe, expect, it, vi } from 'vitest';
import { ViewMessage } from './conversation-state';
import {
  CONVERSATIONS_STORAGE_KEY,
  loadConversationState,
  saveConversationState,
} from './conversation-storage';

const userMessage = (id: number, requestId: number, text: string): ViewMessage => ({
  id,
  requestId,
  role: 'user',
  text,
  status: 'complete',
});

describe('conversation storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists the active tab and restores its messages', () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    };
    vi.stubGlobal('localStorage', storage);

    saveConversationState(
      [
        {
          id: 7,
          title: 'Hà Nội',
          serverId: 'abcdefghijklmnopqrstuv',
          messages: [userMessage(11, 4, 'Thời tiết hôm nay thế nào?')],
        },
      ],
      7,
    );

    const storedValue = storage.setItem.mock.calls[0]?.[1];
    expect(storage.setItem).toHaveBeenCalledWith(CONVERSATIONS_STORAGE_KEY, expect.any(String));
    expect(storedValue).toBeDefined();

    storage.getItem.mockReturnValue(String(storedValue));
    expect(loadConversationState()).toEqual({
      activeConversationId: 7,
      conversations: [
        {
          id: 7,
          title: 'Hà Nội',
          serverId: 'abcdefghijklmnopqrstuv',
          messages: [userMessage(11, 4, 'Thời tiết hôm nay thế nào?')],
        },
      ],
    });
  });

  it('does not restore an unfinished streaming placeholder after a reload', () => {
    const stored = {
      activeConversationId: 1,
      conversations: [
        {
          id: 1,
          title: 'Đang chat',
          messages: [
            userMessage(1, 1, 'Câu hỏi cũ'),
            { id: 2, requestId: 1, role: 'assistant', text: 'Đang trả lời', status: 'pending' },
          ],
        },
      ],
    };
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify(stored)),
      setItem: vi.fn(),
    });

    expect(loadConversationState().conversations[0].messages).toEqual([
      userMessage(1, 1, 'Câu hỏi cũ'),
    ]);
  });

  it('migrates the previous share ID field to the server conversation ID', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({
        activeConversationId: 1,
        conversations: [{
          id: 1,
          title: 'Cũ',
          shareId: 'abcdefghijklmnopqrstuv',
          messages: [userMessage(1, 1, 'Câu hỏi cũ')],
        }],
      })),
      setItem: vi.fn(),
    });

    expect(loadConversationState().conversations[0].serverId).toBe('abcdefghijklmnopqrstuv');
  });

  it('removes the old inline transport error from persisted assistant text', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({
        activeConversationId: 1,
        conversations: [{
          id: 1,
          title: 'Cũ',
          messages: [
            userMessage(1, 1, 'Câu hỏi'),
            { id: 2, requestId: 1, role: 'assistant', text: 'Phần đã nhận\n\n> **Lỗi:** Load failed', status: 'error' },
          ],
        }],
      })),
      setItem: vi.fn(),
    });

    expect(loadConversationState().conversations[0].messages[1].text).toBe('Phần đã nhận');
  });

  it('falls back to a fresh conversation when storage is invalid', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => '{not-json'),
      setItem: vi.fn(),
    });

    expect(loadConversationState()).toEqual({
      activeConversationId: 1,
      conversations: [{ id: 1, title: 'Cuộc trò chuyện mới', messages: [] }],
    });
  });

  it('keeps only one empty conversation and prefers the active empty tab', () => {
    const stored = {
      activeConversationId: 3,
      conversations: [
        { id: 1, title: 'Cuộc trò chuyện mới', messages: [] },
        {
          id: 2,
          title: 'Đã chat',
          messages: [userMessage(1, 1, 'Câu hỏi cũ')],
        },
        { id: 3, title: 'Cuộc trò chuyện mới', messages: [] },
      ],
    };
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify(stored)),
      setItem: vi.fn(),
    });

    const state = loadConversationState();

    expect(state.activeConversationId).toBe(3);
    expect(state.conversations.map((conversation) => conversation.id)).toEqual([2, 3]);
  });
});
