## Why

Audience phones on flaky venue Wi-Fi lose answers when the WebSocket drops. The existing app falls back to REST for the current action but does not buffer or retry, so participants silently lose their input and get no tactile confirmation that it landed. Buffering actions offline and confirming submits with haptics makes participation feel reliable.

## What Changes

- Buffer `answer`, `vote`, and `qa` actions in the audience app when the WebSocket is disconnected.
- Flush the queue in order on reconnect, deduplicating replayed answers with an optional client-generated id.
- Add haptic feedback on successful submit, with a distinct pattern for correct quiz answers.
- Prefer the WebSocket path and keep the existing REST fallback.

## Capabilities

### New Capabilities
- `audience-offline-queue`: Client-side buffering and replay of audience actions across transient disconnections.

### Modified Capabilities
- (none)

## Impact

- `server/static/app.js` (queue, flush, haptics) and `server/static/audience.html`.
- Optional additive `client_uuid` on the `answer` message (server dedup).
- No database or REST contract changes beyond the optional dedup field.
