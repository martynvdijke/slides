---
theme: default
title: "Live feature test deck"
info: "Exercises every live question kind, media prompt, and in-slide component."
date: 2026-01-01
tags: [testing, live-questions]
routerMode: hash
---

# Live feature test deck

Point this deck at a backend via `?event=CODE` or `?room=CODE` (optional `?base=https://host`).

---

# Join

Scan the QR or use the room code to join.

<LiveJoin />

---

# Live question

<div class="mt-8">
  <LiveQuestion />
</div>

---

# Join + question

<LiveQr />

---

# Top questions

<LiveQa :limit="5" />

---

# Podium

<Podium />

---

# Leaderboard

<Leaderboard :limit="10" />

---

# Reactions

<LiveReactions />

---

# Reference

Live question kinds:

- poll
- multi (multiple choice)
- ranking
- yes/no
- rating
- NPS
- open text
- word cloud

Prompts accept image and video media.

---

# Presenter overlay

<!-- PresenterPanel is an overlay toggled with the `p` hotkey. -->

<PresenterPanel fab />
