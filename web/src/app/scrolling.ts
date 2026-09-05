export interface ScrollContainer {
  scrollHeight: number;
  scrollTo(options: { top: number; behavior: 'auto' | 'smooth' }): void;
}

export function scrollToBottom(container: ScrollContainer): void {
  container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
}
