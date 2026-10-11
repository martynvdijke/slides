---
theme: default
title: DECK_NAME
info: One-line description shown on the slides index.
date: 2026-01-01
tags: [topic, another-tag]
---

# DECK_NAME

Your deck goes here.

---
layout: center
---

## Second slide

<!--
Live questions: set VITE_ROOM_CODE (short code) or VITE_EVENT_CODE at build time,
or pass room="ABC12" / event="my-event-code" directly. The QR points at this
deck's backend. On GitHub Pages set VITE_LIVE_BASE_URL to the hosted backend;
the all-in-one container needs no base.
-->

---
layout: center
---

# Ask me anything

<LiveJoin />

<div class="mt-8">
  <LiveQuestion />
</div>

---
layout: center
---

# Top questions

<LiveQa :limit="5" />

<!--
Opt-in presenter panel: author questions (with photos/video) from the slides.
Press "p" to toggle, or add `fab` for a small on-screen button.
<PresenterPanel />
-->

<!--
Reactions overlay — floating emoji from the audience (full-bleed, no config needed beyond room/event).
<LiveReactions />
-->

<!--
Leaderboard — top participants by quiz points.
<Leaderboard :limit="10" title="Leaderboard" />
-->

---
layout: poll
interactive: true
id: demo-poll-journey
prompt: "Where are you on your cloud-native journey?"
options: ["Exploring","Running in prod","Scaling platform"]
points: 100
timeLimit: 30
---

<!--
Poll — single choice. Synced via `npm run sync:deck:dry` then `sync:deck` when backend is up.
-->

---
layout: wordcloud
interactive: true
id: demo-wordcloud-buzz
prompt: "One word — what buzzword are you tired of?"
timeLimit: 45
---

<!--
Wordcloud — port of the audience app's cloud renderer. Size = count.
-->

---
layout: qa
interactive: true
id: demo-qa-ask
prompt: "Anything you want to ask?"
---

<!--
Q&A board — delegates to <LiveQa>. Voting open indicator lives in global-top.
-->

---
layout: grid2x2
interactive: true
id: demo-grid-priority
prompt: "Where does platform investment sit?"
axes:
  x: { label: "Impact", low: "Low", high: "High" }
  y: { label: "Effort", low: "Low", high: "High" }
---

<!--
grid2x2 — scatter/quadrant. Degrades to a tally when the backend lacks the kind.
-->

---
layout: nps
interactive: true
id: demo-nps-day
prompt: "How likely are you to recommend today so far?"
---

<!--
NPS 0–10 — bars + NPS badge reuse LiveQuestion.
-->

---
layout: center
---

# That's the theme

Read `THEME.md` for the full frontmatter schema and `npm run sync:deck` flow. Press **p** for the presenter panel.

<!--
Keep `id` stable when you reorder slides — external_id = "{deck_slug}:{slide_id}".
-->
