import { describe, expect, it, vi } from 'vitest';
import { scrollPageToBottom, scrollToBottom, shouldAutoScroll } from './scrolling';

describe('scrollToBottom', () => {
  it('scrolls the conversation container to its current bottom', () => {
    const scrollTo = vi.fn();

    scrollToBottom({ scrollHeight: 840, scrollTo });

    expect(scrollTo).toHaveBeenCalledWith({ top: 840, behavior: 'smooth' });
  });
});

describe('shouldAutoScroll', () => {
  it('keeps the current position while an assistant response updates', () => {
    expect(shouldAutoScroll('response-update')).toBe(false);
  });

  it('scrolls once after a user action', () => {
    expect(shouldAutoScroll('user-action')).toBe(true);
  });
});

describe('scrollPageToBottom', () => {
  it('uses the browser page scroll instead of a nested conversation scroll area', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('document', { documentElement: { scrollHeight: 1280 } });
    vi.stubGlobal('scrollTo', scrollTo);

    scrollPageToBottom();

    expect(scrollTo).toHaveBeenCalledWith({ top: 1280, behavior: 'smooth' });
    vi.unstubAllGlobals();
  });
});
