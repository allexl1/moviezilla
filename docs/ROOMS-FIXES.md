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

4. [BUILT rooms-2.0, untested live] Rooms mobile UI: header
   truncates to one row (title class beats text-wrap: balance),
   Playlist/Sync icon-only under sm, invite chip hidden on phones
   (copy lives in Settings). Verified per tab at 390px headless.
5. [PARKED for owner's separate doc] Structural split of RoomView
   (still ~2800 lines): channel hook, playlist drawer, settings
   panels as components. Checked `docs/`: no such document exists yet
   (only `ROADMAP-10-10.md` + this file) — the owner writes it, the
   split waits for it. Do not start unprompted.
6. [DECIDED, no work] YouTube rooms stay history-free. No personal
   history is written from YT rooms; the room-level position (row
   stamp + live ticks) is the whole record. The YT player keeps no
   save path on purpose.

## P2 — playlist changes (built rooms-2.0, untested live)

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

## P3 — rooms chat (built rooms-2.0, untested live)

Live verification notes: message send, menu, reply-with-quote,
receipts render headless-green. NEEDS Supabase `room-chat` bucket
(dashboard, anon insert) or photo uploads fail with a toast. Setup:
new public bucket named exactly `room-chat`, then this policy on
storage.objects (sends fail as "bucket not found" until both exist;
the app maps that error to plain words, other upload errors pass
through raw):
`create policy "room-chat anon insert" on storage.objects for insert
to anon with check (bucket_id = 'room-chat');`
Bucket + policy live (owner dashboard): headless photo send renders
the image bubble with a receipt, no toast. Still NEEDS live 2-device
check for: photo receive, real-photo render, delete-removes-file,
GIF favorites, reaction strip, reply autofocus feel, notification
sound, fullscreen sizes.

Reference screenshots were attached in chat during discussion and then
removed from the repo (no binary junk in git). Screenshot numbers below
are labels pointing at that chat history.
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
18. Telegram-style quick reactions. A separated emoji
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
26. Composer placeholder: "Message as ..."
    → "Send message". Keep the per-room name in the aria-label only.
    Check both composers (main + floating) for the old string.
27. "1 new" pill position. It overlaps the composer bar
    today. Float it ABOVE the input/GIF/send row, Telegram-style
    (detached pill, never covering controls).
28. Fullscreen control sizes. The floating chat +
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

## P0 — rooms time: one system (PART BUILT rooms-2.0, remainder below)

BUILT and verified headless, awaiting live test: single `roomClock()`
read (frozen snapshot wins, all actions read here); `pauseKind`
precedence for display (room > provider > absent > playing);
`started` carried explicitly (row + ref, follower poll merges it);
auto-start on provider time + voice flags (embed pt/live/ppaused,
YouTube playingRef); seeks/ticks gated on started + voice; resume
rebuilds at the frozen second; LiveClock freezes on unchanged meta;
room history honesty (provider-verified writes only, never
backwards, unmount saves frozen point).
REMAINS: A1 single `resolveResume(type, id, server)` for every
announcer (hero/toast/CW rail/playlist picker say top-level while
Player opens the strict slot). Fold into the next time touch —
do not build alone.

Time audit (static: full read of Player/RoomView/YouTubeRoomPlayer +
session logs — six clocks, four pause signals, all counted):
- Clocks today: (1) Player wall (wallBase + activeMs, 8+ write
  sites); (2) Player provider truth (playbackRef + pmSeen +
  pausedProv + lastPm); (3) RoomView myPos mirror; (4) frozenPos
  pause snapshot; (5) Supabase row.position (host beat + stamps);
  (6) presence pos meta. Five copies of "where", updated on
  different triggers — every drift bug lives in the gaps.
- Pause signals today: room pausedBy, provider pausedProv,
  derived suspended, absence waitingForHost. No written precedence.
- Started is still inferred in 2+ places (startedRef, roomStarted,
  hostWatching fallback): any telemetry reset (resolution change
  reload) flips the inference. Must be carried explicitly, never
  inferred.
Rewrite plan (one pass, rooms test script after):
- One clock owner per device inside Player: a single `now()`
  returning {second, playing, source} with source =
  provider | wall | frozen. Wall accrual stays as fallback, but
  every consumer reads the same snapshot — no per-consumer accrual.
- One pause precedence, written down: ROOM_PAUSED (pausedBy) >
  PROVIDER_PAUSED (pausedProv) > ABSENT (waitingForHost) >
  PLAYING. Overlay copy, MemberRow text, header, ticks, history
  gating, seek gating all resolve through it.
- Started explicit only (row + ref). Provider reload falls back
  to last-known + row position until telemetry returns — no
  inference flip, which kills the resolution-change bug class.
- Presence pos, row position, LiveClock derive from the snapshot.
  myPos becomes a plain last-snapshot mirror; frozenPos merges
  into snapshot {frozen:true}.
- History keeps current rules, formalized: room writes only
  source==='provider' snapshots (the guards already do this —
  name it so the next change can't unpick it).
Headline item this round (user: stop layering fixes, make ONE time
system that works). Evidence: host changes resolution mid-watch →
follower sees "the host hasn't started yet" while the host is active;
paused at 3:33 shows "Watching • 4:08" ticking; idle 0:00 shows "Watching •
4:58" ticking.
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

13. Prod Supabase cleanup: junk probe rooms left in the lobby
    (verify they are gone): `GSMFZB` (older) plus P6 headless-QA rooms
    `RUMNPB` `VP5BET` `YXKUJ8` `W2AETJ` `MJAWPP` (P6 headless QA)
    plus dots/Escape-layering QA rooms `MU7X55` `GGBSX8` `RFF9YU`
    `XE44Q6` and press-states QA room `Y796ME` (host-only delete is
    unreachable headless, so they were left standing).
14. Push + publish discipline + Telegram/Vercel cache busts (`?v=` style)
    after the rooms release.
15. Visual pass per page, desktop + 390px, reporter sends screenshots.

## Open questions for owner (discuss, then spec)

- Q1. [DECIDED: no] Site-wide keyboard shortcuts — owner declined.
  Only the Enter-to-send composer behavior (item 17) ships.
- Q2. [DECIDED: Supabase bucket] Photo messages use a Supabase
  storage bucket (free tier includes storage; chat-scale photos are
  nowhere near its caps). 5MB per-file proposal stands, payloads
  carry URLs only, delete-for-everyone removes the file too. Photos
  open in a fullscreen viewer like the actors-page photo viewer —
  no in-chat library, no permanent gallery.
- Q3. [DECIDED: yes, both] GIF favorites + tap-to-freeze. Favorites
  tab in the picker (localStorage), tap a sent gif toggles animated
  / still (verify still URLs in the Giphy payload at build).
- Q4. [DECIDED: yes] "Send message" placeholder; name in
  aria-label only. Both composers.
- Q5. [DECIDED: try solo-player match first] Fullscreen buttons
  scale to the solo player chrome; verify size at build.
- Q6. [OPEN, details below] Watched-here replay start point.
  Stored startAt (one path with up-next play) vs force 0:00.
  Stored-point edge: a fully-watched title replays from near the
  credits (player clamp lands it 20s before the end). Force-0 edge:
  a title swapped away mid-watch loses its swap point on replay.
  Current spec keeps stored startAt; flip only with test evidence
  or an owner call now.
- [DECIDED] Paused copy: `Paused • {time}` (owner: "paused is ok").

## P6 — second batch (built, untested live)

Live verification notes (headless, build session): paste preview strip
renders on synthetic paste, rail send + receipts green, … menu with
12-emoji strip, reply strip, floating panel open + compact buttons +
scrolling strip, panel-fit GIF picker with Favorites tab, drag/resize/
clamps/persist + close/reopen restore, white send token, People danger
+ leave tokens, mobile 390px lobby Save fit. Escape closes menu, GIF
picker (focus back on GIF), playlist drawer and viewer without closing
the player (defaultPrevented contract; EpisodeDrawer, Picker and
ProviderPicker mark theirs too). Grip resizes on arrow keys (+persist).
Missing-bucket failure toasts plain words (DOM-asserted). Reaction chip
renders on strip tap; drawer toggles; rail tabs switch; NickGate is
Input + Cancel + white Join. Zero JS errors throughout
(sandbox embed DNS noise only).
NEEDS live 2-device check for: real photo send/receive (needs the
`room-chat` bucket first — file attach is hard headless, no run can
cover it), drag + resize feel on touch, strip scroll feel in the
panel, button look sign-off.

31. Paste / drag-drop photos into the composer (Telegram-style, the
    screenshot flow). Clipboard paste (screenshot → copy → paste) and
    file drop onto the composer produce a preview strip above the
    input: thumbnail + remove (X) + Send. Single file MVP. Notes:
    read `clipboardData.files` (image/*) on paste, `dataTransfer` on
    drop; preview via object URL, revoked after send; send reuses the
    photo upload path with the active reply attached; remove clears
    without sending. No bucket or payload changes (same URL-only
    messages as the attach button).
32. Message … placement (revised after owner live test). First
    shipped overlaid on the bubble corner to dodge the popup clip —
    but the overlay covered timestamps. Now sits outside the bubble,
    vertically centered (mine left, theirs right). The bubble wrapper
    caps at 85% width so the 32px gutter always fits, rail + panel.
33. Reaction strip scroll. 12 emoji overflow the 320px popup:
    horizontal scroll, max width of the container, no wrap. Rail
    keeps the full row.
34. Composer compact mode in the floating panel. Placeholder wrap and
    cramped pills come from full-size controls in 320px: compact prop
    on Composer (smaller buttons, input unchanged) used only by the
    floating panel; GIF picker constrains to the panel
    (left/right anchored instead of fixed width that clips).
35. Resizable + movable floating panel. Yes, feasible, moderate:
    drag handle on the panel corner resizes (pointer events, mouse +
    touch; clamps w 260–560 / h 320–90vh), and the panel drags by its
    header to anywhere over the video (position clamped to the
    viewport so it can't be lost off-screen). Size + position persist
    per device (`mz_float_chat_size`, `mz_float_chat_pos`). One
    corner handle only, not all edges.
36. Button audit (after the current batch, owner-queued). Every room
    surface to the current system: white primary circle (send/play),
    standard icon buttons, segmented pills, 14px secondary radius.
    Surfaces: RoomView header/rail/drawer/modals/playlist, chat
    bubbles/menus/composer (rail + floating), Player floating
    controls, NickGate (screenshot 1: old pill input + check button),
    RoomsView lobby. No new styles — map old ones onto existing
    tokens, delete stragglers.
37. Nickname gate restyle (part of 36, listed explicitly): current
    old-style pills → current input + white primary button.

## Solo history rewrite (in progress — replaces layering with one system)

Owner-ordered: Young Sheldon falsely completed by silent wall accrual;
vidy resolution restarts clobbered the point via un-rearmed convergence;
no auto-next. Rules locked this round: wall may resume but never finish
(completion needs provider voice or the manual eye); a series is watched
only when every episode is watched or manually marked; auto-jump best
slot, zero deletions; manual Next button only (no auto-advance).
Landed: storage truth (series rules, resolveResume with S/E override,
season-counts cache, manual series mark, ep percent stamps),
31/31 unit tests, Player one-owner read path (pos() for writes,
voice-only writer, evidence-gated ended, one-shot recovery rebuild,
unified frame resets, resolver init + episode switch, derived CW
gate). Headless proven: seeded point survives open/heartbeat/reload/
server-switch, silent slot created, zero errors.
Remains: Next button, season-count filling, watched checkmarks, full
history dates, announcer swaps, manual series-mark UI, live 2-device
proof (receive, real photo render, delete-file, feel).
Landed this round (38/38 tests, headless-green): season-count filling
(detail full catalog + per-season merges in EpisodeDrawer, detail
section and player fetch), manual Next button (null on the known
finale so the button hides, optimistic E+1 on unknown catalog, no
auto-advance), finale-ended marks the series watched (evidence-gated
like every finish, catalog-gated like every completion), episode
watched checks in the player drawer (shared helper, detail inline
deleted), full history dates on every row ("September 19, 2026"),
every announcer on resolveResume (toast, both heroes, both CW rails,
history rows, room picker), series-mark eye in the detail hero +
honest history Mark watched (tv goes through the manual eye;
Watched/History lanes read the derived truth, so a manual mark moves
tabs immediately). Headless notes: seed ids must be high (99 is a
real TMDB show and its real catalog merged mid-probe); one 16x `%c`
NaN console burst on a second player open, unreproducible across 4
reruns, no source in the tree (sandbox flake, not a gate failure);
Exit-player clicks fail headless when the chrome auto-hides —
synthetic Escape (cancelable:true) or a key poke recovers it.
Remains now: live 2-device proof (receive, real photo render,
delete-file, feel) + owner feel pass on Next/series-eye.
Landed round 4 (42/42 tests): voice-only writer — history takes
provider-verified seconds only (`decideSave`, unit-tested, both writers
routed through it), so vaplayer holds the stopped point instead of
counting wall time and stalled frames accrue nothing (this also
supersedes the old "manual Next only" rule below: owner call
AUTO-FOLLOW — a voiced ended on a known non-finale episode flows into
the next one through the Next path after a 2s grace, user play/seek or
unmount cancels; provider self-navigation params removed so one driver
exists; unknown catalog never auto-drives, vaplayer never voices so it
stays manual-only there). Hero circles mapped onto the universal icon
token with a hero-scoped on-art chip (flat ghosted over bright frames,
screenshot-proven) + the dead Tailwind accent tint moved into CSS
(unlayered author CSS beats layered utilities — it never applied).
Headless green for everything provable (order/hover asserts, drawer
Current icon, chip desktop + 390px zero-overflow); voice + follow
need live proof (sandbox embeds are DNS-dead, voice unfakeable).
Round 5 (41/41 tests): owner call, CW shows everything played — the
30s/5s gates plus tvEstablished are deleted, only pure 0s opens stay
out (headless-proven with a seeded 0:14 row).
Accounts code half (landed, needs owner dashboard half): sendCode drops
emailRedirectTo (localhost baked into the magic link), both AccountModal
hints are code-first (headless-proven copy, screenshot). Owner half:
Supabase dashboard Auth URL Configuration, Site URL to the live domain.
Brevo dropped (account verification blocked) — free tier means magic
link only, so the app handles link returns: Google OAuth as primary
(owner: Cloud Console client id/secret + enable Google in Supabase),
code boxes out, link-sent state in, return exchange + toasts in App,
localhost keeps its redirect override. Headless-proven modal; the live
tap (Google consent + link exchange + merge) is owner QA.
Football keyless part (landed): last-working source per match persists
(tap = works, reopen starts there, dead prefs fall back to 0;
headless-proven write + single entry). Stops here for keys:
competition tabs, tables, fixtures, calendar and crests all need the
football-data.org key (owner signup, .env.local + Vercel env, never
git). Notes: football has no UI entry (route /football is dead —
needs an owner call on where it lives); provider embeds show their
sandbox-detection page + a minified third-party unhandled rejection
(`cip0xy`, not our tree) under headless — environmental noise.

## Incoming (friend test session — batches 1+2 filed above as P3/P0/P6)

- Next batches append here, still nothing built until owner says so.

## History rules (locked, do not regress)

- Room writes only provider-verified seconds; idle rooms write nothing.
- Room never moves a resume point backwards (5s noise tolerance).
- Resume-after-pause rebuilds at the frozen second.
- Solo keeps latest-wins + peek rule + per-server slots.
- Finished stays finished (rewatching a completed title in a room
  does not un-complete it).
- [OWNER CALL, do not build] ROADMAP §5.1 (Un-mark-watched) reads
  against the locked rule above. Untouched until explicitly decided.
- YT rooms write no personal history (decided, see P1.6).

## PRIME RULE (from rooms/time — outranks speed)

Never layer a fix on a mechanism that should be reworked. Symptom:
three things doing one job, each patch compensating the previous
one. Response: stop, audit the subsystem, rewrite once, verify with
the test script. Layering wastes time and makes the site worse —
rooms presence and rooms time both proved it. Any new fix that needs
a second fix to survive is evidence the layer below is wrong.

## UI pilot plan (post rooms-2.0 — specified, not built)

What "expensive" means here: micro-interaction polish on the existing
cinema identity, never a redesign. Photography stays the hero; chrome
gets quieter and more physical. Measured against DESIGN.md dials +
150–300ms motion budget, one piece per round with screenshots.

Adopted:
- lucide-animated (MIT, vendored single files, same Lucide glyphs):
  Play/Pause morph (rooms header), Send, Sync spinner, Heart (GIF
  favorites). Maybe Loader. 3–5 icons max.
- arc-library (MIT, React 19 + Vite, calm motion, reduced-motion
  paths, keyboard support): pilot segmented-control (rooms tabs, My
  List pills), hold-to-confirm (Delete room), tooltip (replace
  cine-tip), toast stack (replace onToast). Vendored + re-skinned
  to cine tokens. One shared `motion` dependency serves both libs.
Rejected: shaders.com (decorative gradients = the banned aesthetic,
GPU budget belongs to video, presets behind Pro); lordicon +
flaticon-animated (wrong style, Lottie weight, premium/attribution
licensing); easyui (gooey/neon personality vs house rules,
one-author risk). Originkit unverified (JS-only site, could not
assess — verify together before any pick).
How to implement arc (the rooms lesson applied): never adopt its
theme/tokens/fonts/dark mechanics — vendor files, remap its CSS
modules onto cine tokens, keep its reduced-motion paths. One
component per round, rooms-style test after each. If a component
needs a second patch to survive, the integration is wrong: rework
the seam, do not layer. Upgrade neighboring controls to the same
tokens while touching them (tooltip/tip unification, toast
unification), but never redesign surfaces around a new component.

## UI build plan (trimmed + cinema feel — specified, not built)

Checked 2026-10-11: lucide-animated skill + play/pause/send/heart/
refresh-ccw icon docs; arc segmented-control, hold-to-confirm,
tooltip, toast-stack, select, chat-thread docs. One shared `motion`
dependency serves both libraries. All vendored (own the files, no
runtime theme to fight); arc CSS modules get remapped onto cine
tokens, never the reverse. PRIME RULE applies throughout: one piece
per round, test after each, rework seams instead of layering.
Owner trims (2026-10-11): no Ken Burns, ever. Toast-stack demoted
to rainy-day (only real gain is Undo). Select unification deferred
(invisible to users, Radix tax too high for now). Loader icon cut.
Tooltip already cut. What remains is below.

- Phase 0 — deps: `npm install motion` (lucide-react already in).
  No shadcn init, no components.json, no @/* alias: copy sources
  by hand into `src/components/icons/` (jsx-ified) and
  `src/components/arc/`, fix imports to relative paths.
- Phase 1 — animated icons (vendored, zero structural risk):
  play + pause (rooms Pause/Resume + hero Play), send (chat
  composer), refresh-ccw (Sync buttons), heart (GIF favorites).
  Hover-first delight per their docs; touch must at least not
  regress (static glyph = current look), verified per icon.
- Phase 2 — segmented-control (motion only): rooms Chat/People/
  Settings tabs, My List pills, settings On/Off groups, Watchlist
  segmented. Replaces `ui/SegmentedControl.jsx` + all manual pill
  rows (C-audit). Sliding pill, arrow-key support, reduced-motion
  path kept.
- Phase 3 — hold-to-confirm (motion only): Delete room, Clear
   watch history, playlist Clear watched. Kills the `confirm()`
   calls and the delete-confirm modal branch.
   Status: built (`ui/HoldButton`, ~900ms hold; release, blur and
   pointer-leave cancel, Enter/Space hold works, neutral fill wash,
   reduced-motion static; Delete room, settings Clear history,
   playlist Clear watched (was unguarded), menu Delete
   (pendingDelete branch + state removed). Zero native confirm()
   calls remain. Crown/kick keep the modal (consequences need
   words a hold can't carry). Headless holds proven (tombstone,
   lobby return, no modal).
- Phase 4 — cinema feel, ours (no library):
  a. Route drift: one ~150ms fade-drift between screens on the
  custom router. Screens cut today; cuts feel cheap.
  b. Staggered rail entrances: cards rise with ~30ms stagger per
  row on first paint only, never on scroll.
   c. Backdrop fidelity: full-width backdrops, async decode, no
   upscaled mush (finish the w780/w185 discipline as quality).
   Status: audited + fixed — all heroes/ghosts full-bleed
   object-cover at consistent w1280 (`original` reserved for
   zoomed photos, w780 for suspended-player blur); async decode
   added to the 7 hero/ghost imgs missing it (home x3, clean,
   detail x2, suspended player). No mush-class disparity found.
   d. Title-logo sweep: every screen uses the official logo where
   TMDB has one; plain text only as fallback. Audit, no new code.
   Status: audited clean — home/detail/clean heroes, studios and
   search-studio rows all logo-first with text fallback; person
   screens have no logos by nature; rooms/player stay text-only
   (logo fetch there would be new code, explicitly out).
  e. Skeleton discipline: slow dim sweep, layout-mirrored,
  never flashing.
  Explicitly out: Ken Burns (owner veto), ambient washes
  (audit-killed), serif display (hold stands), tap sounds,
  parallax.
- Explicitly NOT adopted: arc tooltip (cine-tip is one system),
  arc chat-thread (domain-fitted ChatView wins — borrow patterns
  only), arc button/dialog/charts (ours exist), anything Pro-gated.
- Rejected libraries stay rejected (see UI pilot plan). Originkit
  still unverified — check together only if a gap remains.

## Visual audit (2026-10-11, headless screenshots)

Screens: home, movies, detail (Fight Club), watchlist desktop; home
+ rooms (chat/people/settings/playlist) at 390px. Zero console
errors throughout. Motion notes are code-read (stills can't show
motion): no route transitions, no rail entrances, no motion lib
anywhere — screens cut, rails appear static.
- Home hero: full-bleed art, official logo, white Play, meta row,
  dots + steppers. Strong, nothing to change.
- Movies: title voice consistent, filter row fits, rating chips
   white per lime rule. Coming Soon badges quieted to the dark
   year-chip treatment (was loud green).
- Detail: logo, facts panel, IMDb-upgraded ratings, honours rail.
  Strong. Mobile detail not shot — cover in the visual pass.
- Watchlist: honest empty state, segmented tabs work. Segmented
  is an arc pilot target (Phase 2).
- Mobile home: hero stacks, dock nav fits, Play reachable. Good.
- Rooms mobile: header fixed this round (truncate + icon-only +
  chip hidden); rail tabs, composer, drawer verified per tab.
- Opportunities (mapped): route drift (Phase 4a), rail stagger
  (4b), backdrop fidelity (4c), logo sweep (4d — detail/home
  already good, sweep remaining screens), skeleton discipline
  (4e). No new items beyond the plan.

## Motion plan (specified, not built — owner picks: all liked
except Ken Burns)

Owner verdicts 2026-10-11: View Transitions API yes, staggered
entrance yes, FLIP yes, skeleton shimmer yes (keep), scroll-driven
yes, Ken Burns never. This section covers EVERY surface, including
the ones missed before (nickname gates, Letterboxd connect, 404 and
error fallbacks, every button). One motion system (PRIME RULE):
tokens + 6 patterns below, no per-screen inventions.

Tokens (add once, index.css): --mz-dur-1 150ms, --mz-dur-2 250ms,
--mz-dur-3 300ms; --mz-ease-out cubic-bezier(0.16,1,0.3,1).
Reduced motion: all patterns collapse to instant opacity or nothing
(media query + existing mz-low-power gates). Nothing may exceed
300ms except ambient shimmer.

- P1 route drift (View Transitions API): tab switches, detail
   open/close, room enter/leave, player open/close cross-fade with
   a slight rise (~150ms). Custom router wraps state updates in
   `document.startViewTransition`, feature-detected with instant-cut
   fallback (current behavior). Reduced motion: skip entirely.
   Status: built (`drift()` in App shell covers tabs, detail,
   person/studio, back-stack, popstate, player open/close, room
   enter/leave; nested calls run direct under the outer transition;
   `mz-vt` body flag kills the four page mount fades where drift
   runs, older browsers keep them; overlays untouched). Headless
   nav suite green (tabs, detail open, browser back, overlap rule
   computed live). Feel pass owed to owner devices.
  OVERLAP RULE (audited 2026-10-11): mount fades already exist
  (person/media/studio 300ms, Player 200ms, cine-fade-in/up,
  hero-in). Drift REPLACES page-level mount fades where it lands —
  never both. Overlay fades (modal/drawer/viewer/toast) stay
  untouched; they are not route changes.
- P2 stagger entrance: first paint only, never on scroll. UPGRADE,
   not addition: `cine-card-in` already animates every poster card.
   Extend it with a per-index delay variable (rails set `--i`,
   capped ~12), same keyframes, same budget. RowRail/Card stay the
   only owners of card entrance. Status: built (RowRail passes capped
   index, grids without index unchanged, reduced-motion kills the
   entrance) — feel pass owed to owner devices.
- P3 FLIP glide: segmented pills (rooms tabs, My List, settings
  On/Off, Watchlist segmented — shared with the arc pilot),
  navbar thumb (already glides? verify, else unify), toast stack
  when it lands. Shared-layout-id technique or arc's
  implementation, one per control.
- P4 press states (the missed-buttons audit): EVERY tappable
  squashes (scale .97, 150ms, never flash). Main button classes
  already have :active — audit ADDS it only where missing, never
  restyles existing ones. Audit list: room
  header buttons, rail tabs, chat bubbles with actions, message
  menu items, composer buttons, playlist rows + buttons, My List
  rows, invite copy buttons, settings pills/sliders thumbs,
  NickGate save, RoomsView nickname save, Watchlist Letterboxd
  connect/save/change, search result rows, filter pills, episode
  rows + eye toggles, cast cards, provider/server menus, player
   chrome, floating chat controls, modal buttons, empty-state
   actions, error retry buttons. Anything tappable missing the
   press token gets it; nothing gets a custom one. Status: rooms
   gap-fill built (menu rows, reaction chips, button-rows at .98,
   slider thumbs affirm on grab, strip emoji via utility;
   reduced-motion collapses all press transforms to none) plus
   outward round 1 (seg buttons, episode-drawer rows at .98) plus
   outward round 2, global completion (nav buttons, cast cards with
   keyboard operability added, reduced-motion covers the family) —
   feel pass owed to owner devices. Left as media-hover language
   on purpose: episode/trailer/poster tiles and GIF cells
   (press would fight the hover lift). Queue/MyList rows are not
   tappable (their buttons already press); text links are not
   press surfaces; hero dots/steppers and rail arrows are
   micro/zone affordances with instant feedback (nothing
   perceivable to squash).
- P5 shimmer (keep + discipline): slow dim sweep only, layout
   mirrored everywhere it appears. Audit: Movies/Shows grids,
   Home rails, detail/person/studio loading states, search,
   rooms lobby trending, chat history. No flashing variants.
   Status: audited clean — one `.skel` recipe (1.4s dim sweep),
   all usages mirrored (SkelGrid/SkelRail/SkelRow/person inline/
   hero blocks); zero duration overrides; `animate-pulse` only on
   live-status dots (server/live/airing — purposeful, not loading);
   spinners stay per C4 (explicitly not this project); detail fills
   progressively with honest "Loading details..." text instead of
   shimmer. Nothing to change.
- P6 scroll-driven (no parallax, ever): IntersectionObserver
   section reveals (subtle rise, once each), back-to-top reveal
   (exists — verify threshold), collapsing room People header?
   No. Sticky headers stay static. Parallax stays banned (jank).
   Status: reveals built (one-shot `Reveal`, rooms lobby sections,
   reduced-motion shows instantly; headless asserts all-visible
   after scroll + no x-overflow). Globalized: RowRail owns its
   reveal (every rail app-wide) + home Continue Watching; lobby
   wrapper removed to avoid a double. Round 2: UpcomingRail owns
   its reveal (Movies + Shows), detail episodes / honours / cast /
   trailers, person photos / honours, studio top billed / catalog,
   Movies + Shows released grids. Heroes, headers, mobile meta
   chips and empty states stay instant by design. Back-to-top threshold verified
   on /clean (hidden at top, appears past 0.8x viewport, returns
   to top) — note it lives only on the test route; real routes
   getting one is an owner call, not built unprompted.

Per-surface checklist (build order = rooms first, then outward):
1. Room detail: header (drift in), video column (fade), rail
   tabs (FLIP), chat messages (rise on arrival only if pinned —
   already pinned-aware, add entrance), composer focus (no motion),
   playlist drawer (slide-in exists — verify duration ≤300ms),
   People rows (stagger on tab open), settings rows (static,
   press states), NickGate (entrance + save press).
2. Rooms lobby: pick flow, nickname gate, trending rail stagger,
   join/create press states.
3. Chat everywhere (rail + floating + fullscreen): message
   entrance, menu open (fade/scale 150ms), reaction strip,
   composer send (arrow lift is arc's? no — keep ours), viewer
   open/close, pill moves (already absolute — verify offset).
4. Player (solo + YT + room frame): open/close drift, chrome
   auto-hide fade (exists — verify), fullscreen toggle (no
   motion, instant), episode drawer + server menus (150ms),
   endings (no motion).
5. Media detail + person + studio: hero drift-in, facts column
   fade, rails stagger, episode rows press, eye toggles,
   cast cards press, trailer (if any) instant.
6. Home/movies/shows/watchlist/football: hero drift, rail
   stagger, filter pills press + FLIP if segmented lands,
   cards press, badges static.
7. Modals (search/settings/account): open/close 200ms fade-scale
   (Modal has it — verify all three), inputs focus rings (exist),
   buttons press.
8. Letterboxd connect/save/change + nickname save: press states
   + inline success (no toast-only feedback where the button
   itself can confirm).
9. Empty states: fade in with content (no separate animation);
   error + retry rows: press states, no motion.
10. ErrorBoundary fallback ("Something broke") + unknown routes
    (land home with drift like any tab switch — no separate 404
    exists by design): fallback gets entrance + press states on
    Try again / Go Home.
11. Toasts: rise/fade only until the toast-stack phase; no custom
    motion per call site.

Verification (stills can't show motion): DevTools animation
inspector + reduced-motion emulation per batch; headless probes
assert no-JS-errors + layout stability (motion is CSS-only, never
layout-shifting). Manual device pass for feel, owner judges.

## Site-wide layering audit (playback/nav/UI surveyed)

Rooms/time already done (six clocks → one reader; presence to
discrete-only). Queued areas below; findings append here, fixes
follow the PRIME RULE (rewrite once, no layering).
- A. Playback/history/resume across Player/storage/views.
- B. Navigation/back-stack/tabs/routing.
- C. UI primitives (buttons/pills/modals/toasts/tips/skeletons/
  empty states/segmented controls).
- Findings (surveyed, not yet fixed):
   A1. [DONE this round] Display second vs play
   second: hero/toast/CW picker announce top-level (or hardcoded vidy)
   seconds while the Player opens the strict current-server slot — same
   title can say 7:00 and open 0:00 after a server switch. Disposition:
   single `resolveResume(type, id, server)` used by every announcer.
  A2. [REAL, contained] Two clocks, one row: wall estimate vs
  provider time both write the same key. Priority/convergence/
  20s-freeze contain it; the rewrite's single-owner rule finishes it.
  A3. [REAL, contained] Slots vs top-level: divergent per-server
  seconds under one latest-wins top-level; 3+ readers treat
  top-level as resume truth. Same resolver as A1.
  A4. [REAL, benign] Watched denominators differ (provider %,
  runtime-anchored 95%, ended snap, manual 1/1, sync recompute).
  Converge only if a wrong-Watched report arrives; today each path
  is honest in its context.
  A5. [REAL, by design] Local vs sync writer can disagree on resume
  indefinitely (latest-wins vs newer-wins). Accepted, do not touch.
  B1. [REAL, latent] Dual back truths: browser history vs in-app
  backStack, reconciled by heuristics; player-close has 4 stacked
  guards. No user complaint on record — do NOT rewrite unprompted;
  reopen only on a back-button bug report.
  B2. [REAL, latent] `resolveMediaType` central vs 6-branch inline
  copy in `playMedia` (wrong branch = wrong URL/tab). Unify on
  next touch of that code, not before.
   C1. [PART DONE] Dropdowns: Picker vs ProviderPicker vs
   ServerSwitcher (+ dead `ui/Select`, 0 imports — delete it).
   Select deleted + barrel cleaned. Unify WITH the arc pilot
   (arc select), not separately.
   C2. [DONE by item 36] Buttons: white vs primary vs control-btn +
   inline sizes + once-used danger + circle-vs-icon. Send circle,
   Delete/Leave, lobby Save mapped onto tokens; tertiary text actions,
   emoji strip buttons and mat-row rows intentionally left (not button
   surfaces). No separate pass.
  C3. [REAL, queued] Dialogs: Modal (trapped) vs sheets/drawers/
  twin lightboxes/`confirm()`. Unify during button audit; twin
  chat/person lightboxes merge first (identical code).
  C4. [BENIGN] Spinners ×5 sizes, raw empty-state stragglers,
  `title=` tooltips in FootballView, ad-hoc skels. Fold into the
  button audit opportunistically, never its own project.
  Toasts, tips, skeletons, inputs, sliders: one system each —
  leave alone.
