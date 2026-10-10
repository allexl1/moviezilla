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

## P3 — rooms chat (specified from friend test, not built)

Reference screenshots live in `docs/rooms-assets/` (filenames below).
To attach: save each screenshot under its name, paths already wired.
Chat actions reuse the existing message shape (`chat.jsx` contract:
text/gif + reply + reactions + receipts); photo messages add one new
`kind` (see 19).

16. Reply inside the fullscreen floating chat is broken (can't answer
    from the player popup). Fix at build: the floating composer must
    share the reply target/state with the main composer (it already
    receives `replyTo`/`setReplyTo` — verify the reply chip + send
    path, likely the chip UI or the send wiring, not state).
17. Enter-to-send in both composers (main + floating). Enter sends,
    Shift+Enter makes a newline. Verify main composer already does
    this; bring floating to parity.
18. Telegram-style quick reactions (screenshot 1:
    `rooms-assets/chat-telegram-reactions.jpg`). A separated emoji
    strip floating above the message action menu, one tap to react —
    no menu diving. Add 👀 and 🥴 to the set. Check current reaction
    UI in `chat.jsx` at build, then replace.
19. Photo messages. Composer gets an attach (photo) button next to GIF:
    pick from device → upload → message with preview/title/url (same
    pattern as gif messages). Open decisions (see §Open questions):
    Supabase storage bucket, per-file cap (proposal 5MB), chat payload
    carries URLs only (120-message localStorage cache stays tiny).
    Delete-for-everyone should remove the file too — confirm at build.
20. Reply focuses writing immediately (friend: "ответ чтоб сразу
    начинал писать а не каждый раз кликать на строку ввода"). Tapping
    Reply (or a reply quote) autofocuses the composer with the
    keyboard up, floating + main. No shortcuts needed for this —
    plain autofocus.
21. GIFs as replies are broken (can't answer with a gif). The text
    reply payload already carries `kind`; the gif send path ignores
    `replyTo`. Wire it through and render gif previews inside reply
    quotes (mirror how text quotes render).
22. GIF favorites. Favorite toggle on picker items (persisted,
    localStorage list of gif ids/urls), a Favorites tab in the
    picker, tap-to-send. Play/pause on sent gifs: tap a sent gif
    toggles between animated and still (needs still preview URLs —
    verify Giphy payload has them at build; if not, skip the toggle,
    keep favorites).
23. Reply-jump highlight (friend: "подсветка сообщения, на которое
    кто-то отвечает... когда переходишь, чтоб было видно какое среди
    остальных"). Tapping a reply quote scrolls to the original and
    flashes a highlight ring on it (~1.5s fade) so it stands out
    among the rest.
24. Smart autoscroll (friend: auto-scroll "по мере написания
    сообщений", but tricky). Researched pattern (live search is down,
    from messenger conventions — verify against Telegram at build):
    Telegram sticks to bottom ONLY while the user is already at (or
    near) the bottom; new messages arriving while the user reads
    history do NOT yank — instead an unread counter / "jump to
    latest" pill appears, tap jumps down. Adopt exactly that:
    pin-aware scroll (the ChatView pane already owns pin-aware
    scrolling — extend it), floating "N new" pill when pinned-off
    (see 27), jump-down on tap. Never force-scroll a reading user.
25. Floating-chat parity audit. The popup must do everything the main
    chat does: reply, reactions, receipts ("Seen by"), edit, delete,
    timestamps. Gaps reported: reply, seen state, delete at minimum.
    Fix = share the components/handlers, not a second implementation.
    Audit list at build: composer (reply chip, Enter-send, GIF,
    photo), message menu (react, reply, edit, delete), receipts line,
    timestamps, unread badge.
26. Composer placeholder (screenshot 5:
    `rooms-assets/chat-composer-placeholder.jpg`): "Message as ..."
    → "Send message". Keep the per-room name in the aria-label only.
    Check both composers (main + floating) for the old string.
27. "1 new" pill position (screenshot 4:
    `rooms-assets/chat-new-pill.jpg`). It overlaps the composer bar
    today. Float it ABOVE the input/GIF/send row, Telegram-style
    (detached pill, never covering controls).
28. Fullscreen control sizes (screenshot 6:
    `rooms-assets/chat-fullscreen-buttons.jpg`). The floating chat +
    fullscreen buttons are tiny in fullscreen. Scale to the basic
    (solo) player chrome — verify what that scale is at build
    (user suggests ~3x, confirm against solo, do not eyeball).
29. Notification sound reliability. Symptoms: sound doesn't always
    play; fullscreen + closed chat = silent when it should notify.
    Audit at build, prime suspects in order: AudioContext locked
    until first user gesture (tone never unlocked — needs a gesture
    tap to prime); `canSee` miscomputed in fullscreen (rail hidden
    counts as seen); in-chat/master/volume gate order; tone file
    preload failing. Repro first with a manual trigger, then fix the
    actual gate — do not re-layer guesses here.

## P0 — rooms time: one system (specified, not built)

Headline item this round (user: stop layering fixes, make ONE time
system that works). Evidence: host changes resolution mid-watch →
follower sees "the host hasn't started yet" while the host is active;
paused at 3:33 shows "Watching • 4:08" ticking (screenshot 2:
`rooms-assets/time-paused-drift.jpg`); idle 0:00 shows "Watching •
4:58" ticking (screenshot 3: `rooms-assets/time-idle-drift.jpg`).
Preliminary diagnosis to verify at build (not conclusions):
(a) provider reloads reset telemetry, and "started" is still partly
inferred — carry started explicitly on the row, never infer it from
clocks; (b) wall accrual without provider voice must never advance
presence/history — the 20s-quiet cap only covers providers that spoke
first, mute-from-boot accrues unbounded; (c) paused display derives
from room pause state first, provider state second, wall estimate
never. Rewrite rule: ONE clock owner per device (the Player), ONE
pause truth (room `pausedBy`, then provider-declared pause), and
presence + history + display all read the same frozen-or-ticking
value. No separate accrual per consumer.
Requested copy: paused state reads "On pause • 4:08" style (user
wording — confirm exact strings with owner at build; proposal:
`Paused • 4:08` / `On pause • 4:08`).
30. Resolution-change false "not started" (part of the rewrite, own
test): host changes resolution mid-watch → follower must stay in
sync, never see not-started, clocks continuous. Add to the rooms
test script permanently.

## P4 — player / providers

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

## P5 — hygiene / publish

13. Prod Supabase cleanup: junk probe room `GSMFZB` left in the lobby
    (verify it is gone).
14. Push + publish discipline + Telegram/Vercel cache busts (`?v=` style)
    after the rooms release.
15. Visual pass per page, desktop + 390px, reporter sends screenshots.

## Open questions for owner (discuss, then spec)

- Q1. Site-wide keyboard shortcuts (Ctrl+F style)? Default: no —
  rooms chat ships mouse/touch only unless owner says otherwise.
- Q2. Photo messages: Supabase storage bucket OK? Per-file cap?
  (Proposal: 5MB, URLs only in payload, delete removes file.)
- Q3. GIF still-frame toggle on tap: worth it, or skip to keep
  favorites lean?
- Q4. "Send message" placeholder: name in aria-label only — OK?
- Q5. Fullscreen button scale: match solo player exactly — confirm
  target at build.
- Q6. Watched-here replay start point: stored startAt (same as
  up-next) or force 0:00? Specified startAt; flip only with test
  evidence.

## Incoming (friend test session — first batch filed above as P3/P0)

- Next batches append here, still nothing built until owner says so.

## History rules (locked, do not regress)

- Room writes only provider-verified seconds; idle rooms write nothing.
- Room never moves a resume point backwards (5s noise tolerance).
- Resume-after-pause rebuilds at the frozen second.
- Solo keeps latest-wins + peek rule + per-server slots.
- Finished stays finished (rewatching a completed title in a room
  does not un-complete it).
- YT rooms write no personal history (decided, see P1.6).
