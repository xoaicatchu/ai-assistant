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

  it('hides Claude thinking and XML-style web tool markup', () => {
    expect(sanitizeAssistantText(
      '<thinking>Phân tích nội bộ không được hiển thị.</thinking>\n'
      + 'Mình sẽ kiểm tra cho bạn.\n'
      + '<web search><query>từ khóa</query></web search>\n'
      + '<read_url><url>https://example.com</url></read_url>\n'
      + 'Đây là kết quả.',
    )).toBe('Mình sẽ kiểm tra cho bạn.\n\nĐây là kết quả.');
  });

  it('hides legacy search_web and read_webpage markup', () => {
    expect(sanitizeAssistantText(
      '<thinking>nội dung nội bộ</thinking>\n'
      + 'Mình đang đọc repository.\n'
      + '<search_web><query>todolist frontend</query></search_web>\n'
      + '<read_webpage><url>https://github.com/example/repo</url></read_webpage>\n'
      + 'Mình đã xem xong.',
    )).toBe('Mình đang đọc repository.\n\nMình đã xem xong.');
  });

  it('keeps an unfinished hidden block out of the streamed answer', () => {
    expect(sanitizeAssistantText(
      'Đang chuẩn bị.\n<thinking>nội dung riêng tư chưa kết thúc',
    )).toBe('Đang chuẩn bị.');
    expect(sanitizeAssistantText(
      'Đang tìm.\n<web search>query đang được tạo',
    )).toBe('Đang tìm.');
  });

  it('does not leak a partial hidden tag at the end of a delta', () => {
    expect(sanitizeAssistantText('Câu trả lời<thi')).toBe('Câu trả lời');
    expect(sanitizeAssistantText('Câu trả lời</web se')).toBe('Câu trả lời');
  });
});
