export type ConversationScrollReason = 'user-action' | 'response-update';

export interface ScrollContainer {
  scrollHeight: number;
  scrollTo(options: { top: number; behavior: 'auto' | 'smooth' }): void;
}

export function shouldAutoScroll(reason: ConversationScrollReason): boolean {
  return reason === 'user-action';
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
