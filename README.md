# RSS Hangman

A progressive web app where you guess letters to fill in the latest news headlines before your wrong guesses run out. Headlines are sourced from RSS feeds you configure.

## Features

### Gameplay
- **Headline Guessing** — Hidden words from real RSS feed headlines are masked. Guess the letters using the on-screen keyboard or your physical keyboard.
- **Difficulty Levels** — Easy (~30% hidden), Medium (~50%), Hard (~70%), Expert (100%).
- **Streaks** — Consecutive wins build your streak. Streak resets on loss or skip.
- **Max Wrong Guesses** — Configurable: 4 (Brutal), 5 (Hard), 6 (Normal), 8 (Forgiving), 10 (Easy).
- **Wrong-Guess Bar** — A segmented bar fills up with each wrong guess, turning green on a win.
- **Skip Round** — Skip a headline at the cost of resetting your streak.
- **Reveal Source** — Show the publisher/source of the current headline at the cost of one wrong guess.
- **Article Link** — After winning or losing, the source appears as a clickable link to read the full article.

### Smart Headline Filtering
- **Exclude Words** — Skip headlines containing specific strings (e.g., "LIVE -"). Comma-separated input supported.
- **Never Mask Words** — Common words (e.g., "the", "and", "de", "het") are always shown, never hidden. Pre-filled with ~100 English and Dutch defaults. Fully editable, comma-separated input supported.
- **Special Characters Toggle** — When off (default), headlines with accented characters (é, ü, ñ) are filtered out. When on, accented headlines are included and guessing the base letter (e.g., `e`) reveals accented variants (`é`, `è`, `ê`).
- **Duplicate Prevention** — Played headlines are stored in localStorage and never repeated across sessions. The list is pruned automatically when headlines are no longer available in your feeds.
- **HTML Entity Decoding** — `&amp;`, `&quot;`, `&#39;` etc. are properly decoded.
- **Length Filter** — Only headlines between 10–150 characters are used. Words longer than 14 characters are never hidden to prevent overflow on small screens.

### RSS Feed Management
- **Add/Remove Feeds** — Paste any RSS feed URL. Supports RSS 2.0, Atom, and RDF/RSS 1.0.
- **Enable/Disable Feeds** — Toggle individual feeds on or off without removing them.
- **Reorder Feeds** — Drag to reorder feeds; order is used by the Randomisation setting.
- **Randomisation** — Three modes: Random (equal chance from all feeds), Weighted (top feeds get more picks), Sequential (exhaust one feed before moving to the next).
- **Refresh Feeds** — Force re-fetch all feeds, clearing the cache for fresh headlines.
- **Copy** — Copy your feed list to clipboard.
- **Per-Feed Count** — Each feed shows solved / total headlines.

### Themes
- **3 Built-in Themes** — Dark (default), Light, and E-paper (high-contrast black-and-white with outlines). Select from the Theme section in Settings. Choice is persisted to localStorage and applied before first paint to prevent flash of wrong theme.

### Settings UI
- **Consistent Section Layout** — Each section uses a header with icon-only action buttons (refresh, copy) in the top-right corner.
- **Chip Grid Layout** — Exclude words and whitelist words are displayed as compact chip tags with × remove buttons.
- **Show All / Show Less** — Word lists are clamped to ~3 rows with a gradient fade; a toggle button appears when content overflows.
- **Proxy URL in Settings** — Configure the CORS proxy URL from the Settings screen. An info button (ⓘ) opens a modal with full setup instructions and a copyable worker script. When the proxy is not configured, a warning is shown in place of the game area with a direct link to the proxy settings.
- **Toast Notifications** — Status messages appear as floating cards at the bottom of the screen.

### Progressive Web App
- **Installable** — Add to home screen on mobile for a standalone app experience.
- **Offline Support** — Service worker caches the app shell. Play with cached headlines when offline.
- **Responsive Design** — Adapts to any screen size and orientation: phones, tablets, desktops. Uses CSS Grid for landscape layout, `clamp()`, `dvh`, `env(safe-area-inset-*)`, and media queries.
- **Game State Persistence** — In-progress games survive page refreshes (saved to sessionStorage). Stats, settings, and feeds persist across sessions (localStorage).

### Anti-Cheat
- Hidden letters use transparent text with `user-select: none` to prevent revealing answers by selecting text on mobile.

## Project Structure

```
rss_hangman/
├── docs/                    # Static site (served by GitHub Pages)
│   ├── index.html           # Single-page app
│   ├── manifest.json        # PWA manifest
│   ├── sw.js                # Service worker
│   ├── css/style.css        # Responsive, multi-theme styles
│   ├── js/
│   │   ├── app.js           # Main controller, screen nav, game flow
│   │   ├── game.js          # Core game logic, streaks, state machine
│   │   ├── rss.js           # RSS fetching, XML parsing, feed management
│   │   └── settings.js      # Settings UI, feed CRUD, toggles
│   └── icons/               # SVG icons (192x192, 512x512)
├── worker/                  # Cloudflare Worker (CORS proxy)
│   ├── rss-proxy.js         # Worker script
│   └── wrangler.toml        # Deployment config
└── README.md
```

## Setup

### Prerequisites
- A [Cloudflare account](https://dash.cloudflare.com) (free tier)
- A GitHub account (for GitHub Pages hosting)

### 1. Deploy the CORS Proxy Worker

The app fetches RSS feeds through a Cloudflare Worker that adds CORS headers. This is required because most RSS feeds don't serve CORS headers.

You can deploy via the **Cloudflare dashboard** (no CLI needed) or using the Wrangler CLI. The app includes a built-in setup guide — open Settings, click the **ⓘ** button next to "CORS Proxy URL" for step-by-step instructions and a copyable worker script.

If using the CLI:

```bash
cd worker/
npm i -g wrangler
wrangler login
wrangler deploy
```

After deploying, update the allowed origins in `worker/rss-proxy.js` to match your GitHub Pages URL, then redeploy.

Finally, open the app, go to Settings → Proxy, and paste your worker URL into the **CORS Proxy URL** field. The app stores this in localStorage — no source code changes needed.

### 2. Deploy to GitHub Pages

```bash
git add -A
git commit -m "Initial deploy"
git push
```

Then in your GitHub repo settings:
1. Go to **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **main**, folder: **/docs**
4. Click **Save**

Your app will be live at `https://<your-username>.github.io/rss_hangman/`

### 3. Local Development

```bash
cd docs/
python3 -m http.server 8080
```

Open `http://localhost:8080` in your browser.

### 4. Install on Phone

1. Open your GitHub Pages URL in Chrome on your phone
2. Tap **⋮ → Install app** (or "Add to Home screen")
3. The app appears on your home screen as a standalone app

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS — no frameworks, no build step
- **CORS Proxy**: Cloudflare Worker (free tier, 100K requests/day)
- **Hosting**: GitHub Pages (static)
- **PWA**: Service Worker + Web App Manifest
- **XML Parsing**: Browser DOMParser (RSS 2.0, Atom, RDF/RSS 1.0)
