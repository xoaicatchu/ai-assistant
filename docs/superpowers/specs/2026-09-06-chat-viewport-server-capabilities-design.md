# Chat Viewport, Server Status, and Model Capabilities

## Goal

Keep the chat header and composer visible while only the conversation content scrolls, show server health next to the selected server, and expose only models and controls supported by that server/model.

## Design

- The chat shell owns exactly one viewport-height layout (`100dvh`) and hides page overflow while active.
- Header and conversation tabs remain in the non-scrolling flex region. The conversation list is the only vertical scroll container. The composer remains in the final non-scrolling flex region and respects iOS safe-area insets.
- Server health is represented per configured server. The selected server is checked on normal startup/selection; opening the status control checks all configured servers in parallel and displays independent states.
- Model options are scoped to the selected server. Each model carries explicit `vision`, `thinking`, `toolCall`, and `streaming` capabilities. Unknown capabilities default to false. A model unavailable on a newly selected server is replaced by that server's default model.
- Request failures are rendered as an assistant message attached to the failed request. The global bottom error banner is removed for chat request errors; the failed assistant message keeps its replay action.

## Validation

- Unit tests cover viewport layout classes, server-scoped model selection, capability fallback, and inline error state.
- Full frontend tests and Angular production build must pass.
- Backend tests remain green because this change is frontend-only.
