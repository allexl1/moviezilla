# Moviezilla — Road to 10/10 (step-by-step)

> SESSION STATE (updated 2026-09-27, end of session — read this first).
> - Last finished: rooms presence fix (§A1 equivalent — see DONE list),
>   verified headless vs real backend. NOT pushed (user: don't push).
> - Next up, in order: (1) live two-device rooms test with the user;
>   (2) user's pending PLAYER issue — NOT yet described, waiting on
>   them, do not start; (3) §1 actors batch verification → push working
>   version → roadmap discussion (§2–§8).
> - Tree state: all work below marked [x] is local-only in the working
>   tree. Nothing since `a29bf73` is committed. Push only when asked.

Planning doc, NOT shipped to the site. Every step lists files, the exact
action, and how to verify. Work them in order; check off as you go.

Global gates after EVERY step: `npm run lint` (0 errors — warnings are
intentional patterns), `sh scripts/guard-css.sh` (must pass),
`npm run build`, WebKit screenshots (`p.webkit.launch`, chromium second).
No new files unless shared by 2+ consumers. Never commit/push without
being asked.

---

## 0. DONE (local working tree, NOT pushed — push only a working version)

- [x] Person page: lighter frozen bg, expandable Honours, singular
  counts (1 Oscar), dead age in chip (`PersonView.jsx`).
- [x] Career filter: empty slices hidden, stale-value fallback,
  per-slice remount, scroll re-anchor (`PersonView.jsx`, `RowRail.jsx`).
- [x] Section header: three-zone grid — filter dead-center with or
  without Show-all, stacked layout <640px (`RowRail.jsx`, `index.css`).
- [x] Routing: `/tv/` URLs for typeless show rows, tab-root stack
  entries, player-aware Back, `?from=` shelf return, person `?tab=`,
  room leave replaces, tabs/logo work in rooms, legacy `?room=` on any
  path, same-item guard, Home rails use the tab contract
  (`routing.js`, `App.jsx`).
- [x] History vs Watched split; mark-watched moves rows out
  (`WatchlistView.jsx`).
- [x] Player: watched replays restart at 0, no false resume toast,
  ended-snaps to 100%, runtime-anchored completion for silent
  providers, episode-switch stamp (`Player.jsx`, `storage.js`).
- [x] CW series gate: established shows resurface from 5s
  (`storage.js`: `tvEstablished`).
- [x] Home hero: skeleton until fresh rails (no stale flash), thin
  white edge chevrons (`HomeView.jsx`, `index.css`).
- [x] Search: person picks recorded in recents, recents restyled to
  pills (`SearchModal.jsx`).
- [x] Plurals: titles/episodes/seasons/matches singularize; Watch
  Later clock badges; Shows Coming Soon error+Retry
  (`WatchlistView.jsx`, `EpisodeDrawer.jsx`, `MediaDetailPage.jsx`,
  `FootballView.jsx`, `ShowsView.jsx`).
- [x] Sync: clear-flag respected in merge, merge re-renders shelves
  (`account.js`).
- [x] Detail hero reverted to full-bleed per taste (`MediaDetailPage.jsx`).
- [x] Code foundations: one `resolveMediaType` (`routing.js`,
  re-exported by `catalog.js`); `npm test` 18/18 green
  (`tests/routing.test.js`, `tests/storage.test.js`); guards
  extended (raw plurals, rogue `scrollLeft`, thumb discipline).
- [x] Rooms presence fix: syncs only ADD/refresh (order-stable
  merge), 5s pruner owns removals after 15s unseen, server `leave`
  fast-tracks, renames via `update()` with no teardown
  (`services/rooms.js`, `components/RoomView.jsx`). Headless
  two-device test vs real backend green (1→2 on join, →1 ≤12s
  after unclean close); live test with you still required.

---

## 1. ACTORS batch (finish first, then push)

- [ ] Step 1.1 — Career empty-person guard. If `career.length === 0`
  AND `knownFor.length === 0`, the "No credits indexed" note already
  shows; verify on a crew-only person (e.g. a director with no cast
  rows). File: `PersonView.jsx`. Verify: WebKit screenshot.
- [ ] Step 1.2 — Career rail remount side-effect check. `key={filter}`
  resets `expanded` per slice by design; confirm no scroll jump on
  the page when switching slices (page scroll must stay). Verify:
  click Movies→Shows→Directing, page Y offset unchanged.
- [ ] Step 1.3 — Known For vs Career overlap. Both rails share items
  (keys are per-parent, safe). Confirm no duplicate-key warnings in
  console on 3 person pages.
- [ ] Step 1.4 — Person hero on 390px: portrait + chips + bio stack
  without overlap. Screenshot iPhone width for 1 living + 1 dead
  person.
- [ ] Step 1.5 — Push gate: run §8 push procedure.

---

## 2. UI to 10/10

### 2A. Melt lines (the recurring complaint) — matrix, not tweaks
- [ ] Step 2A.1 — Freeze the code. No melt CSS/JSX edits until the
  matrix below is recorded.
- [ ] Step 2A.2 — Record the matrix in WebKit, desktop 1440 + phone
  390: home hero and detail hero × scroll offsets 0/300/600/900/1400
  × backdrops dark (e.g. Unabomber), bright (Simpsons/Love
  Hypothesis), mixed (Dark Knight). Save to `/tmp/mz-melt/`.
  Mark every visible line with offset + backdrop.
- [ ] Step 2A.3 — Root-cause each line against the architecture:
  sharp-over-blur (`cine-*-melt-base`), bleed tail
  (`cine-melt-tail`), fixed ghost (`cine-*-bg`) — different boxes
  compute different `cover` crops, so ANY edge-vs-ghost boundary is
  a candidate line on some backdrop at some offset.
- [ ] Step 2A.4 — Test candidates ONE at a time, re-running the FULL
  matrix each time (a fix for offset 0 classically breaks 900):
  1. ghost-only below the fold (remove the boundary instead of
     matching across it);
  2. locked `object-position` + aspect between hero and ghost so both
     sample identical rows;
  3. shorter crossfade (120–160px), transparent caps both ends;
  4. single 24px blur layer vs stacked 40px (also §3C).
- [ ] Step 2A.5 — Lock the winner per page, document it in `index.css`
  comments (as today), keep the screenshots as the regression set.

### 2B. Empty states (no silent gaps)
- [ ] Step 2B.1 — List every conditional rail/section (`grep -rn
  "length === 0\|length > 0 &&" src --include='*.jsx'`). Each gets:
  loading → content → honest-empty → error+Retry.
- [ ] Step 2B.2 — Known gaps to close first: Home Trending Now when
  filters empty it; Rooms lobby trending strip; person with zero
  credits (verify); season with zero episodes.
- [ ] Step 2B.3 — Verify each with forced-empty states (seeded cache /
  blocked network), screenshot.

### 2C. Mobile hero + detail
- [ ] Step 2C.1 — 390px hero pass: logo cap smaller, meta wraps,
  dots clear of the melt tail, steppers slimmer (done in CSS —
  re-verify with screenshots for 3 backdrops).
- [ ] Step 2C.2 — Detail mobile chips must carry the SAME fields in
  the SAME order as the xl facts column (seasons count is missing on
  mobile today). File: `MediaDetailPage.jsx` mobile facts section.
- [ ] Step 2C.3 — Screenshot 390px + 1440px for the same 3 titles,
  compare field parity line by line.

### 2D. Rails contract (career lessons, global)
- [ ] Step 2D.1 — Every rail gets: fresh DOM or scroll-reset on
  content identity change (RowRail has both; UpcomingRail/cast/
  trailers/photos rely on remount — verify each with a forced
  `scrollLeft=1500` + content swap test).
- [ ] Step 2D.2 — Every filter hides empty options + stale-value
  fallback (career pattern). Audit: any other option list that can
  open an empty view?
- [ ] Step 2D.3 — "Show all N" threshold stays >8 everywhere; short
  rails anchor left (measure `firstDx`, don't eyeball).
- [ ] Step 2D.4 — Section headers use the three-zone grid wherever a
  center filter exists; plain heads untouched.

### 2E. Search polish
- [ ] Step 2E.1 — Recents: add a tiny person/clapper glyph per chip
  (storage stays a string list; glyph by re-query type or `person:`
  prefix convention — decide, then implement).
- [ ] Step 2E.2 — 8-item wrap on 390px, screenshot.
- [ ] Step 2E.3 — People result counts next to "People" head.

### 2F. Detail consistency
- [ ] Step 2F.1 — Facts column vs mobile chips field parity (§2C.2).
- [ ] Step 2F.2 — Extend `guard-css.sh`: ban raw plural patterns
  (`${n} seasons|episodes|titles|matches|honours` without a
  singular branch).

### 2G. Tab title + favicon
- [ ] Step 2G.1 — Player tab title shows the movie/show name. Code
  already sets `▶ Title — Moviezilla` while playing (`App.jsx`
  title effect); verify on LIVE after push (the "Playing —
  Moviezilla" screenshot predates it). Drop the `▶` prefix if it
  reads noisy in the tab strip.
- [x] Step 2G.2 — Favicon white tile. Root cause: transparent PNG
  corners composited white by the tab bar. Fixed with opaque
  full-bleed base (`public/favicon.svg` + regenerated
  `icon-192/512.png`, `apple-touch-icon.png` — verified 0
  transparent pixels). Confirm on live after push (favicons cache
  hard — bump query or rename if the old tile sticks).

---

## 3. SPEED (priority)

- [ ] Step 3.1 — Route-split Supabase (~211kB, only rooms/account
  need it): dynamic `import()` on first rooms/account use. Verify:
  initial chunk −40%, rooms still connects. Files: `App.jsx`
  (lazy), `services/supabase.js`, `services/account.js`,
  `services/rooms.js`.
- [ ] Step 3.2 — Home mount flights (~10): drop week-trending (day
  pool leads the hero), stagger rails (hero-critical first, rest
  lazy). Verify: first paint needs ≤3 flights (devtools count).
- [ ] Step 3.3 — Blur budget: measure Safari timeline on hero +
  detail; converge with §2A winner (single 24px layer preferred);
  keep `mz-paused`/`mz-low-power`/`mz-max-power` gates on any new
  ambient layer. No new ambient animation without a pause path.
- [ ] Step 3.4 — Images: `w780` backdrops <768px viewports; rails
  use `w185` posters (they render ~200px); add
  `decoding="async"` + `loading="lazy"` where missing (search
  trending grid, watchlist thumbs). File by file, screenshot-compare
  sharpness after.
- [ ] Step 3.5 — Lists: re-measure 13 home rails paint cost;
  virtualize only the two longest IF measurement justifies it.

---

## 4. USABILITY

- [ ] Step 4.1 — Make CW rules visible: subtitle or "i" affordance
  ("started episodes of shows you're watching always show") +
  un-watch action (see §5.1). Files: `HomeView.jsx`,
  `WatchlistView.jsx`.
- [ ] Step 4.2 — Back-matrix automation (Playwright, WebKit):
  person→movie→person→browser-back→in-app-back;
  tab-root→detail→back; resume→close→shelf; room leave→back;
  watched-replay progress=0. Run before every push (§8).
- [ ] Step 4.3 — Player exit: verify real-mouse Exit behavior (the
  wake-zone overlay eats automation clicks); consider a persistent
  slim top bar if slow users struggle. No player redesign beyond
  this.
- [ ] Step 4.4 — Rooms lobby: verify stale draft card is gone after
  browser-back (popstate clear is local-only so far).
- [ ] Step 4.5 — Toasts for silent sync events (merged N rows?).

---

## 5. FUNCTIONS (depth, in order)

- [ ] Step 5.1 — Un-mark-watched on Watched rows (one-way door fix).
  Design first: sets small percent vs removes stamp? Then implement
  in `WatchlistView.jsx` + `storage.js`.
- [ ] Step 5.2 — Up-next episodes: per-season episode counts (TMDB
  season details, cached) → `nextUp` annotation on CW entries →
  render "Up next S(n)E(1)" state (no bar) in Home CW +
  Watchlist meta. Files: `storage.js`, `HomeView.jsx`,
  `WatchlistView.jsx`.
- [ ] Step 5.3 — Per-episode CW resolution: pick latest
  unfinished-in-progress from the episodes map, not just top-level
  (`cwSeason/cwEpisode` annotation).
- [ ] Step 5.4 — Manual "mark episode watched" in the episode
  drawer (per-episode 100% into the episodes map). File:
  `EpisodeDrawer.jsx` + `storage.js`.
- [ ] Step 5.5 — Watch Later "started" state with one-tap resume.
- [ ] Step 5.6 — Provider memory surfaced ("usually on Vidy").
- [ ] Step 5.7 — Letterboxd diary/watched import (watchlist only
  today).
- [ ] Step 5.8 — Rooms (post-A1): rejoin flow + host migration when
  the host leaves. Live two-device test required.

---

## 6. CODE STRUCTURE (avoid mistakes in overcrowded code)

Diagnosis: services are clean; `App.jsx` (~630), `Player.jsx`
(~1000), `RoomView.jsx` (~1800) are god-components — every recent
bug lived in an effect edge case there.
- [x] Step 6.5 — Unified `resolveMediaType`/`mediaTypeOf` into ONE
  function in `routing.js`; `catalog.js` re-exports it (callers
  untouched). Done — the `/movie/<showId>` bug class is structurally
  impossible now.
- [x] Step 6.2 — Unit tests for pure logic (`npm test`, `node --test`,
  no new framework, 18 tests green): `tests/routing.test.js`
  (type matrix, URL round-trips incl. `?from=`, `?tab=`, legacy
  `?room=`) and `tests/storage.test.js` (CW gates incl. the Sheldon
  rule, `progressLabel` matrix, `switchEpisode`, 0-write guard).
  `tests/helpers.js` shims localStorage/window.
- [x] Step 6.3 — Extended `scripts/guard-css.sh` (checks 5–7): raw
  plurals, rogue `scrollLeft` writes, font-unaware thumb measurers.
  Verified catching a planted violation.
- [ ] Step 6.1 — Extract hooks per concern (same files first, split
  only when shared): `useBackStack`, `usePlayerUrl` (mirror +
  firstPush/prevPlay/prevRoom/prevRoute + `?from=`), `useRoomPresence`
  (track-once + join/leave + debounce), `useProgressSync`
  (heartbeat/saveNow/ended/runtime snap). One hook = one reason to
  change.
- [ ] Step 6.2 — Unit tests for pure logic (`node --test`, no new
  framework): `parseLocation`/`buildLocation` round-trips (media,
  person+`?tab=`, `?play=1&from=`, legacy `?room=`);
  `resolveMediaType` matrix; `tvEstablished` + CW gates;
  `progressLabel` matrix. (A 10-line test would have caught the
  `?from=` parse bug before any browser did.)
- [ ] Step 6.3 — Extend `scripts/guard-css.sh`: raw plurals, rogue
  `scrollLeft` writes, font-unaware thumb measurers.
- [ ] Step 6.4 — Effect discipline: every new effect gets a comment
  with its back/forward/reload story (the Heath Ledger rule).
  Reviewer checklist: mount, unmount, StrictMode double-invoke,
  rapid nav.
- [ ] Step 6.5 — Unify `resolveMediaType` (catalog.js) and
  `mediaTypeOf` (routing.js) into ONE function (two copies caused
  the `/movie/<showId>` bug).

---

## 7. SUGGESTIONS backlog (discuss, then schedule)

1. Push discipline: live keeps falling dozens of fixes behind local —
   push working versions per batch (§8 defines "working").
2. Person filmography text search within long careers.
3. Offline-first: cached detail/person shells (rails cache exists).
4. Home "View All" rails for every shelf (some rails dead-end).
5. `roomDraft` lifetime rules written down (stale-card class of bug).

---

## 8. PUSH PROCEDURE (working version only)

1. `npm run lint` → 0 errors.
2. `sh scripts/guard-css.sh` → pass.
3. `npm run build` → clean.
4. Playwright WebKit flows (§4.2 list) → all green.
5. Spot screenshots of every touched flow (desktop + 390px).
6. `git status` review — only intended files, no secrets
   (`.env.local` stays gitignored).
7. Commit with repo-style message; push; verify Vercel deploy;
   re-check the reported bug on the LIVE build (screenshots kept
   showing old code — confirm the push actually landed).
