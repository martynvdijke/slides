---
theme: default
title: Quiz test deck
info: Static quiz slides covering every question kind — single choice, multi-select, ranking, yes/no, liking scale, NPS, open text and word cloud.
date: 2026-10-10
tags: [test, quiz, questions]
---

<div class="w-full h-full flex flex-col items-center justify-center text-center px-8">

<div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-semibold tracking-[0.14em] uppercase">
  <span class="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
  Test fixture · static markup
</div>

<h1 class="mt-6 text-[42px] font-extrabold tracking-tight text-slate-900 leading-none">Quiz test deck</h1>

<p class="mt-4 text-[14px] leading-relaxed text-slate-500 max-w-[560px]">A static test fixture rendering every question kind as pre-filled markup — no interactivity, for e2e assertions only.</p>

<div class="mt-6 flex items-center gap-2 text-[11px] font-mono text-slate-400">
  <span class="px-2 py-1 rounded bg-slate-900 text-white">8 kinds</span>
  <span>·</span>
  <span>single · multi · ranking · yes/no · rating · NPS · open · word cloud</span>
</div>

</div>

<style>
.q-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 28px 28px 24px;
  width: 100%;
  max-width: 560px;
  box-shadow: 0 8px 32px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.04);
  text-align: left;
}
.q-kind {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-weight: 700;
  color: #6366f1;
  margin: 0 0 10px 0;
}
.q-prompt {
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.3;
  letter-spacing: -0.015em;
  margin: 0 0 18px 0;
}
.q-options {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 8px;
}
.q-options li {
  padding: 11px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}
.q-card textarea,
.q-card input {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  padding: 12px 14px;
  font-size: 14px;
  color: #334155;
  outline: none;
}
.q-card textarea {
  min-height: 96px;
  resize: vertical;
}
.q-card input::placeholder,
.q-card textarea::placeholder {
  color: #94a3b8;
}
.slide-meta {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 600;
  color: #94a3b8;
  margin-bottom: 14px;
}
</style>

---
layout: center
class: bg-slate-50 px-8
---

<div class="w-full flex flex-col items-center">

<div class="slide-meta">01 — Single choice</div>

<div data-testid="q-poll" class="q-card">
  <p class="q-kind">Single choice</p>
  <h2 class="q-prompt">Single choice — pick one option</h2>
  <ul class="q-options">
    <li data-testid="q-poll-option">a</li>
    <li data-testid="q-poll-option">b</li>
    <li data-testid="q-poll-option">c</li>
  </ul>
</div>

<p class="mt-4 text-[11px] text-slate-400 font-mono">static · no JS · pre-filled for e2e</p>

</div>

---
layout: center
class: bg-slate-50 px-8
---

<div class="w-full flex flex-col items-center">

<div class="slide-meta">02 — Multi-select</div>

<div data-testid="q-multi" class="q-card">
  <p class="q-kind">Multi-select</p>
  <h2 class="q-prompt">Multi-select — pick all that apply</h2>
  <ul class="q-options">
    <li data-testid="q-multi-option">a</li>
    <li data-testid="q-multi-option">b</li>
    <li data-testid="q-multi-option">c</li>
  </ul>
</div>

<p class="mt-4 text-[11px] text-slate-400 font-mono">select zero or more</p>

</div>

---
layout: center
class: bg-slate-50 px-8
---

<div class="w-full flex flex-col items-center">

<div class="slide-meta">03 — Ranking</div>

<div data-testid="q-ranking" class="q-card">
  <p class="q-kind">Ranking</p>
  <h2 class="q-prompt">Ranking — order these options</h2>
  <ul class="q-options">
    <li data-testid="q-ranking-option">a</li>
    <li data-testid="q-ranking-option">b</li>
    <li data-testid="q-ranking-option">c</li>
  </ul>
</div>

<p class="mt-4 text-[11px] text-slate-400 font-mono">drag to reorder · static fixture</p>

</div>

---
layout: center
class: bg-slate-50 px-8
---

<div class="w-full flex flex-col items-center">

<div class="slide-meta">04 — Yes / No</div>

<div data-testid="q-yesno" class="q-card">
  <p class="q-kind">Yes / No</p>
  <h2 class="q-prompt">Yes / No — is it ready?</h2>
  <ul class="q-options">
    <li data-testid="q-yesno-option">Yes</li>
    <li data-testid="q-yesno-option">No</li>
  </ul>
</div>

</div>

---
layout: center
class: bg-slate-50 px-8
---

<div class="w-full flex flex-col items-center">

<div class="slide-meta">05 — Liking scale</div>

<div data-testid="q-rating" class="q-card">
  <p class="q-kind">Liking scale</p>
  <h2 class="q-prompt">Liking scale — how much did you like it?</h2>
  <ul class="q-options">
    <li data-testid="q-rating-option">1</li>
    <li data-testid="q-rating-option">2</li>
    <li data-testid="q-rating-option">3</li>
    <li data-testid="q-rating-option">4</li>
    <li data-testid="q-rating-option">5</li>
  </ul>
</div>

<p class="mt-4 text-[11px] text-slate-400">1 = not at all · 5 = loved it</p>

</div>

---
layout: center
class: bg-slate-50 px-8
---

<div class="w-full flex flex-col items-center">

<div class="slide-meta">06 — NPS (0–10)</div>

<div data-testid="q-nps" class="q-card">
  <p class="q-kind">NPS (0–10)</p>
  <h2 class="q-prompt">NPS — how likely are you to recommend it?</h2>
  <ul class="q-options" style="grid-template-columns: repeat(6, minmax(0, 1fr));">
    <li data-testid="q-nps-option">0</li>
    <li data-testid="q-nps-option">1</li>
    <li data-testid="q-nps-option">2</li>
    <li data-testid="q-nps-option">3</li>
    <li data-testid="q-nps-option">4</li>
    <li data-testid="q-nps-option">5</li>
    <li data-testid="q-nps-option">6</li>
    <li data-testid="q-nps-option">7</li>
    <li data-testid="q-nps-option">8</li>
    <li data-testid="q-nps-option">9</li>
    <li data-testid="q-nps-option">10</li>
  </ul>
</div>

<p class="mt-4 text-[11px] text-slate-400">0 = not likely · 10 = extremely likely</p>

</div>

---
layout: center
class: bg-slate-50 px-8
---

<div class="w-full flex flex-col items-center">

<div class="slide-meta">07 — Open text</div>

<div data-testid="q-open" class="q-card">
  <p class="q-kind">Open text</p>
  <h2 class="q-prompt">Open text — what did you think?</h2>
  <textarea data-testid="q-open-input" placeholder="Type your answer"></textarea>
</div>

<p class="mt-4 text-[11px] text-slate-400 font-mono">free-form · multi-line</p>

</div>

---
layout: center
class: bg-slate-50 px-8
---

<div class="w-full flex flex-col items-center">

<div class="slide-meta">08 — Word cloud</div>

<div data-testid="q-wordcloud" class="q-card">
  <p class="q-kind">Word cloud</p>
  <h2 class="q-prompt">Word cloud — one word</h2>
  <input data-testid="q-wordcloud-input" placeholder="One word" />
</div>

<p class="mt-4 text-[11px] text-slate-400 font-mono">single-word submissions aggregate into a cloud</p>

</div>
