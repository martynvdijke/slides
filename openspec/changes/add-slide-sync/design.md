## Context

The event WebSocket (`GET /ws/events/{code}`) already multiplexes several client message types (`answer`, `qa`, `vote`, `identity`, `reaction`, `ping`) and fans out typed broker frames (`refresh`, `reactions`). State is assembled per subscriber by `BuildState` and pushed on any `BroadcastEvent`. The deck side is a Slidev project whose presenter panel (`PresenterPanel.vue`) already authenticates against the admin API and mutates live questions, and `useLiveRoom.ts` owns the single WebSocket per event.

The current slide is inherently ephemeral presentation state: it changes often, matters only while the event is live, and does not need durable storage or per-participant personalization.

## Goals / Non-Goals

**Goals:**
- Broadcast the presenter's current slide index to every subscriber with minimal overhead.
- Show an unobtrusive slide indicator on the audience app and projector.
- Let the presenter panel emit slide changes automatically when navigating the deck.
- Be safe: only an authenticated presenter can move the "current slide".

**Non-Goals:**
- Auto-activating a question from a slide (questions remain host-controlled).
- Persisting slide history or building slide-level analytics now.
- Server-rendered slide previews or thumbnails.

## Decisions

- **Ephemeral in-memory slide cache keyed by event code.** Like the reaction aggregator, store `map[eventCode]{index,total,title}` in the broker (guarded by a mutex). No DB column, no migration. It resets on restart, which is acceptable for live presentation state.
- **New frame kind or direct broadcast.** Add a `slide` broadcast that carries `{index,total,title}` verbatim to all subscribers (do not force a full state rebuild per slide change, mirroring the reactions path). `BuildState` reads the cached slide so late joiners get it too via the normal `state` frame.
- **Inbound `slide` is presenter-only.** The `slide` inbound message is accepted only when the connection is authenticated as an event host (reuse the existing admin/session check available in the WS handler path). Unauthenticated clients get an error envelope and no broadcast. This prevents an audience member from hijacking the indicator.
- **DTO.** Add `CurrentSlide *SlideDTO` to `StateDTO` with `{index,total,title}`; `nil`/omitted when no slide has been reported.
- **Deck emission.** `PresenterPanel.vue` watches the Slidev route/`$slidev.nav.currentPage` (and total) and, when authenticated and open, sends `{type:'slide', index, total}` on change. Throttle to avoid spamming on rapid navigation.
- **Optional question↔slide tag.** Existing `questions.position`/ordering is untouched; if desired, the presenter panel can record the current slide index as a soft tag when creating a question, but this is explicitly optional and out of the core sync path.

## Risks / Trade-offs

- **Auth on the WS.** The participant socket is anonymous today. Enforcing presenter-only `slide` requires the socket to recognize an authenticated session cookie if present; where no session exists, a separate authenticated send path (or the existing admin HTTP broadcast) may be used. Choose the simplest that blocks anonymous spoofing — prefer: accept `slide` on the participant socket only if a valid `meetup_session` cookie is present on the upgrade request.
- **Restart loses slide.** Acceptable; the presenter's next navigation re-broadcasts it.
- **Cross-origin decks.** Slide emission depends on the presenter panel being authenticated against the backend (same CORS/credentials constraints already handled for other panel actions); degrade by hiding the indicator/feature when unavailable.
- **Chattiness.** Throttle slide emits (e.g. coalesce within ~200ms) and keep payloads tiny.
