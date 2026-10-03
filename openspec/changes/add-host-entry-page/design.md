## Context

`server/main.go` serves a catch-all `GET /` with `http.FileServer(os.DirFS(DECKS_DIR))` (Docker `DECKS_DIR=/app/dist`), so the container root shows the generated deck index. Decks are built under `/<deck>/` base paths (e.g. `/meetup/`), and the index is `dist/index.html`. On GitHub Pages there is no Go server, so nothing here applies to that deploy.

Go 1.22+ `ServeMux` supports the exact-match pattern `GET /{$}`, which is more specific than the `GET /` prefix and therefore wins only for the root path.

## Goals / Non-Goals

**Goals:**
- Root lands on a Host/Audience split entry.
- Signed-in visitors continue to `/admin` without re-login.
- Zero regression for deck subpaths, the deck index, SPA assets, and GitHub Pages.

**Non-Goals:**
- Changing deck builds or the deck index.
- Adding new authentication mechanisms.
- Server-side redirects for authenticated users.

## Decisions

- Register `mux.HandleFunc("GET /{$}", page("entry.html"))` and keep the existing `mux.Handle("GET /", fileServer)`. `/{$}` matches only `/`; all deck subpaths and assets fall through to the file server.
- Perform the signed-in check client-side via `GET /api/auth/me` (credentials same-origin) and redirect with `location.replace("/admin")`. Avoids server redirect/cache loops and keeps the handler trivial.
- Make the auth and setup fetches non-fatal: any failure still renders the Host/Participant choices.
- Reuse the existing design system and keep the page a single embedded static file (no build step).

## Risks / Trade-offs

- Root shadowing decks → covered by explicit verification of `/`, `/meetup/`, `/opencode/`, `/index.html`.
- A brief flash before auto-redirect → mitigated by showing the continue banner immediately and keeping the delay short.
- Client-side redirect is not instantaneous → acceptable; the page is static and cheap.
