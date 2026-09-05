import { describe, expect, it } from 'vitest';
import { buildRequestMessages, findAssistantForUser, formatAssistantError, ViewMessage } from './conversation-state';

const user = (id: number, requestId: number, text: string, status: ViewMessage['status'] = 'complete'): ViewMessage => ({
  id,
  requestId,
  role: 'user',
  text,
  status,
});

const assistant = (
  id: number,
  requestId: number,
  text: string,
  status: ViewMessage['status'],
): ViewMessage => ({ id, requestId, role: 'assistant', text, status });

describe('conversation state', () => {
  it('keeps user messages and completed assistant replies but excludes pending or failed replies', () => {
    const messages = [
      user(1, 1, 'Câu hỏi trước'),
      assistant(2, 1, 'Câu trả lời trước', 'complete'),
      user(3, 2, 'Câu hỏi lỗi'),
      assistant(4, 2, '> **Lỗi:** upstream failed', 'error'),
      user(5, 3, 'Câu hỏi đang chạy'),
      assistant(6, 3, 'partial', 'pending'),
    ];

    expect(buildRequestMessages(messages).map((message) => `${message.role}:${message.content}`)).toEqual([
      'user:Câu hỏi trước',
      'assistant:Câu trả lời trước',
      'user:Câu hỏi lỗi',
      'user:Câu hỏi đang chạy',
    ]);
  });

  it('finds the assistant paired to a user message by request id', () => {
    const messages = [
      user(1, 10, 'Một'),
      assistant(2, 10, 'Hai', 'error'),
      user(3, 11, 'Ba'),
      assistant(4, 11, 'Bốn', 'complete'),
    ];

    expect(findAssistantForUser(messages, 1)?.id).toBe(2);
    expect(findAssistantForUser(messages, 3)?.id).toBe(4);
    expect(findAssistantForUser(messages, 99)).toBeNull();
  });

  it('formats an assistant error as a visible Markdown block', () => {
    expect(formatAssistantError('The upstream provider is unavailable.')).toBe(
      '> **Lỗi:** The upstream provider is unavailable.',
    );
  });
});
