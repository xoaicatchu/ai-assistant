# Custom SSE Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the SSE switch in the chat composer, dismiss the iPhone keyboard after a valid send, and make the Customize actions easier to understand with Save at the bottom.

**Architecture:** Keep `streamEnabled` as the existing runtime signal and move only its control from the Customize template into the composer footer. Add a tiny tested composer utility that calls `blur()` on the textarea after the existing input/model validation succeeds. Reorganize the existing Customize markup and CSS without changing API payloads, storage, or health-check behavior.

**Tech Stack:** Angular 21 standalone components, TypeScript, native signals/forms, CSS, Vitest.

## Global Constraints

- The Chat composer footer contains the image attachment control and a compact accessible SSE switch.
- The `streamEnabled` signal still selects `ChatService.stream()` or `ChatService.complete()`.
- Preserve Enter-to-send and Shift+Enter-for-new-line behavior.
- The explicit blur only runs after the message has passed the existing empty-input and model validation checks.
- No API contract changes are required.
- Run the frontend unit tests, production build, and `git diff --check`.
- Run the existing .NET test suite to confirm the frontend-only change does not affect the gateway.

---

### Task 1: Add a failing regression test for mobile composer dismissal

**Files:**
- Modify: `web/src/app/composer.spec.ts`
- Modify: `web/src/app/composer.ts`

**Interfaces:**
- Produces `dismissComposerInput(input: Pick<HTMLElement, 'blur'> | null | undefined): void` for the component to call after accepting a message.

- [ ] **Step 1: Write the failing tests**

Append this suite to `web/src/app/composer.spec.ts` and import the new symbol:

```typescript
import { dismissComposerInput, shouldSubmitOnEnter } from './composer';

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
```

Because this file already imports `describe`, `expect`, and `it` from Vitest,
change that import to include `vi`:

```typescript
import { describe, expect, it, vi } from 'vitest';
```

- [ ] **Step 2: Run the focused test and verify it fails for the missing utility**

Run from `web/`:

```powershell
npm test -- src/app/composer.spec.ts
```

Expected: the test run fails because `dismissComposerInput` is not exported by
`composer.ts` yet.

- [ ] **Step 3: Add the minimal utility implementation**

Add this function to `web/src/app/composer.ts`:

```typescript
export function dismissComposerInput(input: Pick<HTMLElement, 'blur'> | null | undefined): void {
  input?.blur();
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npm test -- src/app/composer.spec.ts
```

Expected: all composer tests pass with zero failures.

- [ ] **Step 5: Commit the tested utility**

```powershell
git add -- web/src/app/composer.ts web/src/app/composer.spec.ts
git commit -m "test: cover mobile composer dismissal"
```

### Task 2: Dismiss the keyboard and move SSE into the Chat composer

**Files:**
- Modify: `web/src/app/app.ts`
- Modify: `web/src/app/app.html`

**Interfaces:**
- Consumes `dismissComposerInput` from `composer.ts`.
- Keeps the existing `streamEnabled()` signal and `runRequest()` branch unchanged.

- [ ] **Step 1: Wire the tested blur utility into valid send flow**

Update the import in `web/src/app/app.ts`:

```typescript
import { dismissComposerInput, shouldSubmitOnEnter } from './composer';
```

In `send()`, immediately after the existing lines that clear `draft` and
`pendingImage`, call:

```typescript
this.draft.set('');
this.pendingImage.set(null);
dismissComposerInput(this.composerInput?.nativeElement);
this.error.set('');
```

Remove the later `this.focusComposer();` call from `send()`. Keep
`focusComposer()` for tab switching and conversation selection, where returning
to Chat should still place the caret in the composer.

- [ ] **Step 2: Replace the shortcut copy with an accessible SSE switch**

In `web/src/app/app.html`, replace:

```html
<span class="shortcut">Enter gửi · Shift+Enter xuống dòng</span>
```

with:

```html
<label class="stream-toggle composer-stream-toggle" title="Bật hoặc tắt streaming SSE">
  <input
    type="checkbox"
    [ngModel]="streamEnabled()"
    (ngModelChange)="streamEnabled.set($event)"
    [disabled]="busy()"
    name="composer-streaming"
    aria-label="Streaming SSE"
  />
  <span class="toggle-track" aria-hidden="true"><span></span></span>
  <span>SSE</span>
</label>
```

Leave the textarea keydown handlers in place so Enter still submits and
Shift+Enter still inserts a line break.

- [ ] **Step 3: Run the focused tests and verify the code still compiles at test level**

Run from `web/`:

```powershell
npm test -- src/app/composer.spec.ts src/app/chat.service.spec.ts
```

Expected: all selected tests pass with zero failures.

- [ ] **Step 4: Commit the behavior and composer control**

```powershell
git add -- web/src/app/app.ts web/src/app/app.html
git commit -m "feat: place SSE control in chat composer"
```

### Task 3: Reorganize the Customize panel actions

**Files:**
- Modify: `web/src/app/app.html`
- Modify: `web/src/app/app.css`

**Interfaces:**
- Uses the existing `checkHealth()`, `resetSetup()`, and
  `saveSetupAndOpenChat()` handlers without changing their behavior.
- Removes only the duplicated Customize response-mode control; SSE is now
  controlled from the Chat composer.

- [ ] **Step 1: Remove the Response mode block from Customize**

Delete the `.setup-option` block containing the `Response mode` text and the
`streamEnabled()` checkbox. The setup grid should contain only the backend URL,
API key, and custom model routes fields.

- [ ] **Step 2: Put connection testing beside connection status**

Change the connection card header to this structure:

```html
<div class="connection-card-header">
  <div class="connection-card-heading">
    <span class="mini-icon grid place-items-center" aria-hidden="true">
      <svg lucideServer class="h-4 w-4" aria-hidden="true"></svg>
    </span>
    <div>
      <p class="eyebrow">GATEWAY CONNECTION</p>
      <h3>{{ healthLabel() }}</h3>
    </div>
  </div>
  <button
    class="secondary-button"
    type="button"
    (click)="checkHealth()"
    [disabled]="health() === 'checking'"
  >
    <svg lucideRefreshCw class="h-3.5 w-3.5" aria-hidden="true"></svg>
    Kiểm tra
  </button>
</div>
```

Remove the old standalone `Kiểm tra kết nối` button from `.setup-footer`.

- [ ] **Step 3: Make the final footer a clear save area**

Use this final footer after the warning block:

```html
<div class="setup-footer">
  <div class="setup-footer-actions">
    @if (setupMessage()) {
      <span class="setup-message" role="status">{{ setupMessage() }}</span>
    }
    <button class="text-button" type="button" (click)="resetSetup()">
      Khôi phục mặc định
    </button>
  </div>
  <button class="primary-button" type="button" (click)="saveSetupAndOpenChat()">
    <svg lucideShieldCheck class="h-4 w-4" aria-hidden="true"></svg>
    Lưu tùy chỉnh và mở Chat
  </button>
</div>
```

This keeps Save as the last form action while preserving the current behavior
of saving and returning to Chat.

- [ ] **Step 4: Update CSS for the new hierarchy and responsive behavior**

In `web/src/app/app.css`:

1. Remove the unused `.shortcut` and `.setup-option` rules.
2. Keep `.stream-toggle` for the composer switch and add:

```css
.composer-stream-toggle {
  min-width: 0;
}
```

3. Update the connection header and add the test button style:

```css
.connection-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.connection-card-heading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
}

.secondary-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 7px 9px;
  color: #555762;
  font: inherit;
  font-size: 10px;
  font-weight: 700;
  background: #ffffff;
  border: 1px solid #d1d1d6;
  border-radius: 8px;
  cursor: pointer;
}

.secondary-button:hover:not(:disabled) {
  color: #2563eb;
  border-color: #b9ccf8;
  background: #f7faff;
}

.secondary-button:disabled {
  cursor: wait;
  opacity: 0.65;
}
```

4. Make the final footer visually separate and push it to the bottom when
   there is spare vertical space:

```css
.setup-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: auto;
  padding-top: 20px;
  border-top: 1px solid #ececf1;
}
```

5. In the mobile media query, keep the footer stacked and make the save button
   full width:

```css
.setup-footer {
  align-items: stretch;
  flex-direction: column;
}

.setup-footer-actions {
  justify-content: space-between;
}

.setup-footer .primary-button {
  justify-content: center;
}
```

- [ ] **Step 5: Update the frontend README copy**

Replace the sentence that says “Press Enter to send; use Shift+Enter for a new
line.” with:

```text
The composer sends with Enter and inserts a new line with Shift+Enter. Use the
SSE switch beside the attachment control to choose streaming or a complete
response; after sending, the composer releases focus so the iPhone keyboard can
close.
```

- [ ] **Step 6: Run frontend tests and build**

From `web/` run:

```powershell
npm test
npm run build
```

Expected: both commands exit with code 0 and report zero test failures.

- [ ] **Step 7: Run repository verification**

From the repository root run:

```powershell
git diff --check
dotnet test ProxyAgent.slnx --no-restore
```

Expected: `git diff --check` prints no errors and the .NET suite exits with code
0.

- [ ] **Step 8: Commit the Customize redesign**

```powershell
git add -- web/src/app/app.html web/src/app/app.css web/README.md
git commit -m "style: simplify custom setup actions"
```
