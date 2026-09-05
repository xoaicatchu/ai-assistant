export function shouldSubmitOnEnter(
  event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'isComposing' | 'keyCode'>,
  isComposing = false,
): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing && !isComposing && event.keyCode !== 229;
}

export interface ComposerEnvironment {
  platform?: string;
  userAgent?: string;
  maxTouchPoints?: number;
}

type ComposerSchedule = (callback: () => void) => void;

export function restoreComposerAfterSend(
  input: Pick<HTMLElement, 'blur' | 'focus'> | null | undefined,
  environment: ComposerEnvironment = readComposerEnvironment(),
  schedule: ComposerSchedule = scheduleAfterFrame,
): void {
  if (!input) {
    return;
  }

  if (isAppleMobile(environment)) {
    input.blur();
    schedule(() => input.blur());
    return;
  }

  input.focus();
}

export function dismissComposerOnSubmit(
  input: Pick<HTMLElement, 'blur'> | null | undefined,
  environment: ComposerEnvironment = readComposerEnvironment(),
): void {
  if (input && isAppleMobile(environment)) {
    input.blur();
  }
}

export function focusConversationAfterAppleSubmit(
  target: Pick<HTMLElement, 'focus'> | null | undefined,
  environment: ComposerEnvironment = readComposerEnvironment(),
  schedule: ComposerSchedule = scheduleAfterFrame,
): void {
  if (!target || !isAppleMobile(environment)) {
    return;
  }

  const moveFocus = () => target.focus({ preventScroll: true });
  moveFocus();
  schedule(moveFocus);
}

function scheduleAfterFrame(callback: () => void): void {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => callback());
  }
}

export function focusComposerOnDesktop(
  input: Pick<HTMLElement, 'focus'> | null | undefined,
  environment: ComposerEnvironment = readComposerEnvironment(),
): void {
  if (input && !isAppleMobile(environment)) {
    input.focus();
  }
}

function readComposerEnvironment(): ComposerEnvironment {
  if (typeof navigator === 'undefined') {
    return {};
  }

  return {
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  };
}

function isAppleMobile(environment: ComposerEnvironment): boolean {
  const platform = environment.platform ?? '';
  const userAgent = environment.userAgent ?? '';
  return /iPad|iPhone|iPod/u.test(platform)
    || /iPad|iPhone|iPod/u.test(userAgent)
    || (platform === 'MacIntel' && (environment.maxTouchPoints ?? 0) > 1);
}
