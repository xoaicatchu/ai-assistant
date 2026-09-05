import { describe, expect, it, vi } from 'vitest';
import { dismissComposerInput, shouldSubmitOnEnter } from './composer';

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

describe('dismissComposerInput', () => {
  it('blurs the textarea so a mobile keyboard can close after sending', () => {
    const blur = vi.fn();

    dismissComposerInput({ blur });

    expect(blur).toHaveBeenCalledOnce();
  });

  it('does nothing when the composer is not mounted', () => {
    expect(() => dismissComposerInput(undefined)).not.toThrow();
  });
});
