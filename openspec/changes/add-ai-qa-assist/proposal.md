## Why

During Q&A the wall fills with near-duplicate questions and the presenter cannot triage fast enough. Lightweight AI assistance — clustering duplicates into themes and producing a short presenter digest — reduces cognitive load and is on-brand for an opencode-themed deck. It must be entirely optional: with no provider configured, everything behaves exactly as today.

## What Changes

- Optional AI provider configuration (`AI_ENABLED`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`) gated like OIDC (`aiEnabled()` requires enabled + base URL + key + model).
- Server-side **clustering** of an event's visible Q&A into themes (near-duplicate grouping), computed on demand and cached with a short TTL.
- A **presenter digest**: a short natural-language summary of open questions/themes for the presenter panel.
- Optional per-question **sentiment** label to help hosts read the room.
- Endpoints: `GET /api/admin/events/{id}/qa/clusters` and `POST /api/admin/events/{id}/qa/digest` (admin-authenticated).
- Graceful degradation: when AI is disabled or the provider errors, endpoints return `{enabled:false}` / a clear error and the console simply hides the feature.
- Privacy: only Q&A body text (and optional display name) is sent — never participant tokens or cookies — and only for events the host owns.

## Capabilities

### New Capabilities
- `ai-qa-assist`: Optional AI clustering, digest and sentiment for audience Q&A.

### Modified Capabilities
- (none)

## Impact

- New `server/ai` package (provider client, prompt/parse, in-memory cache) or `server/handlers/ai.go`.
- `server/handlers/admin.go`, `server/main.go` (routes), `server/static/admin.js`, `admin.html`.
- `templates/deck/components/PresenterPanel.vue` + `decks/meetup` mirror (digest/cluster display via `useLiveRoom.ts`).
- Config docs: `README.md`, `.env.example`, `compose.yaml` (pass-through, commented by default).
- No database or dependency changes beyond an optional outbound HTTP client.
