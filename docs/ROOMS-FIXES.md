# Moviezilla — Rooms fixes (parked until rooms are done)

Read after the rooms work lands. Source: the rooms debug sessions + the
session migrate note. `docs/ROADMAP-10-10.md` still owns the older backlog
(§7); this file owns everything discovered since. Status as of the
simplification pass: P0 is NOT all done (see §P0). More rooms changes are
expected from the friend test session — append them under §Incoming,
do not start building them unprompted.

## P0 — rooms hardening leftovers (not all done)

1. [DROPPED by owner] Socket CLOSED every ~20s, cause unknown.
   Deliberately no longer pursued: the reconnect healer masks it in
   ~2s and the roster holds. Reopen only if it ever becomes visible
   to users again.
2. [MITIGATED, environmental] Phone socket flapping (mobile Safari
   background kill suspected). Mitigation for tests: phone awake +
   foregrounded. If real background presence is ever wanted, that is
   its own project. No code owed unless it persists on stable network.
3. [DONE by design, monitoring only] Rate-limit watch: presence is
   discrete-only now (join/pause/play/seek/swap/rename). If
   `ClientPresenceRateLimitReached` returns in the Supabase logs,
   volume went up somewhere — check ticks/broadcasts before touching
   presence.

## P1 — rooms follow-ups

4. Rooms mobile UI. The room screen was never adapted for phones
   (deferred until rooms stabilized). Playlist drawer, header scroll
   row, People/Settings tabs at 390px.
5. [PARKED for owner's separate doc] Structural split of RoomView
   (still ~2800 lines): channel hook, playlist drawer, settings
   panels as components. Checked `docs/`: no such document exists yet
   (only `ROADMAP-10-10.md` + this file) — the owner writes it, the
   split waits for it. Do not start unprompted.
6. [DECIDED, no work] YouTube rooms stay history-free. No personal
   history is written from YT rooms; the room-level position (row
   stamp + live ticks) is the whole record. The YT player keeps no
   save path on purpose.

## P2 — playlist changes (specified, not built)

All host-only (followers see the playlist read-only, unchanged). All
rows keep the existing Add (+) / Play-now (▶) pair. Nothing here
touches the real CW / Watch Later / Letterboxd lists — the picker is
a view over them.

7. Replay from "Watched here". Watched rows today show Check + remove
   X only, so a finished title just sits there. Add a Play-again (▶,
   tip "Play again") button that replays it via the normal play path
   (`queuePlay(item.key)`), i.e. with the item's stored
   season/episode/startAt. Keep Check + X as-is. Explicitly NOT a
   "move back to Up next" reorder: queue identity is title-level
   (`keyOfMedia`), so the same key cannot sit in two sections; play
   again is the honest version of "put back".
   Replay-start rule: watched-here items replay from their stored
   startAt (same as any up-next play — one path, no special case).
   The player clamp (`runtime - 20s`) guards a startAt parked at the
   very end. If play-testing shows replays landing in the credits,
   revisit as: watched-here replay forces startAt 0 — but only with
   test evidence, not preemptively.
8. Dynamic "From my list" (both tabs). Any title already in the room
   queue disappears from the picker the moment it is picked — Add and
   Play-now both count as picking — and reappears if removed from the
   queue. The real Continue Watching / Watch Later lists are never
   modified, this is display filtering only.
   Implementation note: `MyListPicker` needs the queued keys, so pass
   a `queuedKeys` prop (array of `q.key` from the room queue) and
   filter rows by the picked key (`keyOfMedia(picked)` — compute the
   picked first via the existing converters, then filter). Fully
   derived from queue state: no extra state, no sync bugs. Adding
   hides the row in the same render; removing from the playlist
   unhides it.
   Known limitation (document, do not fix here): queue identity is
   title-level, so S1E1 queued hides S3E8 of the same show in the
   picker. Episode-scoped keys are the proper fix and a bigger
   change — separate item if it ever bites.
9. Letterboxd inside the Watch Later tab. After the site-watchlisted
   rows, a `Letterboxd • N` subheader (mirrors the WatchlistView
   group head), then the Letterboxd rows. Details, all mirroring
   WatchlistView conventions:
   - Source: `localStorage` key `mz_letterboxd_user` (the same key
     App uses). Empty/absent → no Letterboxd section at all. No
     username form in the room — setup stays in Watchlist.
   - Fetch: `letterboxd.fetchUserWatchlist(user)` when the playlist
     drawer opens, cached for the drawer session. Loading → skeleton
     row; failure → compact error + retry (app-wide contract:
     skeleton for loading, compact error + retry, never full-page).
   - Filter: `storage.getHiddenLetterboxd()` blocklist applies
     (a title hidden in Watchlist stays hidden here).
   - Rows carry Letterboxd URL ids, NOT TMDB ids, and fallback
     posters (the LB grid has no art). Add/Play must resolve first:
     `tmdb.resolveTitle(title, year)` → build the picked TMDB shape →
     `queueAdd`. Buttons take a busy state while resolving;
     resolve failure → toast, row stays.
   - Play-now for LB plays from 0:00 (Letterboxd has no times).
   - Verify `tmdb.resolveTitle` signature at build time (service
     comment is the contract: resolve via it before entering the
     detail/playback flow).

## P3 — player / providers

10. Sandbox + ads popup pass (deferred, after mobile). Probe with
    popup tracking instead of guessing. Includes the
    fullscreen-exit-on-popup complaint: Safari exits fullscreen on
    any popup by design, so part of this is working around the
    browser, not the provider.
11. Pending PLAYER issue from the old migrate note — never described.
    Still owed by the user, do not start anything here unprompted.
12. Silent in-embed pauses are invisible to all code (no event, no
    signal). The room Pause button is deterministic truth. No action,
    just the documented limit — do not "fix" again without new evidence.

## P4 — hygiene / publish

13. Prod Supabase cleanup: junk probe room `GSMFZB` left in the lobby
    (verify it is gone).
14. Push + publish discipline + Telegram/Vercel cache busts (`?v=` style)
    after the rooms release.
15. Visual pass per page, desktop + 390px, reporter sends screenshots.

## Incoming (friend test session — appended, not started)

- (empty — owner sends more rooms changes here next)

## History rules (locked, do not regress)

- Room writes only provider-verified seconds; idle rooms write nothing.
- Room never moves a resume point backwards (5s noise tolerance).
- Resume-after-pause rebuilds at the frozen second.
- Solo keeps latest-wins + peek rule + per-server slots.
- Finished stays finished (rewatching a completed title in a room
  does not un-complete it).
- YT rooms write no personal history (decided, see P1.6).
