# Moviezilla

Personal movies & shows hub — watchlist, continue watching, rooms (watch party + chat), discovery.

Stack: React 19 + Vite 8 + Tailwind v4 (CSS-first, `src/index.css`). No router — custom history mirror (`src/services/routing.js`, rewrites in `vercel.json`).

## Routes

`/` Home · `/movies` · `/shows` · `/watchlist` · `/rooms` · `/room/:code` · `/movie/:id` · `/tv/:id` · `/person/:id`. Player via `?play=1`. `/football` exists but is intentionally unlinked (hidden).

## Develop

```sh
npm i
npm run dev      # Vite + devApi middleware serves api/* locally
npm run lint     # must be 0 errors (warnings OK: intentional hydration/mirror patterns)
npm run build
```

## Env

Secrets live in `.env.local` (gitignored) and Vercel project env. Client only talks to `/api/*`; keys never ship to the browser.

| Var | Where | Purpose |
| --- | ----- | ------- |
| `TMDB_API_KEY` | `.env.local` + Vercel | TMDB proxy (`api/tmdb.js`) |
| `KLIPY_API_KEY` | `.env.local` + Vercel | GIF picker (`api/gif.js`, Klipy) |
| `RAPIDAPI_KEY` | optional | Paid Rotten Tomatoes backend (`api/rt.js`); without it the free fallback is used, misses return 404 |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | `.env.local` + Vercel | Rooms + chat (`src/services/supabase.js`) |

## Notes

- Playback servers: Vidy (recommended — verified ad-free) / VidLink (ultra fast, has ads) / Vaplayer (RU) (covers some RU-series gaps — found Slovo Patsana, 404s Kukhnya). Both main servers carry much of the RU domestic library (Brother 2, Slovo Patsana verified playing). Tested 2026-09-14 headless: main two refuse sandboxed iframes, so popups can't be contained code-side. Retired: VidFast, Russian/Voidboost, VidPhantom, apiplayer (extractor fails).
- Design system: `src/index.css` (`cine-*` tokens). Tailwind v4 — no `tailwind.config.js` by design.
- Fragile upstreams (Letterboxd scrape, single Streamed base, RT free tier) fail soft: 404 + short cache, UI hides gracefully.
