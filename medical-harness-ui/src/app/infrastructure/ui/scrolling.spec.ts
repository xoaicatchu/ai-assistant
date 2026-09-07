import { describe, expect, it, vi } from 'vitest';
import {
  isPageNearBottom,
  restorePageScrollPosition,
  savePageScrollPosition,
  scrollPageToBottom,
  scrollToBottom,
  shouldAutoScroll,
} from './scrolling';

describe('scrollToBottom', () => {
  it('scrolls the conversation container to its current bottom', () => {
    const scrollTo = vi.fn();

    scrollToBottom({ scrollHeight: 840, scrollTo });

    expect(scrollTo).toHaveBeenCalledWith({ top: 840, behavior: 'smooth' });
  });
});

describe('shouldAutoScroll', () => {
  it('follows an assistant response while auto-scroll is enabled', () => {
    expect(shouldAutoScroll('response-update')).toBe(true);
  });

  it('scrolls once after a user action', () => {
    expect(shouldAutoScroll('user-action')).toBe(true);
  });
});

describe('isPageNearBottom', () => {
  it('returns true when the reader is still at the end of the browser page', () => {
    vi.stubGlobal('innerHeight', 700);
    vi.stubGlobal('scrollY', 500);
    vi.stubGlobal('document', { documentElement: { scrollHeight: 1280 } });

    expect(isPageNearBottom()).toBe(true);

    vi.unstubAllGlobals();
  });

  it('returns false after the reader scrolls away from the end', () => {
    vi.stubGlobal('innerHeight', 700);
    vi.stubGlobal('scrollY', 120);
    vi.stubGlobal('document', { documentElement: { scrollHeight: 1280 } });

    expect(isPageNearBottom()).toBe(false);

    vi.unstubAllGlobals();
  });
});

describe('page scroll restoration', () => {
  it('saves the current browser position for the current route', () => {
    const setItem = vi.fn();
    vi.stubGlobal('location', { pathname: '/conversation/example', search: '' });
    vi.stubGlobal('scrollY', 640);
    vi.stubGlobal('sessionStorage', { setItem });

    savePageScrollPosition();

    expect(setItem).toHaveBeenCalledWith('medical-harness.scroll.v1:/conversation/example', '640');
    vi.unstubAllGlobals();
  });

  it('restores the saved position after the conversation has rendered', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('location', { pathname: '/conversation/example', search: '' });
    vi.stubGlobal('sessionStorage', { getItem: vi.fn(() => '640') });
    vi.stubGlobal('scrollTo', scrollTo);
    vi.stubGlobal('requestAnimationFrame', (callback: (timestamp: number) => void) => {
      callback(0);
      return 0;
    });

    restorePageScrollPosition();

    expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'auto' });
    vi.unstubAllGlobals();
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

  it('uses a slower eased animation when requested', () => {
    const requestAnimationFrame = vi.fn();
    vi.stubGlobal('document', { documentElement: { scrollHeight: 1280 } });
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal('scrollY', 200);
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    vi.stubGlobal('performance', { now: vi.fn(() => 1000) });

    scrollPageToBottom(true);

    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
