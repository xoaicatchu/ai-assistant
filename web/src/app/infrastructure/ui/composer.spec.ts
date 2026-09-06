import { describe, expect, it, vi } from 'vitest';
import {
  dismissComposerOnSubmit,
  focusComposerOnDesktop,
  focusConversationAfterAppleSubmit,
  restoreComposerAfterSend,
  shouldSubmitOnEnter,
} from './composer';

describe('shouldSubmitOnEnter', () => {
  it('submits on Enter without Shift', () => {
    expect(shouldSubmitOnEnter({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13 })).toBe(true);
  });

  it('keeps Shift+Enter for a new line', () => {
    expect(shouldSubmitOnEnter({ key: 'Enter', shiftKey: true, isComposing: false, keyCode: 13 })).toBe(false);
  });

  it('does not submit while IME composition is active', () => {
    expect(shouldSubmitOnEnter({ key: 'Enter', shiftKey: false, isComposing: true, keyCode: 13 })).toBe(false);
  });

  it('does not submit when the browser reports the IME sentinel keyCode', () => {
    expect(shouldSubmitOnEnter({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 229 })).toBe(false);
  });

  it('accepts composition state tracked by the component', () => {
    expect(shouldSubmitOnEnter({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13 }, true)).toBe(false);
  });
});

describe('restoreComposerAfterSend', () => {
  it('blurs the textarea on iPhone so the software keyboard can close', () => {
    const blur = vi.fn();
    const focus = vi.fn();

    restoreComposerAfterSend(
      { blur, focus },
      { platform: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone)', maxTouchPoints: 5 },
    );

    expect(blur).toHaveBeenCalledOnce();
    expect(focus).not.toHaveBeenCalled();
  });

  it('blurs again after the iPhone submit render settles', () => {
    const blur = vi.fn();
    const focus = vi.fn();
    const schedule = vi.fn((callback: () => void) => callback());

    restoreComposerAfterSend(
      { blur, focus },
      { platform: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone)', maxTouchPoints: 5 },
      schedule,
    );

    expect(schedule).toHaveBeenCalledOnce();
    expect(blur).toHaveBeenCalledTimes(2);
    expect(focus).not.toHaveBeenCalled();
  });

  it('keeps the textarea focused on desktop for the next message', () => {
    const blur = vi.fn();
    const focus = vi.fn();

    restoreComposerAfterSend(
      { blur, focus },
      { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 },
    );

    expect(focus).toHaveBeenCalledOnce();
    expect(blur).not.toHaveBeenCalled();
  });

  it('does nothing when the composer is not mounted', () => {
    expect(() => restoreComposerAfterSend(undefined, { platform: 'Win32' })).not.toThrow();
  });
});

describe('focusComposerOnDesktop', () => {
  it('does not programmatically focus the textarea on iPhone', () => {
    const focus = vi.fn();

    focusComposerOnDesktop(
      { focus },
      { platform: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone)', maxTouchPoints: 5 },
    );

    expect(focus).not.toHaveBeenCalled();
  });

  it('focuses the textarea on desktop', () => {
    const focus = vi.fn();

    focusComposerOnDesktop(
      { focus },
      { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 },
    );

    expect(focus).toHaveBeenCalledOnce();
  });
});

describe('dismissComposerOnSubmit', () => {
  it('blurs the active textarea immediately on iPhone Enter', () => {
    const blur = vi.fn();

    dismissComposerOnSubmit(
      { blur },
      { platform: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone)', maxTouchPoints: 5 },
    );

    expect(blur).toHaveBeenCalledOnce();
  });

  it('does not interrupt desktop focus before it is restored', () => {
    const blur = vi.fn();

    dismissComposerOnSubmit(
      { blur },
      { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 },
    );

    expect(blur).not.toHaveBeenCalled();
  });
});

describe('focusConversationAfterAppleSubmit', () => {
  it('moves iPhone focus to the conversation instead of the textarea', () => {
    const focus = vi.fn();

    focusConversationAfterAppleSubmit(
      { focus },
      { platform: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone)', maxTouchPoints: 5 },
    );

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('reasserts conversation focus after the submit render settles', () => {
    const focus = vi.fn();
    const schedule = vi.fn((callback: () => void) => callback());

    focusConversationAfterAppleSubmit(
      { focus },
      { platform: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone)', maxTouchPoints: 5 },
      schedule,
    );

    expect(schedule).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it('does not move desktop focus away from the textarea', () => {
    const focus = vi.fn();

    focusConversationAfterAppleSubmit(
      { focus },
      { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 },
    );

    expect(focus).not.toHaveBeenCalled();
  });
});
