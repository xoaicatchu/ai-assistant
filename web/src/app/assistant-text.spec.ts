import { describe, expect, it } from 'vitest';
import { sanitizeAssistantText } from './assistant-text';

describe('sanitizeAssistantText', () => {
  it('removes a complete tool-call block but keeps the surrounding answer', () => {
    expect(sanitizeAssistantText(
      'Trước đó.\n<tool_call>\nweb_search(query=thời tiết Hà Nội)\n</tool_call>\nSau đó.',
    )).toBe('Trước đó.\n\nSau đó.');
  });

  it('hides an unfinished tool-call block while a provider is streaming', () => {
    expect(sanitizeAssistantText(
      'Đang kiểm tra.\n<tool_call>\nweb_search(query=thời tiết Hà Nội',
    )).toBe('Đang kiểm tra.');
  });

  it('removes standalone function-style tool-call lines and orphan closing markers', () => {
    expect(sanitizeAssistantText(
      'Đang xử lý.\nweb_search(query=thời tiết Hà Nội, num_results=5)\n</tool_call>\nXong.',
    )).toBe('Đang xử lý.\n\nXong.');
  });
});
