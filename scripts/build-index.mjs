// Generates dist/index.html listing every built deck.
import { readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = 'dist'
if (!existsSync(dist)) {
  console.error('No dist/ found. Run `npm run build` first.')
  process.exit(1)
}

const decks = readdirSync(dist, { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(join(dist, d.name, 'index.html')))
  .map(d => d.name)
  .sort()

const cards = decks
  .map(name => `      <a class="card" href="./${encodeURIComponent(name)}/">
        <h2>${name}</h2>
        <span>Open deck →</span>
      </a>`)
  .join('\n')

writeFileSync(join(dist, 'index.html'), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Slides</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; min-height: 100vh; font-family: ui-sans-serif, system-ui, sans-serif;
           background: #0d1117; color: #e6edf3; display: grid; place-items: center; }
    main { width: min(900px, 90vw); padding: 4rem 0; }
    h1 { font-size: 2.5rem; margin: 0 0 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
    .card { display: flex; flex-direction: column; gap: .5rem; padding: 1.5rem;
            border: 1px solid #30363d; border-radius: 12px; text-decoration: none;
            color: inherit; background: #161b22; transition: border-color .15s, transform .15s; }
    .card:hover { border-color: #58a6ff; transform: translateY(-2px); }
    .card h2 { margin: 0; font-size: 1.25rem; }
    .card span { color: #8b949e; font-size: .875rem; }
  </style>
</head>
<body>
  <main>
    <h1>Slide decks</h1>
    <div class="grid">
${cards}
    </div>
  </main>
</body>
</html>
`)

console.log(`Index generated for ${decks.length} deck(s): ${decks.join(', ') || '(none)'}`)
