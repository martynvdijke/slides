// Generates dist/index.html listing every built deck with its date and tags.
// Deck metadata comes from each deck's slides.md frontmatter:
//   title, date (YYYY-MM-DD), tags (comma list), info, author.
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = 'dist'
if (!existsSync(dist)) {
  console.error('No dist/ found. Run `npm run build` first.')
  process.exit(1)
}

// Ship the logo mark with the built site (favicon + landing page header).
const markSrc = join('assets', 'logo-mark.svg')
if (existsSync(markSrc)) {
  copyFileSync(markSrc, join(dist, 'logo.svg'))
} else {
  console.warn('assets/logo-mark.svg not found; landing page will miss its logo')
}

function readFrontmatter(deck) {
  const path = join('decks', deck, 'slides.md')
  if (!existsSync(path)) return {}
  const raw = readFileSync(path, 'utf8')
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const out = {}
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function parseList(value) {
  if (!value) return []
  return value
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map(s => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

const decks = readdirSync(dist, { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(join(dist, d.name, 'index.html')))
  .map(d => {
    const meta = readFrontmatter(d.name)
    return {
      name: d.name,
      title: meta.title || d.name,
      date: meta.date || '',
      tags: parseList(meta.tags),
      info: meta.info || '',
    }
  })
  .sort((a, b) => {
    // Newest first; undated decks fall to the bottom, then alphabetical.
    if (a.date && b.date) return b.date.localeCompare(a.date) || a.name.localeCompare(b.name)
    if (a.date) return -1
    if (b.date) return 1
    return a.name.localeCompare(b.name)
  })

const cards = decks
  .map(deck => {
    const date = formatDate(deck.date)
    const tags = deck.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')
    const hasPdf = existsSync(join(dist, deck.name, 'slides.pdf'))
    const deckHref = `./${encodeURIComponent(deck.name)}/`
    const pdfHref = `./${encodeURIComponent(deck.name)}/slides.pdf`
    const titleEsc = escapeHtml(deck.title)
    const body = `          <div class="card-body">\n            <h2>${titleEsc}</h2>\n            ${deck.info ? `<p class="info">${escapeHtml(deck.info)}</p>` : ''}\n            ${tags ? `<div class="tags">${tags}</div>` : ''}\n          </div>`
    const timeHtml = date ? `<time>${escapeHtml(date)}</time>` : '<span></span>'
    if (hasPdf) {
      return `      <article class="card">\n        <a class="card-link" href="${deckHref}">\n${body}\n        </a>\n        <div class="card-foot">\n          ${timeHtml}\n          <span class="card-actions">\n            <a class="pdf" href="${pdfHref}" aria-label="Download PDF for ${titleEsc}" download>PDF <span aria-hidden="true">↓</span></a>\n            <a class="open" href="${deckHref}">Open deck →</a>\n          </span>\n        </div>\n      </article>`
    }
    return `      <article class="card">\n        <a class="card-link" href="${deckHref}">\n${body}\n        </a>\n        <div class="card-foot">\n          ${timeHtml}\n          <span class="card-actions">\n            <a class="open" href="${deckHref}">Open deck →</a>\n          </span>\n        </div>\n      </article>`
  })
  .join('\n')

// Optional Umami on the landing page itself (GitHub Pages build).
const umamiUrl = process.env.UMAMI_SCRIPT_URL
const umamiId = process.env.UMAMI_WEBSITE_ID
const umami =
  umamiUrl && umamiId
    ? `  <script defer src="${escapeHtml(umamiUrl)}" data-website-id="${escapeHtml(umamiId)}"></script>\n`
    : ''

writeFileSync(
  join(dist, 'index.html'),
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" type="image/svg+xml" href="./logo.svg" />
  <title>Slides</title>
${umami}  <style>
    :root { color-scheme: dark; }
    body { margin: 0; min-height: 100vh; font-family: ui-sans-serif, system-ui, sans-serif;
           background: #0d1117; color: #e6edf3; display: grid; place-items: center; }
    main { width: min(900px, 90vw); padding: 4rem 0; }
    .hero { display: flex; align-items: center; gap: 1.1rem; margin-bottom: 2.25rem; }
    .hero h1 { font-size: 2.1rem; margin: 0; letter-spacing: -.02em; }
    .mark { display: block; border-radius: 14px; box-shadow: 0 8px 24px #7c6bff59; }
    .tagline { margin: .3rem 0 0; color: #8b949e; font-size: .95rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
    .card { display: flex; flex-direction: column; justify-content: space-between; gap: 1.25rem;
            padding: 0; border: 1px solid #30363d; border-radius: 12px;
            color: inherit; background: #161b22; transition: border-color .15s, transform .15s; min-height: 120px; overflow: hidden; }
    .card:hover { border-color: #58a6ff; transform: translateY(-2px); }
    .card:focus-within { border-color: #58a6ff; }
    .card-link { display: flex; flex-direction: column; justify-content: space-between; gap: 1.25rem; flex: 1;
                 padding: 1.5rem 1.5rem 0 1.5rem; text-decoration: none; color: inherit; }
    .card-link:focus-visible { outline: none; }
    .card h2 { margin: 0; font-size: 1.25rem; }
    .info { margin: .5rem 0 0; color: #8b949e; font-size: .875rem; line-height: 1.4; }
    .tags { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .85rem; }
    .tag { font-size: .7rem; letter-spacing: .04em; text-transform: uppercase; color: #79c0ff;
           background: #1f2937; border: 1px solid #30363d; border-radius: 999px; padding: .15rem .55rem; }
    .card-foot { display: flex; align-items: center; justify-content: space-between; gap: .5rem;
                 font-size: .8rem; color: #8b949e; padding: 0 1.5rem 1.5rem 1.5rem; }
    .card-actions { display: flex; align-items: center; gap: .5rem; }
    .pdf { display: inline-flex; align-items: center; gap: .25rem; font-size: .7rem; font-weight: 600;
           letter-spacing: .04em; text-transform: uppercase; color: #e6edf3; background: #21262d;
           border: 1px solid #30363d; border-radius: 999px; padding: .28rem .6rem; text-decoration: none;
           transition: border-color .15s, background .15s; }
    .pdf:hover { border-color: #58a6ff; background: #30363d; }
    .pdf:focus-visible { outline: 2px solid #58a6ff; outline-offset: 2px; }
    .open { color: #58a6ff; text-decoration: none; }
    a.open:hover { text-decoration: underline; }
    a.open:focus-visible { outline: 2px solid #58a6ff; outline-offset: 2px; border-radius: 2px; }
    footer { margin-top: 3rem; color: #8b949e; font-size: .8rem; }
    footer a { color: #58a6ff; }
  </style>
</head>
<body>
  <main>
    <header class="hero">
      <img class="mark" src="./logo.svg" alt="" width="56" height="56" />
      <div>
        <h1>Slides</h1>
        <p class="tagline">Slidev decks with live questions, polls and Q&amp;A.</p>
      </div>
    </header>
    <div class="grid">
${cards}
    </div>
    <footer>Built with <a href="https://sli.dev">Slidev</a>.</footer>
  </main>
</body>
</html>
`,
)

console.log(`Index generated for ${decks.length} deck(s): ${decks.map(d => d.name).join(', ') || '(none)'}`)
