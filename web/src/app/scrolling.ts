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

export function scrollPageToBottom(): void {
  const documentElement = globalThis.document?.documentElement;
  const scrollTo = globalThis.scrollTo;
  if (!documentElement || typeof scrollTo !== 'function') {
    return;
  }

  scrollTo({ top: documentElement.scrollHeight, behavior: 'smooth' });
}
