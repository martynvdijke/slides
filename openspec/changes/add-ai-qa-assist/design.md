## Context

Public Q&A is stored in `qa_questions` (body, status, upvotes via `qa_votes`) and surfaced to the host in `admin.js` and to the presenter via `ListPublicQA` (public.go) / the deck's `LiveQa.vue`. Hosts can already flag/hide questions (audience moderation). Configuration follows two established patterns: environment-gated features like OIDC (`oidcEnabled()` in handlers/auth.go requires enabled + issuer + client id + secret) and buffered third-party integrations. There is no outbound LLM call anywhere today.

## Goals / Non-Goals

**Goals**
- Optional, off-by-default Q&A intelligence that never degrades the base experience.
- Bounded, privacy-conscious use of the Q&A corpus.
- Results cached so the presenter panel can poll cheaply.

**Non-Goals**
- Auto-answering or auto-moderating questions.
- Persistent storage of embeddings or scores.
- Feeding deck slide content or participant PII to the provider.

## Decisions

- **Config gating.** `aiEnabled()` mirrors `oidcEnabled()`: true only when `AI_ENABLED=true` **and** `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` are set. `GET /api/admin/events/{id}/qa/clusters` returns `{"enabled":false}` when off so the console can hide controls without a second endpoint.
- **Provider.** One OpenAI-compatible chat-completions client (configurable base URL) behind a tiny interface, so self-hosted models work. No SDK dependency; plain `net/http`.
- **Clustering.** Fetch visible Q&A for the event, send bodies as a numbered list, ask the model to return `{themes:[{title, question_ids:[...]}]}` as strict JSON. Parse defensively; on parse failure return raw questions unclustered with an error note.
- **Digest.** A single prompt producing ≤120 words covering the top themes and most-upvoted question. Cached per event for a short TTL (e.g. 30s) keyed by a hash of the question set + upvotes, so repeated polls do not re-bill.
- **Sentiment.** Optional third call merged into the cluster response (`sentiment` per theme) to avoid extra round-trips.
- **Caching.** In-memory `sync.Map` keyed by `event_id`; invalidated when the Q&A set hash changes or TTL expires. No DB writes.
- **Privacy.** Only `qa_questions.body` and (optionally) `display_name` are transmitted. `AI_BASE_URL`/key are never logged. Docs state that enabling AI sends question text to the configured provider.

## Risks / Trade-offs

- **Vendor variability.** JSON mode may be unavailable on some self-hosted servers; parsing is best-effort and falls back cleanly.
- **Cost/latency.** TTL cache and on-demand invocation bound cost; digest and clusters are separate so hosts can use only one.
- **Prompt injection via question text.** Treat model output as display-only data; never execute or interpolate it into SQL/HTML without escaping (console renders as text).
- **Offline/self-host purity.** AI is opt-in; air-gapped deployments keep it disabled.
