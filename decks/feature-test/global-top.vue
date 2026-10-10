<script setup lang="ts">
import { onMounted } from 'vue'

/**
 * Umami analytics for decks.
 *
 * On GitHub Pages the script URL + website id are baked in at build time from
 * VITE_UMAMI_SCRIPT_URL / VITE_UMAMI_WEBSITE_ID. In the all-in-one container
 * they come from the admin-configured settings, so no rebuild is needed.
 */
onMounted(() => {
  if (typeof document === 'undefined') return
  if (document.querySelector('script[data-umami]')) return

  const env = (import.meta as any).env || {}

  function inject(url?: string, id?: string) {
    if (!url || !id) return
    if (document.querySelector('script[data-umami]')) return
    const s = document.createElement('script')
    s.defer = true
    s.src = url
    s.setAttribute('data-website-id', id)
    s.setAttribute('data-umami', '1')
    document.head.appendChild(s)
  }

  if (env.VITE_UMAMI_SCRIPT_URL && env.VITE_UMAMI_WEBSITE_ID) {
    inject(env.VITE_UMAMI_SCRIPT_URL, env.VITE_UMAMI_WEBSITE_ID)
    return
  }

  const base = String(env.VITE_LIVE_BASE_URL || '').replace(/\/+$/, '')
  fetch(base + '/api/settings/analytics', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then((j) => {
      if (j && j.tracking_enabled) inject(j.umami_script_url, j.umami_website_id)
    })
    .catch(() => {
      /* analytics is best-effort */
    })
})
</script>

<template>
  <span style="display: none" aria-hidden="true" />
</template>
