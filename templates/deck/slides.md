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
