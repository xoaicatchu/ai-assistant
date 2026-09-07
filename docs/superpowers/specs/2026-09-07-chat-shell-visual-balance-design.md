# Chat shell visual balance

## Goal

Make the chat shell feel deliberate and balanced on desktop while preserving the browser-page scroll model, fixed header/footer, streaming controls, and the existing mobile composer behavior.

## Design

- Use one content rail for conversation messages, error notices, and the composer.
- Keep assistant responses on the page surface with no card background. Use the tinted bubble only for user messages so the speaker hierarchy is clear.
- Keep user bubbles right-aligned with a readable maximum width; keep assistant content left-aligned beside its avatar.
- Give header controls and composer controls a shared visual size, reduce endpoint/control crowding, and keep the brand title readable in dark mode.
- Reserve space below the conversation for the fixed composer and use a solid/soft gradient footer surface so the composer does not visually collide with the last response.
- On narrow screens, preserve the same hierarchy with smaller gutters, bounded endpoint labels, and controls that fit without horizontal overflow.

## Validation

- Add a stylesheet contract test for assistant transparency, user-only message surfaces, aligned content rails, and the fixed footer.
- Run the focused UI test, full frontend tests, backend tests, and production build.
- Verify the production deployment after pushing `master`.
