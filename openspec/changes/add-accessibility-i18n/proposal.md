## Why

The audience app and decks are used one-handed on phones, in dim venues, by a broad audience that includes keyboard/screen-reader users, and increasingly by non-English speakers (the project author is Dutch, and conference audiences are mixed). Improving accessibility and adding localization widens who can participate and is often a procurement requirement for public-sector and enterprise venues.

## What Changes

- **Accessibility (a11y):** ARIA live regions that announce question state, countdown/lock transitions and result reveals; correct roles/labels on interactive controls; focus management when a question opens or results reveal; honor `prefers-reduced-motion` for reactions/podium/countdown animations; documented presenter keyboard shortcuts.
- **Internationalization (i18n):** extract audience/admin UI strings into per-locale catalogs; detect browser language; allow a per-event or per-deck locale override; ship **English** and **Dutch** to start; RTL-ready text direction.
- Server exposes the set of available locales and the resolved locale for a page.
- No change to data or contracts; purely a presentation-layer capability.

## Capabilities

### New Capabilities
- `accessibility`: Keyboard, screen-reader and motion-preference support across audience and projector surfaces.
- `internationalization`: Localized UI strings with language detection and per-event override.

### Modified Capabilities
- (none)

## Impact

- `server/static/*.html`, `admin.js`, `app.js`, `live.js` (ARIA + i18n lookup).
- `templates/deck/components/**` and `decks/meetup/**` (reduced-motion, labels).
- New shared i18n helper + locale catalogs (e.g. `server/static/i18n/{en,nl}.json`).
- `server/main.go` (locales endpoint), `README.md` (accessibility + localization notes).
