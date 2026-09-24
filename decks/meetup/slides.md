---
theme: default
title: "Dutch Kubernetes/Cloud Native Meetup"
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
  <li><strong>18:00 - 18:05</strong> Welcome</li>
  <li><strong>18:05 - 18:50</strong> 1st Talk: Pascal Widdershoven & Luk van den Borne (Kabisa) Running k8s at sea</li>
  <li><strong>18:50 - 19:30</strong> Pizzas</li>
  <li><strong>19:30 - 20:15</strong> 2nd Talk: Manuel Mascarenhas & Ronald van Zandvoort (ASML): Taking flight with Cilium eBPF – Is that you Icarus?</li>
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
    <img src="/kabisa-logo.svg" class="w-[240px]" alt="Kabisa" />
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

<!--
Code of Conduct — keep it brief, point to LF link. Kubernetes helm anchors the slide.
-->

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
Call to action — recruit speakers and hosts for the next meetup.
-->

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

---
layout: default
class: "bg-white px-12 py-10"
---
Pascal Widdershoven & Luk van den Borne (Kabisa) Running k8s at sea

---
layout: default
class: "bg-white px-12 py-10"
---
Food

---
layout: default
class: "bg-white px-12 py-10"
---
Manuel Mascarenhas & Ronald van Zandvoort (ASML): Taking flight with Cilium eBPF – Is that you Icarus?


<!--
Stay in touch — three channels, bold prefix as in original.
-->
