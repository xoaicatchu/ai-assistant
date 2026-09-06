export type ConversationScrollReason = 'user-action' | 'response-update';

const scrollPositionPrefix = 'medical-harness.scroll.v1:';

export interface ScrollContainer {
  scrollHeight: number;
  scrollTo(options: { top: number; behavior: 'auto' | 'smooth' }): void;
}

export function shouldAutoScroll(reason: ConversationScrollReason): boolean {
  return reason === 'user-action' || reason === 'response-update';
}

export function isPageNearBottom(tolerance = 96): boolean {
  const documentElement = globalThis.document?.documentElement;
  if (!documentElement) {
    return true;
  }

  const viewportHeight = typeof globalThis.innerHeight === 'number' ? globalThis.innerHeight : 0;
  const scrollY = typeof globalThis.scrollY === 'number' ? globalThis.scrollY : 0;
  return documentElement.scrollHeight - (scrollY + viewportHeight) <= tolerance;
}

export function savePageScrollPosition(): void {
  const storage = globalThis.sessionStorage;
  if (!storage) {
    return;
  }

  try {
    storage.setItem(scrollPositionKey(), String(Math.max(0, Math.round(globalThis.scrollY ?? 0))));
  } catch {
    // Scroll restoration is optional when storage is blocked by browser privacy settings.
  }
}

export function restorePageScrollPosition(): void {
  const storage = globalThis.sessionStorage;
  const scrollTo = globalThis.scrollTo;
  if (!storage || typeof scrollTo !== 'function') {
    return;
  }

  let savedPosition: number;
  try {
    const value = storage.getItem(scrollPositionKey());
    savedPosition = Number(value);
  } catch {
    return;
  }

  if (!Number.isFinite(savedPosition) || savedPosition < 0) {
    return;
  }

  const restore = () => scrollTo({ top: savedPosition, behavior: 'auto' });
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame!(restore));
  } else {
    restore();
  }
}

function scrollPositionKey(): string {
  const location = globalThis.location;
  return `${scrollPositionPrefix}${location?.pathname ?? '/'}${location?.search ?? ''}`;
}

export function scrollToBottom(container: ScrollContainer): void {
  container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
}

export function scrollPageToBottom(slow = false): void {
  const documentElement = globalThis.document?.documentElement;
  const scrollTo = globalThis.scrollTo;
  if (!documentElement || typeof scrollTo !== 'function') {
    return;
  }

  if (slow && typeof globalThis.requestAnimationFrame === 'function') {
    const start = typeof globalThis.scrollY === 'number' ? globalThis.scrollY : 0;
    const target = documentElement.scrollHeight;
    const startedAt = typeof globalThis.performance?.now === 'function'
      ? globalThis.performance.now()
      : Date.now();
    const duration = 900;
    const animate = (timestamp: number) => {
      const elapsed = (typeof timestamp === 'number' ? timestamp : Date.now()) - startedAt;
      const progress = Math.min(1, Math.max(0, elapsed / duration));
      const eased = 1 - Math.pow(1 - progress, 3);
      scrollTo({ top: start + (target - start) * eased, behavior: 'auto' });
      if (progress < 1) {
        globalThis.requestAnimationFrame!(animate);
      }
    };
    globalThis.requestAnimationFrame(animate);
    return;
  }

  scrollTo({ top: documentElement.scrollHeight, behavior: 'smooth' });
}
