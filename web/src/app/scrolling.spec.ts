import { describe, expect, it, vi } from 'vitest';
import { scrollToBottom } from './scrolling';

describe('scrollToBottom', () => {
  it('scrolls the conversation container to its current bottom', () => {
    const scrollTo = vi.fn();

    scrollToBottom({ scrollHeight: 840, scrollTo });

    expect(scrollTo).toHaveBeenCalledWith({ top: 840, behavior: 'smooth' });
  });
});
