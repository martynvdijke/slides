---
theme: default
title: "Dutch Kubernetes/Cloud Native Meetup"
info: Cloud Native Amsterdam meetup deck with live audience Q&A and polls.
date: 2026-1-17
tags: [kubernetes, cloud-native, cncf, live-questions]
routerMode: hash
transition: slide-left
mdc: true
fonts:
  sans: Inter
  mono: JetBrains Mono
colorSchema: light
aspectRatio: 16/9
layout: center
class: "text-center bg-white relative"
---

<script setup lang="ts">
import { onMounted } from 'vue'
onMounted(() => {
  if (typeof document === 'undefined') return
  if (document.querySelector('.global-k8s-footer')) return
  const f = document.createElement('div')
  f.className = 'global-k8s-footer'
  f.innerHTML = `<span class="global-k8s-footer-left">Dutch Kubernetes/Cloud Native Meetup</span><span class="global-k8s-footer-right"><span>Cloud Native Computing Foundation</span><span class="global-k8s-footer-num">1</span></span>`
  document.body.appendChild(f)
  const num = f.querySelector('.global-k8s-footer-num') as HTMLElement | null
  const getPage = () => {
    const h = window.location.hash || '#1'
    const m = h.match(/\/(\d+)/)
    return m ? m[1] : '1'
  }
  const upd = () => { if (num) num.textContent = getPage() }
  window.addEventListener('hashchange', upd)
  setInterval(upd, 400)
  upd()
})
</script>

<div class="flex flex-col items-center justify-start w-full h-full pt-6 pb-[220px]">

<div class="cover-title text-[44px] md:text-[52px] leading-none tracking-tight">
Dutch Kubernetes/Cloud Native
</div>

<div class="mt-6">
  <img src="/meetup-logo.png" class="w-[160px] mx-auto" alt="Meetup" />
</div>

<div class="mt-5">
  <img src="/cncf-logo.png" class="w-[340px] mx-auto opacity-95" alt="Cloud Native Computing Foundation" />
</div>

<div class="absolute bottom-[28px] left-0 right-0 w-full">
  <img src="/skyline.png" class="w-full h-auto" alt="Dutch skyline" />
</div>

</div>



---
layout: default
class: "bg-white px-12 py-8"
---

<div class="max-w-4xl">

<h2 class="text-[28px] font-bold tracking-tight text-[#0f172a] mb-4">Agenda:</h2>

<ul class="agenda-list">
  <li><strong>17:00 - 18:00</strong> Food</li>
  <li><strong>18:00 - 18:05</strong> Welcome</li>
  <li><strong>18:05 - 19:00</strong> 1st talk: We've got GitHub Copilot at home by Mark Hu (ASML)</li>
  <li><strong>19:00 - 19:15</strong> Break </li>
  <li><strong>19:15 - 20:15</strong> 2nd talk: Making PRs from the bathroom by Sjuul Jannsen (Arrakis Technologies)</li>
  <li><strong>20:15 - 21:30</strong> Networking & drinks</li>
  <li><strong>21:30</strong> End</li>
</ul>

</div>


---
layout: center
class: "bg-white text-center"
---

<div class="w-full max-w-3xl mx-auto">

<h2 class="text-[28px] font-bold tracking-tight text-[#0f172a] mb-8">Meet your fantastic hosts</h2>

<div class="flex items-start justify-center gap-20">

<div class="flex flex-col items-center">
  <img src="/host-gareth.png" class="host-img" alt="Gareth Thomas" />
  <div class="mt-4 text-[18px] font-bold text-[#0f172a]">Gareth Thomas</div>
</div>

<div class="flex flex-col items-center">
  <img src="/host-martyn.png" class="host-img" alt="Martyn van Dijke" />
  <div class="mt-4 text-[18px] font-bold text-[#0f172a]">Martyn van Dijke</div>
</div>

</div>

</div>

---
layout: center
class: "bg-white text-center"
---

<div class="flex flex-col items-center justify-center">
  <div class="text-[56px] font-extrabold tracking-tight text-[#0f172a]">Thank you</div>
  <div class="mt-8 text-[12px] uppercase tracking-[0.25em] text-[#64748b]">Today's company</div>
  <div class="mt-3 inline-flex items-center rounded-2xl bg-[#0f2a4a] px-10 py-6 shadow-lg">
    <img src="https://upload.wikimedia.org/wikipedia/fr/archive/e/e2/20130114190635%21LOGO-CGI.svg" class="w-[240px]" alt="Kabisa" />
  </div>
</div>

<!--
Thank you / today's company — Kabisa.
-->

---
layout: default
class: "bg-white px-8 py-6"
---

<div class="w-full h-full flex flex-col">

<h2 class="text-[24px] font-bold tracking-tight text-[#0f172a]">Dutch Cloud Native & AI Community Group</h2>

<p class="stats-red font-bold text-[13px] mt-1 tracking-tight"> 2^7 (128+) Meetups in 10 years! &nbsp; 3 meetups in 12 months, ~580 attendees</p>

<div class="mt-4 grid grid-cols-[1.05fr_0.95fr] gap-5 items-start flex-1">

<div class="flex flex-col gap-4">
  <div class="img-card">
    <img src="/crowd.png" class="w-full h-[175px] object-cover" alt="Packed crowd" />
  </div>
  <div class="img-card bg-white p-1">
    <img src="/meetup-group.png" class="w-full h-auto" alt="Meetup group card" />
  </div>
</div>

<div class="flex flex-col gap-3">
  <div class="img-card bg-white p-1.5 h-full">
    <img src="/meetup-event.png" class="w-full h-[360px] object-contain" alt="Meetup event screenshot" />
  </div>
</div>

</div>

</div>

<!--
Community stats — original is a dense collage; cleaned into a 2-column grid: left = crowd photo + group card, right = event detail. Preserves the 2016 throwback.
-->

---
layout: center
class: "text-center relative overflow-hidden"
---

<div class="absolute inset-0">
  <img src="/coc-banner.png" class="w-full h-full object-cover" alt="" />
  <div class="absolute inset-0 bg-[#0f2a4a]/55"></div>
</div>

<div class="relative z-10 flex flex-col items-center justify-center h-full px-8 py-10">

<div class="text-white font-extrabold text-[30px] md:text-[34px] tracking-tight drop-shadow-md">Please follow the Code of Conduct</div>

<div class="mt-6">
  <img src="/kubernetes-logo.png" class="w-[132px] h-[132px] object-contain mx-auto drop-shadow-xl" alt="Kubernetes" />
</div>

<div class="mt-6">
  <a href="https://events.linuxfoundation.org/about/code-of-conduct/" target="_blank" class="text-white underline underline-offset-4 decoration-white/80 text-[13px] font-medium tracking-wide">https://events.linuxfoundation.org/about/code-of-conduct/</a>
</div>

</div>

---
layout: center
class: "bg-white text-center"
---

<div class="w-full max-w-4xl mx-auto">

<div class="text-[13px] font-bold uppercase tracking-[0.25em] text-[#326CE5]">Your turn</div>

<h2 class="text-[38px] font-extrabold tracking-tight text-[#0f172a] mt-3">Want to present? Want to help host?</h2>

<p class="text-[15px] text-[#475569] mt-3">Every meetup is powered by people who put their hand up — and that could be you.</p>

<div class="mt-9 grid grid-cols-2 gap-6 text-left">

<div class="cta-card">
  <div class="text-[20px] font-bold text-[#0f172a]">Give a talk</div>
  <p class="mt-2 text-[13.5px] leading-relaxed text-[#475569]">Got a war story, a deep dive, or a live demo? 20–45 minutes on anything Kubernetes, cloud-native or AI. First-time speakers very welcome.</p>
</div>

<div class="cta-card">
  <div class="text-[20px] font-bold text-[#0f172a]">Help host</div>
  <p class="mt-2 text-[13.5px] leading-relaxed text-[#475569]">Offer a venue, sponsor the pizzas, or just help things run on the night. No experience needed — we'll show you the ropes.</p>
</div>

</div>

<div class="mt-8 text-[13px] text-[#0f172a]">
  Talk to <span class="font-bold">Gareth</span> or <span class="font-bold">Martyn</span> or <span class="font-bold">Sjuul</span> 
</div>

</div>

<!--
Code of Conduct — keep it brief, point to LF link. Kubernetes helm anchors the slide.
-->

---
layout: center
class: "bg-white text-center"
---

<div class="w-full max-w-4xl mx-auto">

<div class="text-[13px] font-bold uppercase tracking-[0.25em] text-[#326CE5]">House rules</div>

<h2 class="text-[38px] font-extrabold tracking-tight text-[#0f172a] mt-3">Ask a question, get a sweet</h2>

<p class="text-[15px] text-[#475569] mt-3">Put your hand up and ask the speakers anything — every question earns you a sweet.</p>

<div class="mt-9 grid grid-cols-2 gap-6 text-left">

<div class="cta-card">
  <svg class="w-[46px] h-[46px]" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path d="M20 32 L4 20 L8 32 L4 44 Z" fill="#E8A33D" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M44 32 L60 20 L56 32 L60 44 Z" fill="#E8A33D" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="32" cy="32" r="15" fill="#C0392B" stroke="#0f172a" stroke-width="2"/>
    <path d="M26 19 Q22 32 26 45" stroke="#fff" stroke-width="3" fill="none" opacity="0.85"/>
    <path d="M38 19 Q42 32 38 45" stroke="#fff" stroke-width="3" fill="none" opacity="0.85"/>
  </svg>
  <div class="text-[20px] font-bold text-[#0f172a] mt-3">Every question = a sweet</div>
  <p class="mt-2 text-[13.5px] leading-relaxed text-[#475569]">No question too small or too silly. The more you ask, the more sweets you collect.</p>
</div>

<div class="cta-card">
  <svg class="w-[46px] h-[46px]" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <rect x="27" y="4" width="10" height="10" rx="2" fill="#B45309" stroke="#0f172a" stroke-width="2"/>
    <path d="M28 14 h8 v10 l6 10 a14 14 0 0 1 -20 0 l6 -10 z" fill="#FDE68A" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>
    <rect x="18" y="40" width="28" height="16" rx="3" fill="#FACC15" stroke="#0f172a" stroke-width="2"/>
  </svg>
  <div class="text-[20px] font-bold text-[#0f172a] mt-3">Most sweets left wins limoncello</div>
  <p class="mt-2 text-[13.5px] leading-relaxed text-[#475569]">At the end of the night, the person still holding the most uneaten sweets goes home with a bottle of limoncello.</p>
</div>

</div>
</div>

---
layout: center
class: "bg-white text-center"
---

<div class="event-card">

<div class="flex items-center justify-center gap-2">
  <span class="event-eyebrow">Upcoming event</span>
  <span class="event-dot">·</span>
  <span class="event-time">Feburary 2027</span>
</div>

<h2 class="event-title mt-4">ASML & Docker AI</h2>

</div>

---
layout: center
class: "bg-white text-center"
---

<div class="event-card">

<div class="flex items-center justify-center gap-2">
  <span class="event-eyebrow">1st Talk</span>
  <span class="event-dot">·</span>
  <span class="event-time">18:05 – 19:00</span>
</div>

<h2 class="event-title mt-4">We've got GitHub Copilot at home</h2>

<div class="event-divider"></div>

<div class="event-speakers mt-4">by Mark Hu</div>

<div class="mt-3">
  <span class="event-company-pill">ASML</span>
</div>

</div>

---
layout: center
class: "bg-white text-center"
---

<div class="event-card">

<div class="beverage-icon-wrap" aria-hidden="true">
<svg class="beverage-icon" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M23 32c-5-6 5-8 0-14M34 32c-5-6 5-8 0-14M66 32c-5-6 5-8 0-14M77 32c-5-6 5-8 0-14" stroke="#94a3b8" stroke-width="3" stroke-linecap="round"/>
  <path d="M40 47h4a7 7 0 0 1 0 14h-5M13 41h29l-3 27a8 8 0 0 1-8 7h-7a8 8 0 0 1-8-7z" fill="#fff7ed" stroke="#0f172a" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M14 43c6-4 21-4 27 0-6 4-21 4-27 0" fill="#7c4a24" stroke="#0f172a" stroke-width="2"/>
  <path d="M10 80c7 5 29 5 36 0" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M84 47h4a7 7 0 0 1 0 14h-5M57 41h29l-3 27a8 8 0 0 1-8 7h-7a8 8 0 0 1-8-7z" fill="#fff7ed" stroke="#0f172a" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M58 43c6-4 21-4 27 0-6 4-21 4-27 0" fill="#d99a32" stroke="#0f172a" stroke-width="2"/>
  <path d="M54 80c7 5 29 5 36 0" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round"/>
</svg>
</div>

<div class="flex items-center justify-center gap-2">
  <span class="event-eyebrow">Break</span>
  <span class="event-dot">·</span>
  <span class="event-time">19:00 – 19:15</span>
</div>

<h2 class="event-title mt-3">Break</h2>


</div>

---
layout: center
class: "bg-white text-center"
---

<div class="event-card">

<div class="flex items-center justify-center gap-2">
  <span class="event-eyebrow">2nd Talk</span>
  <span class="event-dot">·</span>
  <span class="event-time">19:15 – 20:15</span>
</div>

<h2 class="event-title event-title--sm mt-4">Making PRs from the bathroom</h2>

<div class="event-divider"></div>

<div class="event-speakers mt-4">Sjuul Jannsen</div>

<div class="mt-3">
  <span class="event-company-pill">Arrakis Technologies</span>
</div>

</div>

---
layout: center
class: "bg-white text-center"
---

<div class="w-full max-w-4xl mx-auto">

<div class="text-[13px] font-bold uppercase tracking-[0.25em] text-[#326CE5]">Your turn</div>

<h2 class="text-[38px] font-extrabold tracking-tight text-[#0f172a] mt-3">Want to present? Want to help host?</h2>

<p class="text-[15px] text-[#475569] mt-3">Every meetup is powered by people who put their hand up — and that could be you.</p>

<div class="mt-9 grid grid-cols-2 gap-6 text-left">

<div class="cta-card">
  <div class="text-[20px] font-bold text-[#0f172a]">Give a talk</div>
  <p class="mt-2 text-[13.5px] leading-relaxed text-[#475569]">Got a war story, a deep dive, or a live demo? 20–45 minutes on anything Kubernetes, cloud-native or AI. First-time speakers very welcome.</p>
</div>

<div class="cta-card">
  <div class="text-[20px] font-bold text-[#0f172a]">Help host</div>
  <p class="mt-2 text-[13.5px] leading-relaxed text-[#475569]">Offer a venue, sponsor the pizzas, or just help things run on the night. No experience needed — we'll show you the ropes.</p>
</div>

</div>

<div class="mt-8 text-[13px] text-[#0f172a]">
  Talk to <span class="font-bold">Gareth</span> or <span class="font-bold">Martyn</span> or <span class="font-bold">Sjuul</span> 
</div>

</div>


---
layout: default
class: "bg-white px-12 py-10"
---

<h2 class="text-[30px] font-bold tracking-tight text-[#0f172a] mb-8">Stay in touch</h2>

<div class="space-y-4 text-[18px] leading-relaxed text-[#0f172a]">

<div><span class="font-bold">#netherlands</span> on slack.cncf.io</div>

<div><span class="font-bold">community.cncf.io/amsterdam</span></div>

<div><span class="font-bold">info@cloudnative.amsterdam</span></div>

</div>

<!--
Stay in touch — three channels, bold prefix as in original.
-->

<!--
<LiveReactions />
<Leaderboard :limit="10" />
PresenterPanel is mounted persistently via global-top.vue.
-->
