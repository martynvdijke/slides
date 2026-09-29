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
Live questions: replace YOUR-EVENT-CODE with the room's event code.
The QR points at this deck's backend. On GitHub Pages set VITE_LIVE_BASE_URL
to the hosted backend at build time; the all-in-one container needs no base.
-->

---
layout: center
---

# Ask me anything

<LiveJoin event="YOUR-EVENT-CODE" />

<div class="mt-8">
  <LiveQuestion event="YOUR-EVENT-CODE" />
</div>

---
layout: center
---

# Top questions

<LiveQa event="YOUR-EVENT-CODE" :limit="5" />
