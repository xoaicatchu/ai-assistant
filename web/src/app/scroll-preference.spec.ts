import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_SCROLL_STORAGE_KEY,
  loadAutoScrollPreference,
  saveAutoScrollPreference,
} from './scroll-preference';

describe('auto-scroll preference', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to enabled and remembers a disabled choice', () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);

    expect(loadAutoScrollPreference()).toBe(true);
    saveAutoScrollPreference(false);
    expect(storage.setItem).toHaveBeenCalledWith(AUTO_SCROLL_STORAGE_KEY, '0');
  });

  it('loads an explicitly disabled preference', () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => 'false'), setItem: vi.fn() });

    expect(loadAutoScrollPreference()).toBe(false);
  });
});
