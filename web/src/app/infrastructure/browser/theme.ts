export type AppTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'medical-harness-agent.theme.v1';

export function loadTheme(): AppTheme {
  try {
    const stored = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
  } catch {
    // Browser storage may be unavailable.
  }

  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function saveTheme(theme: AppTheme): void {
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Browser storage may be unavailable.
  }
}
