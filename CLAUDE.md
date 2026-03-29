# RSS Hangman — CLAUDE.md

## Project Overview

A vanilla JS Progressive Web App (PWA) where players guess letters to complete real news headlines sourced from RSS feeds. Hosted on GitHub Pages; a Cloudflare Worker acts as a CORS proxy for RSS fetching.

No build step. No frameworks. No transpilation. Just static files served directly.

## Architecture

### Static frontend — `docs/`

Served by GitHub Pages. Single HTML page with four JS modules loaded as plain `<script>` tags (no ES modules, no bundler).

| File | Role |
|---|---|
| `docs/index.html` | Single-page app shell |
| `docs/css/style.css` | Responsive dark theme, CSS Grid, `clamp()`, `dvh` |
| `docs/js/app.js` | Main controller — screen nav, keyboard, UI updates, confetti |
| `docs/js/game.js` | `Game` class — headline parsing, letter logic, win/lose, streaks |
| `docs/js/rss.js` | `RSSService` class — fetch, XML parse (RSS 2.0/Atom/RDF), feed CRUD |
| `docs/js/settings.js` | `Settings` class — settings UI, feed/word list management |
| `docs/sw.js` | Service worker — offline caching |
| `docs/manifest.json` | PWA manifest |

### CORS proxy — `worker/`

Cloudflare Worker that adds CORS headers to RSS feed responses.

| File | Role |
|---|---|
| `worker/rss-proxy.js` | Worker script — add allowed origins before deploying |
| `worker/wrangler.toml` | Wrangler deployment config |

## Key Concepts

- **Global class instances**: `app.js` instantiates `RSSService`, `Game`, and `Settings` at page load. These are referenced across modules via globals (no module system).
- **Persistence**: `localStorage` for settings, stats, feeds; `sessionStorage` for in-progress game state.
- **State machine**: `game.state` is `idle | playing | won | lost`.
- **Difficulty**: Controls what percentage of words are hidden (easy 30%, medium 50%, hard 70%, expert 100%).
- **Whitelist**: Words in `whitelistWords` (e.g., "the", "and") are never masked.
- **Special chars**: When `allowSpecialChars` is off, headlines with accented characters are skipped. When on, guessing the base letter (e.g., `e`) also reveals accented variants.
- **Anti-cheat**: Hidden letters use `color: transparent; user-select: none`.

## Local Development

```bash
cd docs/
python3 -m http.server 8080
# Open http://localhost:8080
```

No install step needed.

## Deploy

- **Frontend**: Push to `main`. GitHub Pages serves from `/docs`.
- **Worker**: `cd worker && wrangler deploy` (requires Wrangler CLI and Cloudflare login).
- The CORS proxy URL is configured in the app's Settings UI and stored in `localStorage` — no source changes needed.

## Coding Conventions

- Vanilla JS only — no frameworks, no npm, no build tools.
- IIFE (`(function(){ 'use strict'; })()`) used in `app.js` to avoid polluting globals.
- Classes (`Game`, `RSSService`, `Settings`) for the core modules.
- DOM manipulation is direct — `getElementById`, `querySelector`, `classList`.
- CSS uses custom properties and `clamp()` for responsive sizing.
- Keep all logic in the four JS files; avoid adding new files unless absolutely necessary.
