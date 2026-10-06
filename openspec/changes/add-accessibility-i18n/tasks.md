## 1. Accessibility

- [ ] 1.1 Add a polite `aria-live` region to `audience.html` and `live.html`; announce open / lock / reveal transitions only
- [ ] 1.2 Focus management: answer controls on open, results heading on reveal
- [ ] 1.3 Add roles/labels/keyboard operability to audience and projector controls
- [ ] 1.4 Gate reaction/podium/countdown animation on `prefersReducedMotion()`
- [ ] 1.5 Document presenter keyboard shortcuts in `README.md`

## 2. Internationalization

- [ ] 2.1 Add shared `i18n.js` with `t(key, params)` and locale resolution order
- [ ] 2.2 Add `en` and `nl` catalogs under `server/static/i18n/`
- [ ] 2.3 Add `events.locale` via `ensureColumn`; expose locales + resolved locale from `server/main.go`
- [ ] 2.4 Replace hard-coded strings in `app.js`, `live.js`, `admin.js` and their HTML with catalog lookups
- [ ] 2.5 Tests: resolution order, English fallback, catalog completeness for shipped locales

## 3. Deck components

- [ ] 3.1 Apply reduced-motion and labels in `templates/deck/components/**`; mirror to `decks/meetup/**`

## 4. Verification

- [ ] 4.1 `cd server && go build ./... && go test ./...` and `gofmt -l .` clean
- [ ] 4.2 `npm run build` succeeds; manual screen-reader + keyboard pass and Dutch locale check
