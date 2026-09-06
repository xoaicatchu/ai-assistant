export const AUTO_SCROLL_STORAGE_KEY = 'medical-harness-agent.auto-scroll.v1';

export function loadAutoScrollPreference(): boolean {
  try {
    const stored = globalThis.localStorage?.getItem(AUTO_SCROLL_STORAGE_KEY);
    if (stored === '0' || stored === 'false') {
      return false;
    }
    if (stored === '1' || stored === 'true') {
      return true;
    }
  } catch {
    // Browser storage may be unavailable.
  }

  return true;
}

export function saveAutoScrollPreference(value: boolean): void {
  try {
    globalThis.localStorage?.setItem(AUTO_SCROLL_STORAGE_KEY, value ? '1' : '0');
  } catch {
    // Browser storage may be unavailable.
  }
}
