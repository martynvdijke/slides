# Interactive Slides — Mentimeter-style on Slidev default theme

No custom theme package — Slidev's **default theme stays the base**. These 10 interactive layouts (`layouts/poll.vue` … `layouts/grid2x2.vue`) just mash live behaviour onto default styling: they render the live question + results via the existing `LiveQuestion`/`LiveQa` midnight widgets, while the slide itself keeps default theme's look. Each interactive slide maps to a live question via stable `id` → `external_id = "{deck_slug}:{slide_id}"`.

## Authoring contract

Per-slide frontmatter:

```yaml
---
layout: poll          # poll|multi|ranking|yesno|rating|nps|open|wordcloud|qa|grid2x2
interactive: true     # required to be synced (or use a known interactive layout)
id: s03-poll-cicd     # REQUIRED stable slug — NEVER use slide index
prompt: "Where are you on your cloud-native journey?"
options: ["Exploring","Running in prod","Scaling platform"]
kind: poll            # optional explicit kind (else inferred from layout)
points: 100           # -> points_base
correct: 1            # 0-based index, for poll|yesno
timeLimit: 30         # seconds, 0 = untimed
duration: 60          # auto-close after N seconds (host auto-reveal respected)
media: /x.png         # image/video url
activate: auto        # auto (default) | manual — manual skips auto-activate on slide enter
showResults: true     # whether audience sees live results immediately
# grid2x2 only:
axes:
  x: { label: "Impact", low: "Low", high: "High" }
  y: { label: "Effort", low: "Low", high: "High" }
---
```

`id` is the upsert key. Change the slide's position, keep the `id`, and history/votes stay. Remove a slide from markdown and its DB row is archived (not deleted) on next sync.

## How it works

1. **Author** in `slides.md` using the layouts above.
2. **Sync** to the backend:

```bash
DECK_SYNC_BASE_URL=http://localhost:8080 \
DECK_SYNC_EVENT_ID=1 \
DECK_SYNC_TOKEN=<admin bearer> \
DECK_SLUG=my-deck \
npm run sync:deck
# or dry-run:
npm run sync:deck:dry
# or: SLIDES_PATH=./slides.md node scripts/sync-deck.mjs --dry-run
```

No-op when `BASE_URL` / `EVENT_ID` are unset — normal `slidev build` never crashes.

In dev, the optional Vite plugin `plugins/deck-sync.ts` watches `slides.md` and debounces the same sync:

```ts
// vite.config.ts
import deckSync from './plugins/deck-sync'
export default { vitePlugins: [deckSync()] }
```

3. **Present**. The presenter's browser sends `{type:"slide", index,total,title,id}` on every slide change (via `PresenterPanel`/`useLiveRoom.sendSlide`). The backend's `OnSlideChange` auto-activates the draft question mapped to that `id` (or `position` fallback) when `activate !== "manual"`. No `onMounted` activation — viewers/audience never self-activate.

4. **Vote**. Audience on their phones answers via the join link; `StateDTO.active_question` flows through the existing `useLiveRoom().active` store. Layouts just read it — no second socket.

## Layouts (in `layouts/` — thin, default-theme-friendly)

Layouts reuse the existing Midnight widgets (`LiveQuestion`/`LiveQa`/`Leaderboard`/`Podium` with `--accent #7C6BFF`, `--grad`, 56px ring) but **do not take over the slide**: Slidev default theme still owns the slide background/typography; only the centered interactive card is midnight-styled. Join-session expiry shows the amber "Session ended — rejoin on your phone" card.

| Layout | Frontmatter `layout` | Renders |
|--------|---------------------|---------|
| `poll.vue` | `poll` | Single-choice poll |
| `multi.vue` | `multi` | Multi-select |
| `ranking.vue` | `ranking` | Ranked order |
| `yesno.vue` | `yesno` | Yes / No |
| `rating.vue` | `rating` | 1–5 stars |
| `nps.vue` | `nps` | 0–10 |
| `open.vue` | `open` | Open text |
| `wordcloud.vue` | `wordcloud` | Cloud (port of audience app's renderer) |
| `qa.vue` | `qa` | Q&A board (`LiveQa`) |
| `grid2x2.vue` | `grid2x2` | Scatter/quadrant — degrades to heatmap when backend lacks kind |

## PresenterPanel

- **Auto-activate toggle** (default on, persisted in `localStorage:pp_autoActivate`). Off → slide `id` is still broadcast but backend auto-activate is skipped; use **Reveal** / **Close** manually.
- **Reveal / Close** buttons (reuse admin `api()` helper) work for both hand-authored and deck-synced questions.

## Global top

`global-top.vue` persists across slides: a compact pill showing `Room CODE` + `Voting open / Results hidden` when on an interactive slide, plus the amber session-expired variant.

## Adding a new interactive slide

```md
---
layout: poll
interactive: true
id: s07-poll-regions
prompt: "Which region are you joining from?"
options: ["EMEA","APAC","Americas","Remote"]
points: 50
timeLimit: 20
---
```

Then `npm run sync:deck` (or let the dev plugin). Move the slide later — keep the `id`.

## Deck mirror convention

`templates/deck/**` is canonical. `decks/meetup/**` mirrors `composables/` + `components/` + `layouts/` + `scripts/` + `plugins/`. If you edit one, copy to the other (or `cp -r templates/deck/layouts decks/meetup/layouts`).
