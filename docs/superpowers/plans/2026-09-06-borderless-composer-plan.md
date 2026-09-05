# Borderless Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove visible borders from the chat textarea and model combobox while preserving all existing chat behavior.

**Architecture:** Keep the existing Angular template and state unchanged. Adjust only the composer CSS selectors in `web/src/app/app.css`, using background transitions for interaction feedback instead of border or focus-ring changes.

**Tech Stack:** Angular 21, plain CSS, Vitest, Angular production build.

## Global Constraints

- Modify only visual styling for `.composer textarea` and `.model-select`.
- Keep the outer `.composer` border, attachment button, send/stop button, and setup controls unchanged.
- Keep existing responsive behavior and model selection behavior unchanged.

---

### Task 1: Remove textarea and combobox borders

**Files:**
- Modify: `web/src/app/app.css:188-213` and `web/src/app/app.css:439-459`
- Test: `web/src/app` existing Vitest suite and Angular production build

**Interfaces:**
- Consumes: Existing `.model-select` and `.composer textarea` styles.
- Produces: Borderless model combobox and message textarea with subtle background interaction states.

- [ ] **Step 1: Update CSS**

Set `border: 0` for `.model-select` and keep the textarea borderless. Replace border-color and box-shadow focus transitions with background transitions only:

```css
.model-select {
  border: 0;
  transition: background 150ms ease;
}

.model-select:hover,
.model-select:focus {
  background: #f7f7f8;
  box-shadow: none;
}

.composer textarea:focus {
  border-color: transparent;
  box-shadow: none;
}
```

- [ ] **Step 2: Run frontend tests**

Run `npm test` from `web/`. Expected: all existing test files and tests pass.

- [ ] **Step 3: Run production build**

Run `npm run build` from `web/`. Expected: Angular production bundle completes successfully.

- [ ] **Step 4: Verify the diff**

Run `git diff --check`. Expected: no whitespace errors.

- [ ] **Step 5: Commit**

```powershell
git add docs/superpowers/specs/2026-09-06-borderless-composer-design.md docs/superpowers/plans/2026-09-06-borderless-composer-plan.md web/src/app/app.css
git commit -m "style: remove composer control borders"
```
