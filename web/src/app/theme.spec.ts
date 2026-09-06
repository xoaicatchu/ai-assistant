import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTheme, saveTheme, THEME_STORAGE_KEY } from './theme';

describe('theme preference', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the saved theme before consulting the system preference', () => {
    const storage = {
      getItem: vi.fn(() => 'dark'),
      setItem: vi.fn(),
    };
    const matchMedia = vi.fn(() => ({ matches: false }));
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('matchMedia', matchMedia);

    expect(loadTheme()).toBe('dark');
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it('falls back to the system dark preference', () => {
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));

    expect(loadTheme()).toBe('dark');
  });

  it('saves only the selected theme preference', () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);

    saveTheme('dark');

    expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'dark');
  });
});
