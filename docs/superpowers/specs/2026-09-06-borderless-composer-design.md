# Borderless Composer Design

## Goal

Make the chat composer feel lighter and closer to ChatGPT by removing the visible borders from the message textarea and model combobox without changing chat behavior.

## Design

- The textarea has no visible border in its default, hover, or focus states.
- The model combobox has no visible border in its default, hover, or focus states.
- Focus feedback uses a very subtle background change only, preserving keyboard accessibility through the native focus state without a blue outline or border.
- The outer composer container, attachment controls, send/stop buttons, and setup fields remain unchanged.
- No Angular behavior, model selection logic, API routing, or responsive layout behavior changes.

## Verification

- Run the existing frontend unit tests.
- Build the Angular production bundle.
- Run `git diff --check` before committing.
