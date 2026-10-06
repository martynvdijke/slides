## Context

The audience app (`server/static/app.js`, `audience.html`) and projector (`live.js`, `live.html`) render dynamic counts and state transitions, and the deck components (`LiveQuestion.vue`, `LiveReactions.vue`, `Podium.vue`, `Leaderboard.vue`) animate them. All UI strings are currently hard-coded English in markup and JS. There is no i18n layer and no explicit ARIA beyond native form controls.

## Goals / Non-Goals

**Goals**
- Make the participant and projector experiences usable with a screen reader and keyboard, and comfortable with reduced motion.
- Localize UI chrome (not authored slide content) with English + Dutch baseline.
- Zero behavior change when JS/assistive tech is absent.

**Non-Goals**
- Translating slide/deck content (author-provided).
- Runtime machine translation.
- Redesigning the visual system.

## Decisions

- **ARIA live regions, not alerts.** A single `aria-live="polite"` region per audience page announces state changes ("Question open", "10 seconds left", "Answers locked", "Results shown"). Countdown text stays visual (`aria-hidden`) to avoid spamming announcements; only phase transitions are announced. Results use an assertive region only on manual reveal.
- **Focus management.** When a question opens, move focus to the first answer control; when results reveal, move focus to the results heading. Preserve focus on disconnect/reconnect.
- **Reduced motion.** Central `prefersReducedMotion()` check gates reactions float, podium animation and the countdown ring's pulsing; static fallbacks remain.
- **i18n helper.** Tiny `t(key, params)` in a shared `i18n.js`; catalogs in `server/static/i18n/<locale>.json`. Locale resolution order: `?lang=` → event override → saved preference → `navigator.language` → server default (en). `GET /api/i18n/locales` lists available locales; `GET /api/i18n/{locale}` serves a catalog (or bunded as static JSON). Missing keys fall back to English.
- **Per-event override.** Host can set `events.locale` (additive column) to force a language for a specific event's audience/projector.
- **RTL readiness.** Use logical CSS properties where touched and set `dir` from the catalog metadata; no RTL locale shipped yet but the seam exists.

## Risks / Trade-offs

- **Announcement noise.** Over-announcing is worse than under-announcing; phase transitions only.
- **Translation burden.** Ship two locales; catalogs are plain JSON and community-extensible.
- **Test surface.** Add a lightweight DOM/string test rather than full AT automation; manual screen-reader pass documented.
