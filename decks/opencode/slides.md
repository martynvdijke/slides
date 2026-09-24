---
theme: seriph
title: "OpenCode — the open source AI coding agent"
info: |
  OpenCode: the open source AI coding agent by Anomaly.
  What it is, how it works, providers & models, the OpenCode Console (opencode.ai/auth),
  OpenCode Go ($10/mo subscription), running it at home (opencode serve/web), OpenCode Web on your phone, sharing, and Zen vs Go.
author: OpenCode
presenter: true
drawings:
  persist: false
transition: slide-left
routerMode: hash
mdc: true
fonts:
  sans: DM Sans
  serif: Newsreader
  mono: DM Mono
colorSchema: light
highlighter: shiki
lineNumbers: false
css: unocss
layout: cover
background: "#0a0a0f"
class: text-white relative overflow-hidden
---

<div class="absolute inset-0">
  <div class="absolute inset-0" style="background: radial-gradient(800px circle at 20% 10%, rgba(109,40,217,0.35), transparent 60%), radial-gradient(700px circle at 90% 80%, rgba(6,182,214,0.22), transparent 60%), radial-gradient(600px circle at 60% -10%, rgba(163,230,53,0.12), transparent 60%);"></div>
  <div class="absolute inset-0 opacity-[0.035]" style="background-image: url('https://grainy-gradients.vercel.app/noise.svg');"></div>
</div>

<div class="relative z-10 h-full flex flex-col justify-center text-left max-w-5xl mx-auto px-2">

<div class="inline-flex items-center gap-2 text-[11px] tracking-[0.18em] uppercase font-mono text-white/60 mb-6">
  <span class="w-8 h-px bg-white/20"></span>
  anomalyco/opencode · opencode.ai
  <span class="px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-white font-sans font-bold tracking-[0.08em]">OPEN SOURCE</span>
</div>

# OpenCode

<div class="text-[15px] md:text-[19px] font-light leading-relaxed text-white/70 max-w-[640px] mt-3">

**The open source AI coding agent** — TUI · Desktop · IDE · Web. One server, same sessions, anywhere.

</div>

<div class="flex flex-wrap gap-3 mt-6">
  <span class="px-3 py-1.5 rounded-full bg-white text-black text-xs font-semibold tracking-wide">Provider-agnostic · 75+ providers</span>
  <span class="px-3 py-1.5 rounded-full border border-white/15 text-white/70 text-xs font-mono">opencode.ai · github.com/anomalyco/opencode</span>
  <span class="px-3 py-1.5 rounded-full bg-violet-600 text-white text-xs font-semibold">Go: $10/mo open models →</span>
</div>

<div class="flex items-center gap-4 mt-6 text-[11px] font-mono text-white/40">
  <span>What it is → How it works → Console → Go → At home → On your phone</span>
</div>

<div class="flex items-center gap-4 mt-2 text-[11px] font-mono text-white/30">
  <span>By Anomaly</span>
  <span class="w-1 h-1 rounded-full bg-white/20"></span>
  <span>opencode.ai/docs</span>
</div>

</div>

<div class="absolute bottom-6 right-8 text-[10px] font-mono tracking-widest text-white/25">ESC → OVERVIEW · PRESS → NEXT</div>

<!--
Speaker notes: New framing — OpenCode is the whole story, Go is one chapter. This deck walks the full arc: agent → providers → Console (team/billing) → Go subscription → home server → phone → sharing → Zen vs Go. By Anomaly. Set expectations that Go is optional.
-->

---
layout: two-cols
class: gap-8
---


<div class="text-[11px] tracking-[0.2em] uppercase font-mono text-zinc-400 mb-3">01 — The agent</div>

## What is <span class="font-serif italic">OpenCode?</span>

<div class="text-[13px] leading-relaxed text-zinc-600 mt-3">

The **open source AI coding agent by Anomaly.** One codebase, four surfaces — same sessions, same state. **Provider-agnostic** from day one.

</div>

<div class="grid grid-cols-2 gap-3 mt-5">

<div class="rounded-xl border border-zinc-200 p-3 bg-zinc-50/60">
  <div class="text-xs font-semibold flex items-center gap-1.5"><span class="i-carbon-terminal text-base opacity-60"></span> Terminal TUI</div>
  <div class="text-[11px] text-zinc-500 mt-1">LSP-aware, multi-session, parallel agents.</div>
</div>

<div class="rounded-xl border border-zinc-200 p-3 bg-white">
  <div class="text-xs font-semibold flex items-center gap-1.5"><span class="i-carbon-application text-base opacity-60"></span> Desktop App</div>
  <div class="text-[11px] text-zinc-500 mt-1">Native wrapper around the same server.</div>
</div>

<div class="rounded-xl border border-zinc-200 p-3 bg-white">
  <div class="text-xs font-semibold flex items-center gap-1.5"><span class="i-carbon-code text-base opacity-60"></span> IDE Extension</div>
  <div class="text-[11px] text-zinc-500 mt-1">Bring the agent where you code.</div>
</div>

<div class="rounded-xl border border-violet-200 p-3 bg-violet-50/60">
  <div class="text-xs font-semibold flex items-center gap-1.5"><span class="i-carbon-globe text-base opacity-60"></span> Web UI</div>
  <div class="text-[11px] text-zinc-500 mt-1">Browser UI from same server. <code class="text-[11px]">opencode web</code></div>
</div>

</div>

<div class="flex flex-wrap gap-1.5 mt-4">
  <span class="tier-chip">LSP-aware</span>
  <span class="tier-chip">multi-session</span>
  <span class="tier-chip">share links</span>
  <span class="tier-chip">plan / build</span>
  <span class="tier-chip">git undo / redo</span>
  <span class="tier-chip">@ file search</span>
  <span class="tier-chip">! shell commands</span>
</div>

::right::

<div class="rounded-2xl border border-zinc-200 bg-zinc-950 text-white p-3 shadow-xl">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-1.5">
      <span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>
      <span class="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
      <span class="w-2.5 h-2.5 rounded-full bg-green-500"></span>
    </div>
    <span class="text-[10px] font-mono tracking-widest opacity-50">OPENCODE TUI</span>
  </div>
</div>

```bash {1|2|3|all}
# install — pick one
curl -fsSL https://opencode.ai/install | bash
npm install -g opencode-ai
brew install anomalyco/tap/opencode
```

<div class="rounded-2xl border border-zinc-200 bg-zinc-950 text-white p-3 -mt-2">
<div class="grid grid-cols-2 gap-2 text-[11px]">
  <div class="rounded-lg bg-white/5 border border-white/10 p-2.5">
    <div class="font-mono text-white/60 text-[10px] tracking-widest uppercase">Providers</div>
    <div class="font-semibold mt-1">75+ via Models.dev / AI SDK</div>
    <div class="text-white/50 leading-tight mt-1">incl. local: Ollama · LM Studio · llama.cpp</div>
  </div>
  <div class="rounded-lg bg-white/5 border border-white/10 p-2.5">
    <div class="font-mono text-white/60 text-[10px] tracking-widest uppercase">Built by</div>
    <div class="font-mono text-[11px] mt-1">Anomaly</div>
    <div class="text-white/50 mt-1">github.com/anomalyco/opencode</div>
  </div>
</div>
</div>

<div class="text-[11px] font-mono text-zinc-400 mt-3 flex items-center gap-2">
  <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Docs → opencode.ai/docs
</div>

<!--
Notes: OpenCode is the agent; Go/Zen are just gateway entries. Emphasize Anomaly as builder and provider-agnostic design.
-->

---
layout: two-cols
class: gap-6
---


<div class="text-[11px] tracking-[0.2em] uppercase font-mono text-zinc-400 mb-3">02 — How it works</div>

## One server, <span class="font-serif italic">many surfaces</span>

<div class="text-sm text-zinc-600 leading-relaxed mt-2">OpenCode is a <b>local server</b>. TUI, desktop, IDE and Web are just views — same sessions, same filesystem, same state.</div>

<div class="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
  <div class="flex items-center justify-center gap-2">
    <div class="rounded-xl border-2 border-zinc-900 bg-zinc-50 px-4 py-3 text-center min-w-[130px]">
      <div class="text-[10px] font-mono tracking-widest text-zinc-500">SERVER</div>
      <div class="text-xs font-bold">opencode</div>
      <div class="text-[11px] text-zinc-500">127.0.0.1:4096</div>
      <div class="text-[10px] font-mono text-zinc-400 mt-1">opencode serve / web</div>
    </div>
  </div>
  <div class="mt-3 grid grid-cols-4 gap-2">
    <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-center">
      <div class="text-xs font-semibold">TUI</div>
      <div class="text-[10px] text-zinc-500">terminal</div>
    </div>
    <div class="rounded-xl border border-zinc-200 bg-white p-2.5 text-center">
      <div class="text-xs font-semibold">Desktop</div>
      <div class="text-[10px] text-zinc-500">app</div>
    </div>
    <div class="rounded-xl border border-zinc-200 bg-white p-2.5 text-center">
      <div class="text-xs font-semibold">IDE</div>
      <div class="text-[10px] text-zinc-500">extension</div>
    </div>
    <div class="rounded-xl border border-violet-200 bg-violet-50 p-2.5 text-center">
      <div class="text-xs font-semibold">Web</div>
      <div class="text-[10px] text-zinc-500">browser</div>
    </div>
  </div>
  <div class="text-[11px] text-zinc-500 mt-3 text-center leading-relaxed">One filesystem · one session store · <code class="text-xs">opencode attach</code> to join from anywhere</div>
</div>

::right::

<div class="rounded-2xl bg-zinc-900 text-white p-4">
  <div class="text-[11px] font-mono tracking-widest text-white/50 uppercase">Attach</div>
  <div class="text-xs text-white/70 mt-2 leading-relaxed">Start the server once, attach many clients. Web + TUI drive the <b class="text-white">same session</b>.</div>
</div>

```bash
# headless server
opencode serve --port 4096 --hostname 127.0.0.1

# web = server + browser
opencode web

# attach a second TUI to the running server
opencode attach http://localhost:4096
```

<div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3 -mt-2">
  <div class="text-xs font-bold">Why local-first?</div>
  <ul class="text-xs text-zinc-600 mt-1.5 space-y-1 leading-relaxed list-disc pl-4">
    <li>Sessions live with your filesystem — not a hosted IDE.</li>
    <li>Swap providers per session without migration.</li>
    <li>Share only when you choose (<code class="text-[11px]">/share</code>).</li>
  </ul>
</div>

<div class="text-[11px] font-mono text-zinc-400 mt-3">Tip: don’t run two servers on the same project — <code class="text-xs">attach</code>.</div>

<!--
Notes: Mental model first — server is the truth. All surfaces are thin clients. This sets up home server + phone later.
-->

---
layout: center
class: text-center
---

<div class="max-w-3xl mx-auto">

<div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-200 bg-white text-zinc-600 text-xs font-medium">
  <span class="w-1.5 h-1.5 rounded-full bg-violet-600"></span>
  Provider-agnostic by design
</div>

## Models & providers — <span class="font-serif italic font-normal">your choice</span>

<div class="grid grid-cols-3 gap-4 text-left mt-8">

<div class="rounded-2xl border border-zinc-200 p-4 bg-white text-left">
  <div class="text-2xl">🔌</div>
  <div class="text-sm font-semibold mt-2">75+ providers</div>
  <div class="text-xs text-zinc-500 mt-1 leading-relaxed">Via Models.dev / AI SDK — incl. local <b>Ollama · LM Studio · llama.cpp</b>. One config, many backends.</div>
</div>

<div class="rounded-2xl border border-zinc-200 p-4 bg-white text-left">
  <div class="text-2xl">🌐</div>
  <div class="text-sm font-semibold mt-2">Inference gateway</div>
  <div class="text-xs text-zinc-500 mt-1 leading-relaxed">The OpenCode Console is the optional gateway (Zen) — add credits, manage keys, set budgets.</div>
</div>

<div class="rounded-2xl border border-violet-200 p-4 bg-violet-50/70 text-left">
  <div class="text-2xl">🔓</div>
  <div class="text-sm font-semibold mt-2">Curated open models</div>
  <div class="text-xs text-zinc-500 mt-1 leading-relaxed">OpenCode Go: $10/mo for reliable access to popular <b>open coding models</b> with reserved capacity.</div>
</div>

</div>

<div class="text-[11px] font-mono tracking-wide text-zinc-400 mt-6">FRONTIER MODELS ARE AMAZING — AND UNPREDICTABLE TO PAY FOR → Go gives flat, calm pricing on open models with real capacity.</div>

</div>

<!--
Notes: Frame Go/Zen as gateway entries within the broader provider story, not the whole product.
-->

---
layout: section
class: text-center
---

<div class="text-[11px] tracking-[0.3em] uppercase font-mono text-white/50 mb-4">The Console</div>

# The OpenCode Console <span class="font-serif italic font-light">— optional, for teams</span>

<div class="text-sm text-white/60 mt-3 max-w-2xl mx-auto leading-relaxed">

Sign in at <span class="font-mono text-white/90">opencode.ai/auth</span> — the optional team & billing console for OpenCode. Docs: <span class="font-mono text-white/80">opencode.ai/v2/docs/console</span>

</div>

<div class="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-zinc-900 font-mono text-sm shadow-xl">
  <span class="w-2 h-2 rounded-full bg-violet-600 animate-pulse"></span> opencode.ai/auth
  <span class="text-zinc-400">→</span>
  <span class="text-zinc-500">Console</span>
</div>

<!--
Notes: Change 2 — emphasize Console is optional, built by Anomaly. Not a literal "OpenCode Co" product — call it OpenCode Console.
-->

---
layout: two-cols
class: gap-6
---


<div class="text-[11px] tracking-[0.2em] uppercase font-mono text-zinc-400 mb-3">04 — OpenCode Console</div>

## Team & billing <span class="font-serif italic font-normal text-zinc-500">in one place</span>

<div class="text-sm text-zinc-600 leading-relaxed mt-2">The <b>OpenCode Console</b> at <span class="font-mono text-xs">opencode.ai/auth</span> is where billing, access and team policy live. Built by <b>Anomaly</b> · <span class="font-mono text-xs">github.com/anomalyco/opencode</span>. Docs: <span class="font-mono text-xs">opencode.ai/v2/docs/console</span></div>

<div class="mt-4 grid grid-cols-2 gap-2.5">

<div class="rounded-xl border border-zinc-200 bg-white p-3">
  <div class="text-xs font-semibold flex items-center gap-1.5"><span class="i-carbon-gateway text-zinc-500"></span> Inference gateway (Zen)</div>
  <div class="text-[11px] text-zinc-500 mt-1 leading-relaxed">Pay-as-you-go at cost for wide provider access. Add credits, auto-reload.</div>
</div>

<div class="rounded-xl border border-zinc-200 bg-white p-3">
  <div class="text-xs font-semibold flex items-center gap-1.5"><span class="i-carbon-chart-bar text-zinc-500"></span> Usage & budgets</div>
  <div class="text-[11px] text-zinc-500 mt-1 leading-relaxed">Track spend, set <b>monthly caps</b> and per-member budgets.</div>
</div>

<div class="rounded-xl border border-zinc-200 bg-white p-3">
  <div class="text-xs font-semibold flex items-center gap-1.5"><span class="i-carbon-user-role text-zinc-500"></span> Roles</div>
  <div class="text-[11px] text-zinc-500 mt-1 leading-relaxed"><b>Admin / Member</b> per-member roles. Admins manage billing, members & policies.</div>
</div>

<div class="rounded-xl border border-zinc-200 bg-white p-3">
  <div class="text-xs font-semibold flex items-center gap-1.5"><span class="i-carbon-list-checked text-zinc-500"></span> Allowlists & caps</div>
  <div class="text-[11px] text-zinc-500 mt-1 leading-relaxed"><b>Model allowlists</b> + monthly caps per member or workspace.</div>
</div>

</div>

::right::

<div class="rounded-2xl border border-violet-200 bg-violet-50 p-4">
  <div class="text-xs font-bold flex items-center gap-2"><span class="i-carbon-api-key text-violet-600"></span> API keys</div>
  <div class="text-xs text-zinc-600 mt-1 leading-relaxed">Create and rotate API keys in the Console. Same key powers Zen gateway and — if you subscribe — Go models.</div>
  <div class="text-[11px] font-mono text-zinc-500 mt-2">opencode.ai/auth → API keys</div>
</div>

<div class="rounded-2xl border border-zinc-200 bg-white p-4 mt-4">
  <div class="text-xs font-bold flex items-center gap-2"><span class="i-carbon-star text-amber-500"></span> Where Go lives</div>
  <div class="text-xs text-zinc-600 mt-1 leading-relaxed">Subscribe to <b>OpenCode Go ($10/mo)</b> inside the Console. Go is just another provider entry — the Console handles billing and limits.</div>
  <div class="mt-3 rounded-xl bg-zinc-900 text-white px-3 py-2.5 flex items-center justify-between">
    <span class="text-xs font-mono">opencode.ai/auth</span>
    <span class="text-[11px] px-2 py-1 rounded-full bg-white text-zinc-900 font-semibold">Subscribe to Go</span>
  </div>
</div>

<div class="rounded-xl bg-zinc-900 text-white p-3 text-[11px] leading-relaxed mt-4">
  <span class="font-semibold">Not required.</span> Use OpenCode without the Console (local keys, self-hosted). Add the Console when you want team controls, hosted inference, or Go.
</div>

<!--
Notes: List Console capabilities verbatim: gateway (Zen), usage & budget tracking, Admin/Member, allowlists, monthly caps, API keys, subscribe to Go. Cite both URLs. Attribute to Anomaly. Clarify optional.
-->

---
layout: center
class: text-center
---

<div class="max-w-3xl mx-auto">

<div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-800 text-xs font-medium">
  <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
  The problem with “just use the frontier”
</div>

## Frontier models are <span class="font-serif italic font-normal">amazing</span> — and <span class="text-zinc-400 line-through decoration-amber-400 decoration-2">unpredictable to pay for</span>

<div class="grid grid-cols-3 gap-4 text-left mt-8">

<div class="rounded-2xl border border-zinc-200 p-4 bg-white">
  <div class="text-2xl">💸</div>
  <div class="text-sm font-semibold mt-2">Spiky costs</div>
  <div class="text-xs text-zinc-500 mt-1 leading-relaxed">Per-token meters spin fast in long coding sessions.</div>
</div>

<div class="rounded-2xl border border-zinc-200 p-4 bg-white">
  <div class="text-2xl">⏳</div>
  <div class="text-sm font-semibold mt-2">Capacity crunches</div>
  <div class="text-xs text-zinc-500 mt-1 leading-relaxed">Rate limits & queues when everyone ships.</div>
</div>

<div class="rounded-2xl border border-violet-200 p-4 bg-violet-50/70">
  <div class="text-2xl">🔓</div>
  <div class="text-sm font-semibold mt-2">You want options</div>
  <div class="text-xs text-zinc-500 mt-1 leading-relaxed">Open models are fast, cheap, improving — if access is reliable.</div>
</div>

</div>

<div class="text-[11px] font-mono tracking-wide text-zinc-400 mt-6">GOAL → calm, flat pricing on curated open models with real capacity.</div>

</div>

---
layout: cover
background: "#111113"
class: text-white
---

<div class="absolute inset-0 opacity-40" style="background: radial-gradient(700px circle at 30% 20%, rgba(109,40,217,0.45), transparent 60%), radial-gradient(600px circle at 85% 70%, rgba(6,182,214,0.25), transparent 60%);"></div>

<div class="relative z-10 max-w-5xl mx-auto">

<div class="inline-flex items-center gap-2 text-[11px] tracking-[0.18em] uppercase font-mono text-white/50">
  <span class="w-8 h-px bg-white/20"></span> 05 — OpenCode Go
</div>

<div class="grid md:grid-cols-[1.15fr_0.85fr] gap-8 items-center mt-6">

<div>

# <span class="font-serif italic font-light">OpenCode Go</span>
## <span class="text-white/60 font-light text-xl -mt-2 block">A $10/month subscription</span>

<div class="text-sm leading-relaxed text-white/65 mt-4 max-w-[540px]">

Completely optional. Lives in the <b class="text-white/90">OpenCode Console</b> (<span class="font-mono text-xs">opencode.ai/auth</span>). Works like any other provider in OpenCode. Curated <b class="text-white">open coding models</b> with <b class="text-white">reserved GPU capacity</b> and <b class="text-white">bulk discounts</b>.

</div>

<div class="mt-6 flex flex-wrap gap-2 text-xs">
  <span class="px-2.5 py-1 rounded-full bg-white text-black font-semibold">$10 / month</span>
  <span class="px-2.5 py-1 rounded-full border border-white/15 text-white/70">Flat · predictable</span>
  <span class="px-2.5 py-1 rounded-full border border-white/15 text-white/70">opencode.ai/go</span>
</div>

</div>

<div class="rounded-2xl bg-white text-zinc-900 p-5 shadow-2xl">

<div class="text-[11px] font-mono tracking-widest text-zinc-400 uppercase">How value multiplies</div>

<div class="mt-3 flex items-baseline gap-2">
  <span class="text-4xl font-serif italic">$10</span>
  <span class="text-zinc-400">you pay</span>
  <span class="mx-2 text-zinc-300">→</span>
  <span class="text-4xl font-serif italic">~$60</span>
  <span class="text-zinc-400">of usage*</span>
</div>

<div class="text-[11px] text-zinc-500 mt-2">* Aim is roughly <b>6×</b> via bulk discounts + reserved GPUs. Limits per-model tiers — next slide.</div>

<div class="mt-4 grid grid-cols-3 gap-2 text-center">
  <div class="rounded-xl border border-zinc-200 p-2.5">
    <div class="text-[10px] font-mono tracking-widest text-zinc-400">5-HOUR</div>
    <div class="text-sm font-bold">$12</div>
    <div class="text-[10px] text-zinc-500">on $60/mo models</div>
  </div>
  <div class="rounded-xl border border-zinc-200 p-2.5">
    <div class="text-[10px] font-mono tracking-widest text-zinc-400">WEEKLY</div>
    <div class="text-sm font-bold">$30</div>
    <div class="text-[10px] text-zinc-500">on $60/mo models</div>
  </div>
  <div class="rounded-xl border border-violet-200 p-2.5 bg-violet-50">
    <div class="text-[10px] font-mono tracking-widest text-zinc-400">MONTHLY</div>
    <div class="text-sm font-bold">$60</div>
    <div class="text-[10px] text-zinc-500">on $60/mo models</div>
  </div>
</div>

<div class="text-[10px] text-zinc-400 mt-3 leading-relaxed">If you exceed Go limits and have Zen balance with <code>"Use balance"</code> on, it falls back to pay-as-you-go instead of blocking.</div>

</div>

</div>

</div>

---
layout: default
---

<div class="text-[11px] tracking-[0.2em] uppercase font-mono text-zinc-400 mb-2">06 — Pricing, precisely</div>

## Limits are **dollar amounts** <span class="font-serif italic font-normal text-zinc-500">— not token counters</span>

<div class="grid md:grid-cols-[1.25fr_0.75fr] gap-6 mt-6 items-start">

<div>

<div class="rounded-2xl border border-zinc-200 overflow-hidden bg-white">
  <div class="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
    <span class="text-xs font-semibold">Usage limits — example for <span class="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-mono text-[11px]">$60 / mo tier</span></span>
    <span class="text-[10px] font-mono text-zinc-400">5h · weekly · monthly</span>
  </div>
  <table class="w-full text-sm">
    <thead class="bg-zinc-50 text-[11px] font-mono tracking-widest text-zinc-500 uppercase">
      <tr><th class="text-left px-4 py-2 font-normal">Window</th><th class="text-left px-4 py-2 font-normal">Dollar limit</th><th class="text-left px-4 py-2 font-normal">What happens</th></tr>
    </thead>
    <tbody class="divide-y divide-zinc-100">
      <tr><td class="px-4 py-3 font-medium">5-hour</td><td class="px-4 py-3 font-mono">$12</td><td class="px-4 py-3 text-zinc-600 text-xs">Brief cool-down on that tier</td></tr>
      <tr><td class="px-4 py-3 font-medium">Weekly</td><td class="px-4 py-3 font-mono">$30</td><td class="px-4 py-3 text-zinc-600 text-xs">Resets weekly</td></tr>
      <tr><td class="px-4 py-3 font-medium">Monthly</td><td class="px-4 py-3 font-mono font-bold">$60</td><td class="px-4 py-3 text-zinc-600 text-xs">Cap for that tier. See fallback →</td></tr>
    </tbody>
  </table>
</div>

<div class="mt-3 text-[11px] text-zinc-500 leading-relaxed">Lower tiers ($15, $30) have proportionally lower caps. Live tiers at <code class="text-xs">GET https://opencode.ai/zen/go/v1/models</code></div>

</div>

<div class="space-y-3">

<div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
  <div class="text-xs font-bold flex items-center gap-2"><span class="i-carbon-checkmark-filled text-emerald-600"></span> ~6× value aim</div>
  <div class="text-xs text-zinc-600 mt-1 leading-relaxed">OpenCode negotiates bulk pricing + reserves GPUs so your $10 can cover roughly $60 of metered use on the $60 tier.</div>
</div>

<div class="rounded-2xl border border-zinc-200 bg-white p-4">
  <div class="text-xs font-bold flex items-center gap-2"><span class="i-carbon-arrows-horizontal text-zinc-500"></span> Over-limit fallback</div>
  <div class="text-xs text-zinc-600 mt-1 leading-relaxed">If you exceed Go limits and have <b>Zen balance</b> with <b>“Use balance”</b> enabled, requests fall back to Zen pay-as-you-go.</div>
  <div class="text-[11px] text-zinc-500 mt-2">Console: <span class="font-mono text-xs">opencode.ai/auth</span> → toggle on.</div>
</div>

<div class="rounded-xl bg-zinc-900 text-white p-3 flex items-center justify-between">
  <span class="text-xs font-mono">Monthly cost</span>
  <span class="text-sm font-bold">$10 <span class="font-normal text-white/60">flat</span></span>
</div>

</div>

</div>

---
layout: default
---

<div class="text-[11px] tracking-[0.2em] uppercase font-mono text-zinc-400 mb-2">07 — The lineup</div>

## The model lineup <span class="font-serif italic font-normal text-zinc-500">curated open models · tiers by monthly usage</span>

<div class="text-[11px] text-zinc-500 -mt-1 mb-4">List may change — check <span class="font-mono text-xs">opencode.ai/go</span> and <span class="font-mono text-xs">GET /zen/go/v1/models</span>.</div>

<div class="grid md:grid-cols-3 gap-3">

<div class="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
  <div class="flex items-center justify-between">
    <span class="text-xs font-bold tracking-wide">$60<span class="font-normal text-zinc-500">/mo tier</span></span>
    <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-600 text-white">higher usage</span>
  </div>
  <div class="text-[11px] text-zinc-500 mt-1">Most headroom per window.</div>
  <div class="mt-3 flex flex-wrap gap-1.5">
    <span class="model-chip">GLM-5.3-Flash</span>
    <span class="model-chip">Kimi K2.7 Code</span>
    <span class="model-chip">MiniMax M3</span>
    <span class="model-chip">MiniMax M2.7</span>
    <span class="model-chip">MiniMax M2.5</span>
    <span class="model-chip">Qwen3.7 Plus</span>
    <span class="model-chip">LongCat-2.0</span>
    <span class="model-chip">MiMo-V2.6-Flash</span>
    <span class="model-chip">MiMo-V2.5</span>
    <span class="model-chip">DeepSeek V4 Flash</span>
    <span class="model-chip">Hy3</span>
    <span class="model-chip">Muse Spark 1.3</span>
  </div>
</div>

<div class="rounded-2xl border border-zinc-200 bg-white p-4 flex flex-col">
  <div class="flex items-center justify-between">
    <span class="text-xs font-bold tracking-wide">$30<span class="font-normal text-zinc-500">/mo tier</span></span>
    <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 text-white">$30</span>
  </div>
  <div class="text-[11px] text-zinc-500 mt-1">Balanced tier.</div>
  <div class="mt-3 flex flex-wrap gap-1.5">
    <span class="model-chip muted">Qwen3.8 Flash</span>
    <span class="model-chip muted">Qwen3.7 Max</span>
  </div>
  <div class="mt-auto pt-4">
    <div class="rounded-xl border border-dashed border-zinc-200 p-2.5 bg-zinc-50">
      <div class="text-[11px] font-mono text-zinc-500">Config id format</div>
      <div class="font-mono text-xs mt-1">opencode-go/&lt;model-id&gt;</div>
      <div class="text-[11px] text-zinc-500 mt-1">e.g. <code>opencode-go/kimi-k3</code></div>
    </div>
  </div>
</div>

<div class="rounded-2xl border border-zinc-200 bg-white p-4">
  <div class="flex items-center justify-between">
    <span class="text-xs font-bold tracking-wide">$15<span class="font-normal text-zinc-500">/mo tier</span></span>
    <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white border border-zinc-200 text-zinc-700">$15</span>
  </div>
  <div class="text-[11px] text-zinc-500 mt-1">Large curated set.</div>
  <div class="mt-3 flex flex-wrap gap-1.5">
    <span class="model-chip muted">GLM-5.3</span>
    <span class="model-chip muted">GLM-5.2</span>
    <span class="model-chip muted">GLM-5.1</span>
    <span class="model-chip muted">Kimi K3</span>
    <span class="model-chip muted">Qwen3.8 Max</span>
    <span class="model-chip muted">Grok 4.7</span>
    <span class="model-chip muted">Grok 4.6</span>
    <span class="model-chip muted">GPT 6 Luna</span>
    <span class="model-chip muted">GPT 5.6 Luna</span>
    <span class="model-chip muted">DeepSeek V4 Pro</span>
    <span class="model-chip muted">DeepSeek V4.1 Flash</span>
    <span class="model-chip muted">MiMo-V2.6-Pro</span>
    <span class="model-chip muted">MiMo-V2.5-Pro</span>
    <span class="model-chip muted">Hy4 preview</span>
  </div>
  <div class="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-2.5">
    <div class="text-[11px] font-bold text-emerald-800">Free — limited time</div>
    <div class="flex flex-wrap gap-1.5 mt-1.5"><span class="model-chip free">Space Bunny Free</span></div>
  </div>
</div>

</div>

---
layout: two-cols
class: gap-6
---


<div class="text-[11px] tracking-[0.2em] uppercase font-mono text-zinc-400 mb-3">08 — Who builds them</div>

## Model families <span class="font-serif italic font-normal text-zinc-500">& labs</span>

<div class="text-xs text-zinc-500 mt-2 leading-relaxed">OpenCode Go pulls from the strongest open labs — switch without switching subscriptions.</div>

<div class="mt-5 grid grid-cols-2 gap-2.5">

<div class="rounded-xl border border-zinc-200 p-3 bg-white">
  <div class="text-[11px] font-mono tracking-widest text-zinc-400">MOONSHOT</div>
  <div class="text-sm font-semibold">Kimi</div>
  <div class="text-[11px] text-zinc-500">K2.7 Code · K3</div>
</div>

<div class="rounded-xl border border-zinc-200 p-3 bg-white">
  <div class="text-[11px] font-mono tracking-widest text-zinc-400">ALIBABA</div>
  <div class="text-sm font-semibold">Qwen</div>
  <div class="text-[11px] text-zinc-500">3.7 / 3.8 Plus · Max · Flash</div>
</div>

<div class="rounded-xl border border-zinc-200 p-3 bg-white">
  <div class="text-[11px] font-mono tracking-widest text-zinc-400">ZHIPU</div>
  <div class="text-sm font-semibold">GLM</div>
  <div class="text-[11px] text-zinc-500">5.1 · 5.2 · 5.3 · Flash</div>
</div>

<div class="rounded-xl border border-zinc-200 p-3 bg-white">
  <div class="text-[11px] font-mono tracking-widest text-zinc-400">MINIMAX</div>
  <div class="text-sm font-semibold">MiniMax</div>
  <div class="text-[11px] text-zinc-500">M2.5 · M2.7 · M3</div>
</div>

<div class="rounded-xl border border-zinc-200 p-3 bg-white">
  <div class="text-[11px] font-mono tracking-widest text-zinc-400">DEEPSEEK</div>
  <div class="text-sm font-semibold">DeepSeek</div>
  <div class="text-[11px] text-zinc-500">V4 Pro · V4 Flash · V4.1 Flash</div>
</div>

<div class="rounded-xl border border-zinc-200 p-3 bg-white">
  <div class="text-[11px] font-mono tracking-widest text-zinc-400">XIAOMI · XAI · OPENAI</div>
  <div class="text-sm font-semibold">MiMo · Grok · Luna</div>
  <div class="text-[11px] text-zinc-500">MiMo V2.5/2.6 · Grok 4.6/4.7 · GPT Luna</div>
</div>

</div>

::right::

<div class="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
  <div class="text-xs font-bold">Why “curated” matters</div>
  <ul class="text-xs text-zinc-600 mt-2 space-y-1.5 leading-relaxed list-disc pl-4">
    <li>Every model is chosen for <b>coding</b> — not chat benchmarks.</li>
    <li>Tiers reflect real capacity costs, so limits are honest.</li>
    <li>Same <code class="text-[11px]">opencode-go/*</code> ids everywhere.</li>
  </ul>
</div>

<div class="rounded-2xl bg-zinc-900 text-white p-4 mt-4">
  <div class="text-[11px] font-mono tracking-widest text-white/50 uppercase">Also in the mix</div>
  <div class="flex flex-wrap gap-1.5 mt-3">
    <span class="px-2 py-1 rounded-full bg-white/10 border border-white/10 text-xs">LongCat-2.0</span>
    <span class="px-2 py-1 rounded-full bg-white/10 border border-white/10 text-xs">Hy3 · Hy4 preview</span>
    <span class="px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/20 text-xs text-emerald-200">Space Bunny Free</span>
  </div>
  <div class="text-[11px] text-white/50 mt-3 leading-relaxed">Families evolve. Check the live catalog.</div>
</div>

<div class="text-[11px] font-mono text-zinc-400 mt-3">Tip: <span class="text-zinc-700 font-semibold">/models</span> in the TUI shows live.</div>

---
layout: center
class: bg-zinc-50
---

<div class="max-w-5xl mx-auto w-full">

<div class="text-[11px] tracking-[0.2em] uppercase font-mono text-zinc-400 mb-3 text-center">09 — Connect in 4 steps</div>

## How to subscribe <span class="font-serif italic font-normal text-zinc-500">& connect</span>

<div class="grid md:grid-cols-4 gap-3 mt-6 text-left">

<div class="rounded-2xl border border-zinc-200 bg-white p-4 relative overflow-hidden">
  <div class="absolute top-3 right-3 w-6 h-6 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-bold">1</div>
  <div class="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center"><span class="i-carbon-login text-violet-600"></span></div>
  <div class="text-sm font-semibold mt-3">Sign in & subscribe</div>
  <div class="text-xs text-zinc-500 mt-1 leading-relaxed">Go to <span class="font-mono text-zinc-700">opencode.ai/auth</span> (Console) and subscribe to Go.</div>
  <div class="text-[11px] font-mono text-zinc-400 mt-2">→ $10/mo</div>
</div>

<div class="rounded-2xl border border-zinc-200 bg-white p-4 relative overflow-hidden">
  <div class="absolute top-3 right-3 w-6 h-6 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-bold">2</div>
  <div class="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center"><span class="i-carbon-api-key text-white"></span></div>
  <div class="text-sm font-semibold mt-3">Copy your API key</div>
  <div class="text-xs text-zinc-500 mt-1 leading-relaxed">From the Console after subscribing.</div>
  <div class="text-[11px] font-mono text-zinc-400 mt-2">opencode.ai/auth</div>
</div>

<div class="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 relative overflow-hidden">
  <div class="absolute top-3 right-3 w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold">3</div>
  <div class="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center"><span class="i-carbon-connect text-white"></span></div>
  <div class="text-sm font-semibold mt-3"><code class="text-sm">/connect</code></div>
  <div class="text-xs text-zinc-500 mt-1 leading-relaxed">In the TUI run <b>/connect</b> → select <b>OpenCode Go</b> → paste key.</div>
  <div class="text-[11px] font-mono text-zinc-400 mt-2">TUI command</div>
</div>

<div class="rounded-2xl border border-zinc-200 bg-white p-4 relative overflow-hidden">
  <div class="absolute top-3 right-3 w-6 h-6 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-bold">4</div>
  <div class="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center"><span class="i-carbon-list text-emerald-700"></span></div>
  <div class="text-sm font-semibold mt-3"><code class="text-sm">/models</code></div>
  <div class="text-xs text-zinc-500 mt-1 leading-relaxed">List Go models. Id format:</div>
  <div class="font-mono text-xs mt-2 px-2 py-1 rounded bg-zinc-900 text-white inline-block">opencode-go/kimi-k3</div>
</div>

</div>

<div class="mt-5 rounded-xl border border-zinc-200 bg-white p-3 flex flex-wrap items-center justify-between gap-3">
  <div class="text-xs text-zinc-600"><span class="font-semibold">Docs:</span> <span class="font-mono">opencode.ai/docs/go</span> <span class="text-zinc-300 mx-1">·</span> <span class="font-mono">opencode.ai/go</span> <span class="text-zinc-300 mx-1">·</span> <span class="font-mono">opencode.ai/v2/docs/console</span></div>
  <div class="text-[11px] font-mono text-zinc-500">Model ids are <b class="text-zinc-700">opencode-go/&lt;model-id&gt;</b> everywhere</div>
</div>

</div>

---
layout: two-cols
class: gap-6
---


<div class="text-[11px] tracking-[0.2em] uppercase font-mono text-zinc-400 mb-3">10 — Works everywhere</div>

## Use it with <span class="font-serif italic">any agent</span>

<div class="text-sm text-zinc-600 leading-relaxed mt-2">

Go endpoints are **OpenAI-compatible** and **Anthropic-compatible**. If your agent speaks those APIs, it can speak Go.

</div>

<div class="mt-5 space-y-2.5">

<div class="flex items-center gap-3 rounded-xl border border-zinc-200 p-2.5 bg-white">
  <span class="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center text-[10px] font-bold">CC</span>
  <span class="text-sm font-medium">Claude Code</span>
  <span class="ml-auto text-[11px] font-mono text-zinc-400">+ x-opencode-session</span>
</div>

<div class="flex items-center gap-3 rounded-xl border border-zinc-200 p-2.5 bg-white">
  <span class="w-8 h-8 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center text-[10px] font-bold">CX</span>
  <span class="text-sm font-medium">Codex · Kilo Code CLI</span>
  <span class="ml-auto text-[11px] font-mono text-zinc-400">any OpenAI client</span>
</div>

<div class="flex items-center gap-3 rounded-xl border border-zinc-200 p-2.5 bg-white">
  <span class="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center text-[10px] font-bold text-violet-700">◐</span>
  <span class="text-sm font-medium">Hermes · ZCode · Pi · jcode</span>
  <span class="ml-auto text-[11px] font-mono text-zinc-400">+ more</span>
</div>

</div>

<div class="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3">
  <div class="text-xs font-semibold text-amber-900 flex items-center gap-1.5"><span class="i-carbon-warning text-amber-600"></span> One header rule</div>
  <div class="text-xs text-zinc-600 mt-1 leading-relaxed">Send typical <b>coding-agent traffic</b> with a stable <code class="text-xs">x-opencode-session</code> header and your own <code class="text-xs">User-Agent</code>.</div>
</div>

::right::

<div class="rounded-2xl bg-zinc-950 text-white p-3 shadow-xl">
  <div class="flex items-center justify-between">
    <span class="text-[11px] font-mono tracking-widest text-white/50">ENDPOINTS</span>
    <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 border border-white/10">opencode.ai/zen/go/v1</span>
  </div>
</div>

```ts {all|2-3|5-7}
// OpenAI-compatible
POST https://opencode.ai/zen/go/v1/chat/completions
POST https://opencode.ai/zen/go/v1/responses

// Anthropic-compatible
POST https://opencode.ai/zen/go/v1/messages

// Catalog
GET  https://opencode.ai/zen/go/v1/models
```

<div class="rounded-2xl bg-zinc-950 text-white p-3 -mt-2">
<div class="text-[11px] font-mono text-white/50 leading-relaxed">Use your Go API key as the bearer token. Keep <code class="text-white/80">x-opencode-session</code> stable per session.</div>
</div>

<div class="mt-3 text-[11px] text-zinc-500 leading-relaxed">Go is <b>not</b> locked to OpenCode — but it <i>does</i> expect agent-shaped traffic. Plain chat bots without session headers aren’t the intended use.</div>

---
layout: center
class: text-center
---

<div class="max-w-4xl mx-auto">

<div class="text-[11px] tracking-[0.2em] uppercase font-mono text-zinc-400 mb-3">11 — Under the hood</div>

## Endpoints & compatibility

<div class="grid md:grid-cols-3 gap-4 text-left mt-8">

<div class="rounded-2xl border border-zinc-200 bg-white p-5">
  <div class="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center"><span class="i-carbon-code"></span></div>
  <div class="text-sm font-bold mt-3">OpenAI-compatible</div>
  <div class="font-mono text-xs text-zinc-500 mt-1">/chat/completions · /responses</div>
  <div class="text-xs text-zinc-600 mt-2 leading-relaxed">Drop-in for any tool that already talks OpenAI. Base URL: <br /><span class="font-mono text-xs">https://opencode.ai/zen/go/v1/</span></div>
</div>

<div class="rounded-2xl border border-zinc-200 bg-white p-5">
  <div class="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center"><span class="i-carbon-catalog"></span></div>
  <div class="text-sm font-bold mt-3">Anthropic-compatible</div>
  <div class="font-mono text-xs text-zinc-500 mt-1">/messages</div>
  <div class="text-xs text-zinc-600 mt-2 leading-relaxed">Same key, same base URL. Great for Claude-style clients.</div>
</div>

<div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
  <div class="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center"><span class="i-carbon-list"></span></div>
  <div class="text-sm font-bold mt-3">Catalog</div>
  <div class="font-mono text-xs text-zinc-500 mt-1">GET /models</div>
  <div class="text-xs text-zinc-600 mt-2 leading-relaxed">Live model list + tiers + ids. Source of truth — don’t cache forever.</div>
</div>

</div>

<div class="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 flex flex-wrap items-center justify-center gap-2 text-xs">
  <span class="font-mono text-zinc-500">Config id</span>
  <span class="font-mono px-2 py-1 rounded bg-zinc-900 text-white">opencode-go/kimi-k3</span>
  <span class="text-zinc-300">·</span>
  <span class="font-mono text-zinc-500">Header</span>
  <span class="font-mono px-2 py-1 rounded bg-white border border-zinc-200">x-opencode-session: &lt;stable-id&gt;</span>
</div>

</div>

---
layout: section
class: text-center
---

<div class="text-[11px] tracking-[0.3em] uppercase font-mono text-white/50 mb-4">At home</div>

# Run OpenCode <span class="font-serif italic font-light">at home</span> — always-on

<div class="text-sm text-white/60 mt-3 max-w-2xl mx-auto leading-relaxed">

Home server · mini-PC · Raspberry Pi · NAS. A headless <code class="text-white/80">opencode serve</code> you can reach from any device on your LAN — TUI, Web, or phone.

</div>

<div class="mt-8 inline-flex flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-full bg-white text-zinc-900 font-mono text-sm shadow-xl">
  <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> opencode serve
  <span class="text-zinc-400">+</span> opencode web
  <span class="text-zinc-400">→</span> <span class="text-zinc-500">http://192.168.1.100:4096</span>
</div>

<!--
Speaker notes: New home-server arc — always-on, practical. Keep it LAN-only, secure, and simple. Flags + config come next.
-->

---
layout: two-cols
class: gap-6
---


<div class="text-[11px] tracking-[0.2em] uppercase font-mono text-zinc-400 mb-3">12 — Serve vs Web</div>

## `opencode serve` <span class="font-serif italic font-normal text-zinc-500">vs</span> `opencode web`

<div class="text-sm text-zinc-600 leading-relaxed mt-2"><b class="text-zinc-900">serve</b> = headless server. <b class="text-zinc-900">web</b> = same server + opens browser UI. Same sessions, same state.</div>

<div class="rounded-2xl bg-zinc-950 text-white p-3 mt-3">
  <div class="flex items-center justify-between"><span class="text-[11px] font-mono tracking-widest text-white/40 uppercase">Flags — serve & web share them</span><span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 border border-white/10">CLI overrides config</span></div>
</div>

<div class="rounded-2xl border border-zinc-200 bg-white p-3 -mt-1">
  <table class="w-full text-xs">
    <tbody class="divide-y divide-zinc-100">
      <tr><td class="py-2 font-mono pr-3">--port</td><td class="py-2 text-zinc-500">default <code class="text-xs">4096</code></td></tr>
      <tr><td class="py-2 font-mono pr-3">--hostname</td><td class="py-2 text-zinc-500">default <code class="text-xs">127.0.0.1</code></td></tr>
      <tr><td class="py-2 font-mono pr-3">--mdns</td><td class="py-2 text-zinc-500">advertise <code class="text-xs">opencode.local</code> (implies 0.0.0.0)</td></tr>
      <tr><td class="py-2 font-mono pr-3">--mdns-domain</td><td class="py-2 text-zinc-500">default <code class="text-xs">opencode.local</code> — custom per instance</td></tr>
      <tr><td class="py-2 font-mono pr-3">--cors &lt;origin&gt;</td><td class="py-2 text-zinc-500">repeatable — allow CORS origin</td></tr>
    </tbody>
  </table>
</div>

```bash {all|1|2|3}
opencode serve --port 4096 --hostname 127.0.0.1
opencode serve --mdns --mdns-domain myproject.local
opencode web --cors http://localhost:5173 --cors https://app.example.com
```

::right::

<div class="rounded-2xl border border-zinc-200 bg-white p-4">
  <div class="text-xs font-bold flex items-center gap-2"><span class="i-carbon-settings text-zinc-500"></span> Config file — opencode.json</div>
  <div class="text-[11px] text-zinc-500 mt-1">CLI flags override this file.</div>
</div>

```json {all|2-5}
{
  "$schema": "https://opencode.ai/config.json",
  "server": {
    "port": 4096,
    "hostname": "0.0.0.0",
    "mdns": true,
    "mdnsDomain": "myproject.local",
    "cors": ["http://localhost:5173"]
  }
}
```

<div class="rounded-xl bg-zinc-900 text-white p-3 -mt-1">
  <div class="text-[11px] font-mono tracking-widest text-white/50 uppercase">Docs</div>
  <div class="text-[11px] text-white/70 mt-1 font-mono leading-relaxed">opencode.ai/docs/web · opencode.ai/docs/serve</div>
</div>

<div class="rounded-xl border border-amber-200 bg-amber-50 p-3 mt-3">
  <div class="text-xs font-bold flex items-center gap-1.5"><span class="i-carbon-warning text-amber-600"></span> Bind wisely</div>
  <div class="text-xs text-zinc-600 mt-1 leading-relaxed"><code class="text-xs">127.0.0.1</code> = localhost only. <code class="text-xs">0.0.0.0</code> = your whole LAN can reach it — set a password.</div>
</div>

<!--
Notes: Accurate v1 flags. Config example is verbatim. Stress CLI overrides config. mDNS default opencode.local. cors repeatable.
-->

---
layout: two-cols
class: gap-6
---


<div class="text-[11px] tracking-[0.2em] uppercase font-mono text-zinc-400 mb-3">13 — Keep it running</div>

## Home server: <span class="font-serif italic">systemd</span> or Docker

<div class="text-sm text-zinc-600 leading-relaxed mt-2">Run it as a foreground service. Works on a mini-PC, Pi, or NAS — no cloud needed.</div>

<div class="rounded-2xl border border-zinc-200 bg-white p-4 mt-4">
  <div class="text-xs font-bold flex items-center gap-2"><span class="i-carbon-settings text-zinc-500"></span> systemd — foreground service</div>
  <div class="text-[11px] text-zinc-500 mt-1">Restart=always. ExecStart runs serve directly.</div>
</div>

```ini
[Service]
ExecStart=/usr/local/bin/opencode serve --hostname 0.0.0.0 --port 4096
Restart=always
```

<div class="rounded-2xl border border-zinc-200 bg-white p-4 mt-3">
  <div class="text-xs font-bold flex items-center gap-2"><span class="i-carbon-logo-docker text-zinc-500"></span> Docker</div>
</div>

```bash
docker run -it --rm -p 4096:4096 -v $(pwd):/app \
  -e OPENCODE_SERVER_PASSWORD=secret \
  ghcr.io/anomalyco/opencode serve --hostname 0.0.0.0 --port 4096
```

::right::

<div class="rounded-2xl bg-zinc-950 text-white p-3">
  <div class="text-[11px] font-mono tracking-widest text-white/50 uppercase">Connect any client</div>
  <div class="text-xs text-white/60 mt-2 leading-relaxed">TUI shares the same sessions/state when you <b class="text-white">attach</b>. v2 also supports <code class="text-white/80">--server</code>.</div>
</div>

```bash
# TUI attaches to the home server
opencode attach http://192.168.1.100:4096
opencode attach http://opencode.local:4096

# v2 — direct server flag
opencode --server http://127.0.0.1:4096
```

<div class="rounded-xl border border-violet-200 bg-violet-50 p-3 mt-3">
  <div class="text-xs font-bold text-violet-900 flex items-center gap-1.5"><span class="i-carbon-information text-violet-600"></span> Same state everywhere</div>
  <div class="text-xs text-zinc-600 mt-1 leading-relaxed">Start a session on your laptop, continue it from your phone or desktop — all via the same server.</div>
</div>

<div class="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-3 mt-3">
  <div class="text-[11px] font-mono tracking-widest text-zinc-400 uppercase">Framing</div>
  <div class="text-xs text-zinc-600 mt-1 leading-relaxed">Think “home lab” — always-on, LAN-only, password-protected. No port-forwarding to the internet.</div>
</div>

<!--
Notes: Verbatim systemd ExecStart and docker run. Highlight attach flow and v2 --server flag. Keep LAN-only guidance.
-->

---
layout: two-cols
class: gap-6
---


<div class="text-[11px] tracking-[0.2em] uppercase font-mono text-zinc-400 mb-3">14 — v2 beta extras</div>

## Shared background <span class="font-serif italic font-normal text-zinc-500">service (v2 beta)</span>

<div class="text-sm text-zinc-600 leading-relaxed mt-2">v2 adds a persistent <b>shared background service</b> — settings survive restarts. Default port <code class="text-xs">49374</code>.</div>

<div class="rounded-2xl border border-zinc-200 bg-white p-4 mt-4">
  <div class="text-xs font-bold">Configure once</div>
  <div class="text-[11px] text-zinc-500 mt-1">Settings persist to <code class="text-xs">~/.config/opencode/service.json</code></div>
</div>

```bash
opencode service set hostname 0.0.0.0
opencode service set port 49374
opencode service set password "..."
opencode service set cors https://app.example.com
opencode service start
```

<div class="rounded-xl bg-zinc-900 text-white p-3 -mt-1">
  <div class="text-[11px] font-mono tracking-widest text-white/50 uppercase">Toggle</div>
  <div class="text-xs text-white/80 mt-1"><code class="text-white">opencode service stop</code> · check <code class="text-white">~/.config/opencode/service.json</code></div>
</div>

::right::

<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4">
  <div class="text-xs font-bold flex items-center gap-1.5"><span class="i-carbon-warning text-amber-600"></span> v1 vs v2</div>
  <table class="w-full text-xs mt-2">
    <tbody class="divide-y divide-amber-100">
      <tr><td class="py-2 font-medium">v1 stable</td><td class="py-2 text-zinc-600"><code class="text-xs">serve / web / attach</code><br />port 4096</td></tr>
      <tr><td class="py-2 font-medium">v2 beta</td><td class="py-2 text-zinc-600">shared service<br />port 49374 + <code class="text-xs">pair</code> QR</td></tr>
    </tbody>
  </table>
  <div class="text-[11px] text-zinc-600 mt-2 leading-relaxed">Keep the distinction clear — v1 commands are stable; service/pair are beta.</div>
</div>

<div class="rounded-2xl border border-zinc-200 bg-white p-4 mt-4">
  <div class="text-xs font-bold">When to use the service</div>
  <ul class="text-xs text-zinc-600 mt-2 space-y-1 leading-relaxed list-disc pl-4">
    <li>Always-on Pi/NAS that should survive reboot.</li>
    <li>Multiple users/devices hitting the same host.</li>
    <li>Pair with phone via QR (next slides).</li>
  </ul>
</div>

<!--
Notes: Call out v2 beta separately. Persist path verbatim. Default ports: 4096 v1, 49374 v2.
-->

---
layout: section
class: text-center
---

<div class="text-[11px] tracking-[0.3em] uppercase font-mono text-white/50 mb-4">OpenCode Web</div>

# Browser UI for the <span class="font-serif italic font-light">same</span> local server

<div class="text-sm text-white/60 mt-3 max-w-2xl mx-auto leading-relaxed">

No separate cloud editor. Web is a view onto the **same process** that powers your TUI — same sessions, same filesystem, same state. Start it beside your terminal.

</div>

<div class="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-zinc-900 font-mono text-sm shadow-xl">
  <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> opencode web
  <span class="text-zinc-400">→</span>
  <span class="text-zinc-500">http://127.0.0.1:4096</span>
</div>

<!--
Notes: Bridge into phone story — Web is the mobile story too, no native app.
-->

---
layout: two-cols
class: gap-8
---


<div class="text-[11px] tracking-[0.2em] uppercase font-mono text-zinc-400 mb-3">15 — Local-first web</div>

## `opencode web`

<div class="text-sm text-zinc-600 leading-relaxed mt-2">Starts a web UI on a <b>random port on 127.0.0.1</b> and opens your browser. Same sessions you see in the TUI.</div>

<div class="rounded-2xl bg-zinc-950 text-white p-3 mt-3">
  <div class="text-[11px] font-mono tracking-widest text-white/40 uppercase mb-1">Run it</div>
</div>

```bash {all|1|2-4}
opencode web
opencode web --port 4096 --hostname 0.0.0.0
opencode web --mdns          # → opencode.local
opencode web --mdns --mdns-domain mylab.local
```

<div class="rounded-lg bg-zinc-900 text-white border border-white/10 p-2.5 -mt-1">
  <div class="text-[11px] font-mono text-white/50">What you see</div>
  <div class="text-xs text-white/80 mt-1 leading-relaxed">Sessions — view & start new ones<br />“See Servers” — status view for connected servers</div>
</div>

::right::

<div class="rounded-2xl border border-zinc-200 bg-white p-4">
  <div class="text-xs font-bold flex items-center gap-2"><span class="i-carbon-settings text-zinc-500"></span> Flags</div>
  <table class="w-full text-xs mt-2">
    <tbody class="divide-y divide-zinc-100">
      <tr><td class="py-2 font-mono pr-3">--port 4096</td><td class="py-2 text-zinc-500">Pin the port</td></tr>
      <tr><td class="py-2 font-mono pr-3">--hostname 0.0.0.0</td><td class="py-2 text-zinc-500">Network access; prints Local + Network URLs</td></tr>
      <tr><td class="py-2 font-mono pr-3">--mdns</td><td class="py-2 text-zinc-500">Advertise <span class="font-mono text-xs">opencode.local</span> (implies 0.0.0.0)</td></tr>
      <tr><td class="py-2 font-mono pr-3">--mdns-domain</td><td class="py-2 text-zinc-500">Custom mDNS domain</td></tr>
      <tr><td class="py-2 font-mono pr-3">--cors &lt;origin&gt;</td><td class="py-2 text-zinc-500">Allow CORS origin</td></tr>
    </tbody>
  </table>
  <div class="text-[11px] text-zinc-500 mt-2">CLI flags override <code class="text-xs">opencode.json</code> server config.</div>
</div>

<div class="rounded-xl border border-amber-200 bg-amber-50 p-3 mt-3">
  <div class="text-xs font-bold flex items-center gap-2"><span class="i-carbon-locked text-amber-600"></span> Auth when exposed</div>
</div>

```bash {all|1}
OPENCODE_SERVER_PASSWORD=secret opencode web
# username defaults to "opencode"
# override: OPENCODE_SERVER_USERNAME=myname
```

<div class="rounded-xl border border-amber-200 bg-amber-50 p-3 -mt-1">
<div class="text-[11px] text-zinc-600 leading-relaxed">Enables HTTP basic auth. Use it whenever you bind beyond localhost.</div>
</div>

---
layout: two-cols
class: gap-6
---


<div class="text-[11px] tracking-[0.2em] uppercase font-mono text-zinc-400 mb-3">16 — One server, any surface</div>

## Attach a TUI <span class="font-serif italic font-normal text-zinc-500">to the running server</span>

<div class="text-sm text-zinc-600 leading-relaxed mt-2">Web and TUI share <b>sessions & state</b>. Attach instead of starting a second server.</div>

<div class="rounded-2xl bg-zinc-950 text-white p-3 mt-3">
  <div class="text-[11px] font-mono tracking-widest text-white/40 uppercase">Attach</div>
</div>

```bash
# 1. start web (or any opencode server)
opencode web --port 4096

# 2. attach a TUI to it
opencode attach http://localhost:4096
```

<div class="rounded-lg bg-zinc-900 text-white p-3 -mt-1">
<div class="text-xs text-white/60 leading-relaxed">You’re now driving the <b class="text-white">same server</b> — create a session in the browser, continue it in the terminal, and vice-versa.</div>
</div>

<div class="mt-3 rounded-xl border border-zinc-200 bg-white p-3">
  <div class="text-xs font-semibold">Config alternative</div>
</div>

```json {all|2-7}
{
  "server": {
    "port": 4096,
    "hostname": "0.0.0.0",
    "mdns": true,
    "cors": ["https://example.com"]
  }
}
```

<div class="rounded-xl border border-zinc-200 bg-zinc-50 p-2 -mt-1">
<div class="text-[11px] text-zinc-500">In <code class="text-xs">opencode.json</code>. CLI flags still win.</div>
</div>

::right::

<div class="rounded-2xl border border-zinc-200 bg-white p-4">
  <div class="text-xs font-bold">Mental model</div>
  <div class="mt-3 flex items-center justify-center gap-2">
    <div class="rounded-xl border-2 border-zinc-900 bg-zinc-50 px-3 py-2 text-center">
      <div class="text-[10px] font-mono tracking-widest text-zinc-500">SERVER</div>
      <div class="text-xs font-bold">opencode</div>
      <div class="text-[11px] text-zinc-500">127.0.0.1:4096</div>
    </div>
  </div>
  <div class="mt-3 grid grid-cols-2 gap-2">
    <div class="rounded-xl border border-violet-200 bg-violet-50 p-2.5 text-center">
      <div class="text-xs font-semibold">TUI</div>
      <div class="text-[11px] text-zinc-500">attach</div>
    </div>
    <div class="rounded-xl border border-zinc-200 bg-white p-2.5 text-center">
      <div class="text-xs font-semibold">Web</div>
      <div class="text-[11px] text-zinc-500">browser</div>
    </div>
  </div>
  <div class="text-[11px] text-zinc-500 mt-3 text-center leading-relaxed">One filesystem · one session store · two views</div>
</div>

<div class="rounded-xl bg-zinc-900 text-white p-3 text-xs leading-relaxed mt-3">
  <span class="font-semibold">Tip:</span> Start web first, then <code class="text-white bg-white/10 px-1 py-0.5 rounded">attach</code>. Don’t run two servers on the same project.
</div>

---
layout: two-cols
class: gap-6
---


<div class="text-[11px] tracking-[0.2em] uppercase font-mono text-zinc-400 mb-3">17 — Talk to your chat from your phone</div>

## OpenCode Web <span class="font-serif italic font-normal text-zinc-500">on your LAN</span>

<div class="text-sm text-zinc-600 leading-relaxed mt-2">Same server, now on your phone. <b>No native app</b> — the responsive Web UI <i>is</i> the mobile story.</div>

<div class="rounded-2xl bg-zinc-950 text-white p-3 mt-3">
  <div class="text-[11px] font-mono tracking-widest text-white/40 uppercase">On the home machine</div>
</div>

```bash
OPENCODE_SERVER_PASSWORD=secret opencode web --hostname 0.0.0.0 --port 4096
# prints:
# Local access   http://localhost:4096
# Network access http://192.168.1.100:4096
```

<div class="rounded-xl border border-violet-200 bg-violet-50 p-3 -mt-1">
  <div class="text-xs font-bold text-violet-900">On your phone (same Wi-Fi)</div>
  <div class="text-xs text-zinc-600 mt-1 leading-relaxed">Open the <b>Network access</b> URL → log in. Username defaults to <code class="text-xs">opencode</code>, password is <code class="text-xs">OPENCODE_SERVER_PASSWORD</code>. Override username with <code class="text-xs">OPENCODE_SERVER_USERNAME</code>.</div>
</div>

<div class="rounded-xl border border-zinc-200 bg-white p-3 mt-3 flex items-center gap-3">
  <span class="w-7 h-7 rounded-full bg-zinc-900 text-white flex items-center justify-center text-[10px] font-mono">IP</span>
  <div class="text-xs"><span class="font-semibold">Same sessions as desktop:</span> <span class="font-mono text-zinc-600">opencode attach http://192.168.1.100:4096</span></div>
</div>

::right::

<div class="rounded-2xl border border-zinc-200 bg-white p-4">
  <div class="text-xs font-bold flex items-center gap-2"><span class="i-carbon-wifi text-zinc-500"></span> Skip typing IPs — mDNS</div>
  <div class="text-xs text-zinc-600 mt-1 leading-relaxed"><code class="text-xs">--mdns</code> advertises <code class="text-xs">opencode.local</code> and <b>implies</b> <code class="text-xs">--hostname 0.0.0.0</code>. Multiple instances: <code class="text-xs">--mdns-domain myproject.local</code></div>
</div>

```bash
opencode web --mdns
# → http://opencode.local:4096

opencode web --mdns --mdns-domain myproject.local
# → http://myproject.local:4096
```

<div class="rounded-2xl border border-violet-200 bg-violet-50 p-4 mt-3">
  <div class="text-xs font-bold flex items-center gap-2"><span class="i-carbon-qr-code text-violet-600"></span> v2 beta — opencode pair (QR)</div>
  <div class="text-xs text-zinc-600 mt-1 leading-relaxed">Prints URL, username, password and a <b>QR code</b> — scan it on your phone.</div>
</div>

```bash
opencode pair
# default http://127.0.0.1:49374
# change: opencode service set hostname/port/password ...
```

<div class="rounded-2xl border border-red-200 bg-red-50 p-3 mt-3">
  <div class="text-xs font-bold flex items-center gap-1.5"><span class="i-carbon-warning-alt text-red-600"></span> Security</div>
  <ul class="text-[11px] text-zinc-700 mt-1.5 space-y-1 leading-relaxed list-disc pl-4">
    <li>If <code class="text-xs">OPENCODE_SERVER_PASSWORD</code> is <b>unset</b> the server is <b>unsecured</b> — fine on localhost, always set it when binding to <code class="text-xs">0.0.0.0</code>.</li>
    <li><code class="text-xs">0.0.0.0</code> exposes to your <b>whole LAN</b>.</li>
    <li><b>Do NOT port-forward</b> to the internet. For outside-home access use a <b>VPN</b> (Tailscale/WireGuard) or TLS reverse proxy — general best practice, not an official recommendation.</li>
  </ul>
</div>

<!--
Notes: Phone story is LAN-only. Password auth details verbatim. mDNS implies 0.0.0.0. v2 pair QR default 127.0.0.1:49374. Security notes verbatim. No native app.
-->

---
layout: two-cols
class: gap-6
---


<div class="text-[11px] tracking-[0.2em] uppercase font-mono text-zinc-400 mb-2">18 — Share links (distinct from Web)</div>

## Sharing <span class="font-serif italic font-normal text-zinc-500">is a public link — not the Web UI</span>

<div class="rounded-xl border border-zinc-200 bg-white px-3 py-2 flex items-center justify-between mt-3">
  <span class="text-xs font-bold">In the TUI</span>
  <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 text-white">/share · /unshare</span>
</div>

```bash
# create a public link for the current session
/share
# → https://opencode.ai/s/<id>

/unshare  # remove it
```

<div class="grid grid-cols-3 gap-2 text-center mt-3">
  <div class="rounded-xl border border-zinc-200 p-2.5 bg-white">
    <div class="text-[11px] font-mono tracking-widest text-zinc-400">DEFAULT</div>
    <div class="text-xs font-bold mt-1">manual</div>
    <div class="text-[11px] text-zinc-500 leading-tight mt-1">Opt-in per session</div>
  </div>
  <div class="rounded-xl border border-zinc-200 p-2.5 bg-white">
    <div class="text-[11px] font-mono tracking-widest text-zinc-400">OPT-IN</div>
    <div class="text-xs font-bold mt-1">auto</div>
    <div class="text-[11px] text-zinc-500 leading-tight mt-1">Every session gets a link</div>
  </div>
  <div class="rounded-xl border border-red-200 bg-red-50 p-2.5">
    <div class="text-[11px] font-mono tracking-widest text-red-600">ENFORCED</div>
    <div class="text-xs font-bold mt-1">disabled</div>
    <div class="text-[11px] text-zinc-500 leading-tight mt-1">Enterprise can block</div>
  </div>
</div>

<div class="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2 mt-3 flex items-center justify-between">
  <span class="text-xs font-mono">opencode.json</span>
  <span class="text-xs font-mono text-zinc-500">share: "manual" | "auto" | "disabled"</span>
</div>

```json {2}
{
  "share": "manual" // "manual" | "auto" | "disabled"
}
```

::right::

<div class="rounded-2xl border border-red-200 bg-red-50 p-4">
  <div class="text-sm font-bold flex items-center gap-2"><span class="i-carbon-warning-alt text-red-600"></span> Privacy — read this</div>
  <div class="text-xs text-zinc-700 mt-2 leading-relaxed">Anyone with the link can <b>view the full session history</b>. That includes prompts, tool outputs, and any pasted code.</div>
  <div class="text-xs text-zinc-600 mt-2 leading-relaxed">Do <b>not</b> share sessions containing sensitive or proprietary code.</div>
</div>

<div class="rounded-2xl border border-zinc-200 bg-white p-4 mt-4">
  <div class="text-xs font-bold">When to use what</div>
  <table class="w-full text-xs mt-2">
    <tbody class="divide-y divide-zinc-100">
      <tr><td class="py-2 font-medium">Web</td><td class="py-2 text-zinc-500">Private — your machine, your LAN, your auth</td></tr>
      <tr><td class="py-2 font-medium">Share link</td><td class="py-2 text-zinc-500">Public — anyone with URL can view</td></tr>
    </tbody>
  </table>
  <div class="text-[11px] text-zinc-500 mt-2">Web ≠ Share. Different features, different trust boundaries.</div>
</div>

<div class="rounded-xl bg-zinc-900 text-white p-3 text-xs mt-4">
  <span class="font-mono text-white/60">Link shape:</span> <span class="font-mono">https://opencode.ai/s/&lt;id&gt;</span>
</div>

---
layout: two-cols
class: gap-6
---


<div class="text-[11px] tracking-[0.2em] uppercase font-mono text-zinc-400 mb-3">19 — Zen vs Go</div>

## Zen <span class="font-serif italic font-normal text-zinc-500">vs</span> Go

<div class="text-sm text-zinc-600 leading-relaxed mt-2">Same Console, same infra — <b>different pricing shape</b>. Both live at <span class="font-mono text-xs">opencode.ai/auth</span>.</div>

<div class="mt-4 rounded-2xl border border-zinc-200 overflow-hidden bg-white">
  <table class="w-full text-xs">
    <thead class="bg-zinc-950 text-white text-[11px] font-mono tracking-widest uppercase">
      <tr><th class="text-left px-3 py-2 font-normal"> </th><th class="text-left px-3 py-2 font-normal">Zen / Console</th><th class="text-left px-3 py-2 font-normal">Go</th></tr>
    </thead>
    <tbody class="divide-y divide-zinc-100">
      <tr><td class="px-3 py-2.5 font-semibold">Model</td><td class="px-3 py-2.5 text-zinc-600">Pay-as-you-go gateway</td><td class="px-3 py-2.5 text-zinc-600">$10/mo subscription</td></tr>
      <tr><td class="px-3 py-2.5 font-semibold">Pricing</td><td class="px-3 py-2.5 text-zinc-600">Per-token at cost<br /><span class="text-[11px] text-zinc-500">card fee ~4.4% + $0.30</span></td><td class="px-3 py-2.5 text-zinc-600">Flat $10; curated open models</td></tr>
      <tr><td class="px-3 py-2.5 font-semibold">Funding</td><td class="px-3 py-2.5 text-zinc-600">Add credits · auto-reload $20 when &lt; $5 · monthly limits</td><td class="px-3 py-2.5 text-zinc-600">Subscribe in console</td></tr>
      <tr><td class="px-3 py-2.5 font-semibold">Scope</td><td class="px-3 py-2.5 text-zinc-600">Wide provider access via Models.dev</td><td class="px-3 py-2.5 text-zinc-600">Curated open coding models</td></tr>
    </tbody>
  </table>
</div>

::right::

<div class="rounded-2xl border border-violet-200 bg-violet-600 text-white p-5">
  <div class="text-xs font-mono tracking-widest text-white/70 uppercase">How they combine</div>
  <div class="text-sm font-semibold mt-2 leading-relaxed">Exceed Go limits?</div>
  <div class="text-sm leading-relaxed text-white/90 mt-1">If you have <b>Zen balance</b> and <b>“Use balance”</b> is enabled, Go falls back to Zen pay-as-you-go instead of blocking.</div>
  <div class="mt-4 flex items-center gap-2 text-xs font-mono bg-white/10 border border-white/15 rounded-full px-3 py-1.5 w-fit">
    <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Go → Zen fallback
  </div>
</div>

<div class="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 mt-4">
  <div class="text-xs font-bold">Which should I use?</div>
  <ul class="text-xs text-zinc-600 mt-2 space-y-1.5 leading-relaxed list-disc pl-4">
    <li><b>Go</b> for predictable daily coding on open models.</li>
    <li><b>Zen</b> for frontier/closed models or burst overages.</li>
    <li>Many teams use <b>Console allowlists + caps</b> to control both.</li>
  </ul>
</div>

---
layout: center
class: text-center bg-zinc-950 text-white
---

<div class="max-w-3xl mx-auto">

<div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs font-mono tracking-wide text-white/60">
  <span class="i-carbon-locked text-white/50"></span> No lock-in · Privacy
</div>

## Your code stays <span class="font-serif italic font-light text-white/90">yours</span>

<div class="grid md:grid-cols-3 gap-4 text-left mt-8">

<div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
  <div class="w-8 h-8 rounded-lg bg-white text-zinc-900 flex items-center justify-center"><span class="i-carbon-box"></span></div>
  <div class="text-sm font-semibold mt-3">Provider-agnostic</div>
  <div class="text-xs text-white/60 mt-1 leading-relaxed">Go is just another provider entry. Swap models or providers per session — no migration.</div>
</div>

<div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
  <div class="w-8 h-8 rounded-lg bg-white text-zinc-900 flex items-center justify-center"><span class="i-carbon-data-base"></span></div>
  <div class="text-sm font-semibold mt-3">Local-first</div>
  <div class="text-xs text-white/60 mt-1 leading-relaxed">Web runs on your machine. Sessions live with your filesystem — not a hosted IDE.</div>
</div>

<div class="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
  <div class="w-8 h-8 rounded-lg bg-white text-zinc-900 flex items-center justify-center"><span class="i-carbon-view-off"></span></div>
  <div class="text-sm font-semibold mt-3">Share = explicit</div>
  <div class="text-xs text-white/60 mt-1 leading-relaxed">Sharing is opt-in (<code class="text-white/80 text-[11px]">manual</code> by default). Links are public — choose carefully.</div>
</div>

</div>

<div class="mt-6 text-[11px] font-mono text-white/35">Open source · github.com/anomalyco/opencode · opencode.ai/docs · opencode.ai/v2/docs/console</div>

</div>

---
layout: two-cols
class: gap-8
---


<div class="text-[11px] tracking-[0.2em] uppercase font-mono text-zinc-400 mb-3">20 — Get started</div>

## Get started <span class="font-serif italic font-normal text-zinc-500">with OpenCode</span>

<div class="rounded-xl border border-zinc-200 bg-white p-3 flex items-center gap-3 mt-3">
  <span class="w-7 h-7 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-bold">1</span>
  <div class="text-sm"><span class="font-semibold">Install OpenCode</span> <span class="text-zinc-500">— one line</span></div>
</div>

<div class="rounded-xl border border-zinc-200 bg-white p-2 mt-2">
  <div class="text-[11px] font-mono text-zinc-500">Pick one</div>
</div>

```bash {1|2|3}
curl -fsSL https://opencode.ai/install | bash
npm install -g opencode-ai
brew install anomalyco/tap/opencode
```

<div class="rounded-xl border border-violet-200 bg-violet-50 p-3 flex items-center gap-3 mt-2">
  <span class="w-7 h-7 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold">2</span>
  <div class="text-sm"><span class="font-semibold">Console (optional)</span> <span class="text-zinc-500">—</span> <span class="font-mono text-xs">opencode.ai/auth</span> <span class="text-zinc-500">→ API keys, teams, Go</span></div>
</div>

<div class="rounded-xl border border-zinc-200 bg-white p-3 flex items-center gap-3 mt-2">
  <span class="w-7 h-7 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-bold">3</span>
  <div class="text-sm"><span class="font-mono">/connect</span> → <span class="font-semibold">OpenCode Go</span> → paste key → <span class="font-mono">/models</span></div>
</div>

<div class="rounded-xl border border-zinc-200 bg-white p-3 flex items-center gap-3 mt-2">
  <span class="w-7 h-7 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-bold">4</span>
  <div class="text-sm"><span class="font-semibold">Run at home?</span> <span class="font-mono text-xs">opencode serve --hostname 0.0.0.0</span> · phone via LAN · QR with <span class="font-mono text-xs">opencode pair</span> (v2)</div>
</div>

::right::

<div class="rounded-2xl border border-zinc-200 bg-white p-4">
  <div class="text-xs font-bold">Links</div>
  <div class="mt-3 grid grid-cols-1 gap-2 text-sm">
    <a class="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2.5 hover:bg-zinc-50 transition" href="https://opencode.ai" target="_blank">
      <span class="font-medium">opencode.ai</span><span class="i-carbon-arrow-right text-zinc-400"></span>
    </a>
    <a class="flex items-center justify-between rounded-xl border border-zinc-900 bg-zinc-900 text-white px-3 py-2.5 hover:bg-black transition" href="https://opencode.ai/auth" target="_blank">
      <span class="font-medium">Console — opencode.ai/auth</span><span class="i-carbon-arrow-right text-white/60"></span>
    </a>
    <a class="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2.5 hover:bg-zinc-50 transition" href="https://opencode.ai/go" target="_blank">
      <span class="font-medium">Go — opencode.ai/go</span><span class="i-carbon-arrow-right text-zinc-400"></span>
    </a>
    <a class="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2.5 hover:bg-zinc-50 transition" href="https://opencode.ai/docs/go/" target="_blank">
      <span class="font-medium">Docs — opencode.ai/docs/go</span><span class="i-carbon-arrow-right text-zinc-400"></span>
    </a>
    <a class="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2.5 hover:bg-zinc-50 transition" href="https://opencode.ai/v2/docs/console" target="_blank">
      <span class="font-medium">Console docs — /v2/docs/console</span><span class="i-carbon-arrow-right text-zinc-400"></span>
    </a>
    <a class="flex items-center justify-between rounded-xl border border-zinc-900 bg-zinc-900 text-white px-3 py-2.5 hover:bg-black transition" href="https://github.com/anomalyco/opencode" target="_blank">
      <span class="font-mono text-xs">github.com/anomalyco/opencode</span><span class="i-carbon-logo-github"></span>
    </a>
  </div>
</div>

<div class="rounded-2xl bg-zinc-900 text-white p-3 mt-3">
  <div class="text-[11px] font-mono tracking-widest text-white/50 uppercase">Quick check</div>
</div>

```bash
# after /connect
/models
# → look for opencode-go/* ids
GET https://opencode.ai/zen/go/v1/models
```

<div class="rounded-xl bg-zinc-900 text-white p-3 -mt-1">
<div class="text-[11px] text-white/50">No lock-in — Go is just another provider. Swap anytime.</div>
</div>

---
layout: quote
class: bg-white
---

<div class="max-w-3xl mx-auto text-center">

<div class="text-[11px] tracking-[0.25em] uppercase font-mono text-zinc-400 mb-6">The takeaway</div>

> OpenCode, your machine, your sessions. <br /> <span class="font-serif italic font-normal">Console when you need a team, Go when you want calm pricing, home server when you want always-on.</span>

<div class="mt-8 flex items-center justify-center gap-3 text-xs">
  <span class="px-3 py-1.5 rounded-full bg-zinc-900 text-white font-semibold">$10 / month</span>
  <span class="px-3 py-1.5 rounded-full border border-zinc-200 text-zinc-600">~6× value aim</span>
  <span class="px-3 py-1.5 rounded-full border border-zinc-200 text-zinc-600">Fallback to Zen</span>
</div>

<div class="mt-8 text-xs font-mono text-zinc-400">opencode.ai · opencode.ai/auth · opencode.ai/go · opencode.ai/docs</div>

</div>

---
layout: end
background: "#0a0a0f"
class: text-white text-center
---

<div class="absolute inset-0 opacity-50" style="background: radial-gradient(700px circle at 50% 30%, rgba(109,40,217,0.35), transparent 60%), radial-gradient(600px circle at 80% 90%, rgba(6,182,214,0.18), transparent 60%);"></div>

<div class="relative z-10">

<div class="inline-flex items-center gap-2 text-[11px] tracking-[0.2em] uppercase font-mono text-white/40">
  <span class="w-8 h-px bg-white/15"></span>
  github.com/anomalyco/opencode
  <span class="w-8 h-px bg-white/15"></span>
</div>

# OpenCode

<div class="text-sm text-white/60 mt-3 font-light">Open source · provider-agnostic · your agent, your way. Go from $10/mo when you want it.</div>

<div class="mt-8 flex items-center justify-center gap-3 flex-wrap">
  <span class="px-4 py-2 rounded-full bg-white text-black text-sm font-semibold">opencode.ai</span>
  <span class="px-4 py-2 rounded-full border border-white/15 text-white/70 text-sm font-mono">opencode.ai/auth</span>
  <span class="px-4 py-2 rounded-full border border-white/15 text-white/70 text-sm font-mono">opencode.ai/go</span>
</div>

<div class="mt-10 text-[11px] font-mono tracking-widest text-white/25 uppercase">Thank you — questions?</div>

</div>
