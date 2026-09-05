export function shouldSubmitOnEnter(
  event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'isComposing' | 'keyCode'>,
  isComposing = false,
): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing && !isComposing && event.keyCode !== 229;
}
