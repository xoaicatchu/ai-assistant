# Custom SSE Composer Design

## Goal

Make streaming behavior available where a message is sent, simplify the
Customize screen, and prevent the iPhone keyboard from remaining open after a
message is submitted.

## Selected behavior

- Move the existing `streamEnabled` toggle from the Customize panel into the
  Chat composer footer, replacing the static Enter/Shift+Enter shortcut copy.
- Keep the toggle as a runtime-only preference, so it immediately controls
  whether the next request uses SSE or a complete JSON response.
- After a valid message or image is accepted for sending, clear the textarea
  focus explicitly. This lets iOS dismiss the software keyboard while the
  request continues.
- Preserve Enter-to-send and Shift+Enter-for-new-line behavior.
- Remove the Response mode card from Customize; connection testing remains in
  the gateway connection card beside the current health state.
- Keep reset as a secondary action and place the primary Save customization
  action in the final footer after all setup content.

## UI structure

The Chat composer footer contains, from left to right, the image attachment
control and a compact accessible SSE switch; the model picker and send/stop
control remain on the right.

The Customize panel contains backend URL, API key, and custom model routes,
followed by the gateway connection card and any warning. Its final footer
contains the save action as the primary action, with status feedback and reset
as secondary content. The connection test button is visually grouped with the
connection card rather than mixed with save/reset actions.

## Data flow and error handling

No API contract changes are required. The existing `streamEnabled` signal still
selects `ChatService.stream()` or `ChatService.complete()`. The explicit blur
only runs after the message has passed the existing empty-input and model
validation checks; invalid submissions keep the current editing focus.

The existing health status, save/reset normalization, and disabled-while-busy
rules remain unchanged.

## Testing and verification

- Add a focused component behavior test for blurring the composer after a
  valid send while preserving focus on invalid input.
- Add template/component assertions for the SSE control being in the Chat
  composer and absent from the Customize panel where practical.
- Run the frontend unit tests, production build, and `git diff --check`.
- Run the existing .NET test suite to confirm the frontend-only change does not
  affect the gateway.
