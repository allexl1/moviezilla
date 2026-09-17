import { useState, useEffect } from 'react';
import { getSupabase } from './supabase';
import { storage, WATCHED_PCT } from './storage';
import { myNickname as deviceNickname } from './rooms';

// Account: passwordless email auth (magic link + OTP code) with a
// two-way sync engine for watchlist + playback progress.
//
// Contract (documented, keep it):
// - localStorage is the offline cache AND the read path. The app never
//   reads Supabase directly for library data — it reads storage.js.
// - Server wins per key by updated_at. Local-only keys push up.
// - Sync runs on sign-in (full merge) and on local edits afterwards
//   (debounced push). No realtime subscription: two devices editing the
//   same title converge on next sign-in / app start.
// - Watchlist deletions propagate via tombstones (offline deletes don't
//   resurrect). Progress deletes behave the same.
// - Rooms, nicknames-as-identity aside, stay device-local: presence,
//   grants and host state never touch the account.
// - Display name lives in auth user_metadata (no extra table): one name,
//   everywhere, on every device.

// --- session ---------------------------------------------------------------

let currentUser = null;
let initialized = false;
const subs = new Set();

function emit() {
  for (const fn of subs) {
    try {
      fn(currentUser);
    } catch {
      // A dead subscriber must never break auth for the rest.
    }
  }
}

async function initAuth() {
  const sb = getSupabase();
  if (!sb) {
    initialized = true;
    emit();
    return;
  }
  try {
    const { data } = await sb.auth.getSession();
    currentUser = data?.session?.user || null;
  } catch {
    currentUser = null;
  }
  initialized = true;
  emit();
  if (currentUser) {
    // Returning device with a live session: converge, then push.
    void mergeFromServer().catch(() => {});
  }
  try {
    sb.auth.onAuthStateChange((event, session) => {
      const u = session?.user || null;
      const wasId = currentUser?.id;
      currentUser = u;
      emit();
      if (u && u.id !== wasId && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        void mergeFromServer()
          .then(() => scheduleFlush(1500))
          .catch(() => {});
      }
      if (event === 'SIGNED_OUT') stopFlush();
      if (event === 'USER_UPDATED') {
        // Nickname/display change — subscribers re-render via emit above.
      }
    });
  } catch {
    // Auth listener unavailable — session from getSession still stands.
  }
}

let initPromise = null;
export function ensureAuth() {
  if (!initPromise) initPromise = initAuth();
  return initPromise;
}

export function useAccount() {
  const [user, setUser] = useState(() => currentUser);
  const [ready, setReady] = useState(() => initialized);
  useEffect(() => {
    let alive = true;
    ensureAuth().then(() => {
      if (alive) {
        setUser(currentUser);
        setReady(true);
      }
    });
    const fn = (u) => {
      setUser(u);
      setReady(true);
    };
    subs.add(fn);
    return () => {
      alive = false;
      subs.delete(fn);
    };
  }, []);
  return { user, ready, displayName: user?.user_metadata?.display_name || '' };
}

export function displayName() {
  try {
    return String(currentUser?.user_metadata?.display_name || '').trim();
  } catch {
    return '';
  }
}

// The one name used everywhere (rooms, chat, playlist): account wins,
// device nickname is the logged-out fallback. When logged in, the device
// nickname is forgotten by design.
export function effectiveName() {
  return displayName() || deviceNickname();
}

// --- auth actions ------------------------------------------------------------

function friendlyAuthError(err, fallback) {
  const msg = String(err?.message || '');
  if (/sign ?ups? (not allowed|are disabled)/i.test(msg)) {
    return 'Email sign-in is off in Supabase — enable the Email provider, then retry.';
  }
  if (/rate ?limit|too many/i.test(msg)) return 'Too many tries — wait a minute, then retry.';
  if (/expired/i.test(msg)) return 'That code expired — send a new one.';
  if (/invalid|incorrect|wrong|token/i.test(msg)) return 'Wrong code — check the email and try again.';
  if (/network|fetch|failed/i.test(msg)) return 'Network hiccup — check connection and retry.';
  return msg || fallback;
}

export async function sendCode(email) {
  const clean = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('Enter a valid email address.');
  const sb = getSupabase();
  if (!sb) throw new Error('Sync service is not configured.');
  const { error } = await sb.auth.signInWithOtp({
    email: clean,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw new Error(friendlyAuthError(error, 'Could not send the code.'));
}

export async function verifyCode(email, code) {
  const clean = String(email || '').trim().toLowerCase();
  const token = String(code || '').trim();
  if (token.length < 6) throw new Error('Enter the 6-digit code from the email.');
  const sb = getSupabase();
  if (!sb) throw new Error('Sync service is not configured.');
  const { error } = await sb.auth.verifyOtp({ email: clean, token, type: 'email' });
  if (error) throw new Error(friendlyAuthError(error, 'Could not verify the code.'));
  // SIGNED_IN event drives merge + subscribers.
}

export async function signOut() {
  try {
    await getSupabase()?.auth.signOut();
  } catch {
    // Offline sign-out: drop the local session view anyway.
    currentUser = null;
    emit();
  }
  stopFlush();
}

export async function saveDisplayName(name) {
  const clean = String(name || '').trim().slice(0, 24);
  if (!clean) throw new Error('Enter a name (up to 24 characters).');
  const sb = getSupabase();
  if (!sb || !currentUser) throw new Error('Sign in first.');
  const { data, error } = await sb.auth.updateUser({ data: { display_name: clean } });
  if (error) throw new Error(friendlyAuthError(error, 'Could not save the name.'));
  if (data?.user) {
    currentUser = data.user;
    emit();
  }
}

// --- sync engine ---------------------------------------------------------------

const SYNC_STATE_KEY = 'moviezilla_sync_state';
const PROGRESS_PUSH_MS = 45000;

function syncState() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_STATE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function setSyncState(patch) {
  try {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({ ...syncState(), ...patch }));
  } catch {
    // Persistence is a nicety — the engine still works per session.
  }
}

export function lastSyncedAt() {
  return syncState().lastSyncAt || 0;
}

let flushTimer = null;
let lastProgressPush = 0;

function stopFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}

function notifySyncUI() {
  try {
    window.dispatchEvent(new CustomEvent('mz:account-sync'));
  } catch {
    // Headless/tests: nobody listens.
  }
}

export function scheduleFlush(delayMs = 2500) {
  if (!currentUser) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush().catch(() => {});
  }, delayMs);
}

// storage.js dispatches window 'mz:account-dirty' {kind} on every local
// write. Watchlist edits push fast; progress heartbeats are throttled.
if (typeof window !== 'undefined' && !window.__mzAccountDirtyWired) {
  window.__mzAccountDirtyWired = true;
  window.addEventListener('mz:account-dirty', (e) => {
    if (!currentUser) return;
    const kind = e?.detail?.kind;
    if (kind === 'watchlist') {
      scheduleFlush(2500);
      return;
    }
    const wait = Math.max(0, PROGRESS_PUSH_MS - (Date.now() - lastProgressPush));
    scheduleFlush(wait > 0 ? Math.min(wait, PROGRESS_PUSH_MS) : 2500);
  });
}

const numId = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function toWatchRow(userId, item) {
  const id = numId(item.id);
  if (!id) return null; // Unresolved Letterboxd rows (URL ids) stay local.
  return {
    user_id: userId,
    tmdb_id: id,
    media_type: item.media_type === 'tv' || item.type === 'tv' ? 'tv' : 'movie',
    status: 'watchlist',
    season: 1,
    episode: 1,
    position: 0,
    duration: 0,
    title: String(item.title || item.name || '').slice(0, 120),
    poster: String(item.poster_path || item.poster || '').slice(0, 200),
    updated_at: new Date(item.updatedAt || Date.now()).toISOString(),
  };
}

function toProgressRow(userId, entry) {
  const id = numId(entry.mediaId);
  if (!id) return null;
  const pct = entry.percent || 0;
  return {
    user_id: userId,
    tmdb_id: id,
    media_type: entry.type === 'tv' ? 'tv' : 'movie',
    status: pct >= WATCHED_PCT ? 'watched' : 'history',
    season: entry.season || 1,
    episode: entry.episode || 1,
    position: Math.floor(entry.currentTime || 0),
    duration: Math.floor(entry.duration || 0),
    title: String(entry.title || '').slice(0, 120),
    poster: String(entry.poster || '').slice(0, 200),
    updated_at: new Date(entry.updatedAt || Date.now()).toISOString(),
  };
}

async function pushWatchlist(sb, userId) {
  const st = syncState();
  const items = storage.getWatchlist();
  const rows = [];
  for (const item of items) {
    const r = toWatchRow(userId, item);
    if (!r) continue;
    if (!st.lastWatchlistPush || (item.updatedAt || 0) > st.lastWatchlistPush) rows.push(r);
  }
  if (rows.length > 0) {
    const { error } = await sb.from('watch_states').upsert(rows, { onConflict: 'user_id,tmdb_id,media_type' });
    if (error) throw error;
    // Stamp pushed items so the next flush skips them (quiet, no UI event).
    const stamped = storage.getWatchlist().map((it) => ({ ...it, updatedAt: it.updatedAt || Date.now() }));
    storage.replaceWatchlistSilent(stamped);
    setSyncState({ lastWatchlistPush: Date.now() });
  }
  const tombs = storage.getTombstones();
  const dead = Object.keys(tombs.wl || {});
  if (dead.length > 0) {
    const ids = dead.map(numId).filter(Boolean);
    if (ids.length > 0) {
      const { error } = await sb.from('watch_states').delete().eq('user_id', userId).eq('status', 'watchlist').in_('tmdb_id', ids);
      if (error) throw error;
    }
    storage.clearTombstones('wl', dead);
  }
}

async function pushProgress(sb, userId, sinceTs) {
  const entries = storage.getProgressEntries().filter((e) => (e.updatedAt || 0) > sinceTs);
  const rows = entries.map((e) => toProgressRow(userId, e)).filter(Boolean);
  if (rows.length > 0) {
    const { error } = await sb.from('watch_states').upsert(rows, { onConflict: 'user_id,tmdb_id,media_type' });
    if (error) throw error;
  }
  const tombs = storage.getTombstones();
  const deadKeys = Object.keys(tombs.prog || {});
  if (deadKeys.length > 0) {
    // Tombstone keys are `${type}_${id}` — delete per exact row.
    for (const k of deadKeys) {
      const [type, rawId] = String(k).split('_');
      const id = numId(rawId);
      if (!id) continue;
      const { error } = await sb
        .from('watch_states')
        .delete()
        .eq('user_id', userId)
        .eq('tmdb_id', id)
        .eq('media_type', type === 'tv' ? 'tv' : 'movie')
        .in_('status', ['history', 'watched']);
      if (error) throw error;
    }
    storage.clearTombstones('prog', deadKeys);
  }
  if (storage.getProgressClearFlag()) {
    const { error } = await sb
      .from('watch_states')
      .delete()
      .eq('user_id', userId)
      .in_('status', ['history', 'watched']);
    if (error) throw error;
    storage.clearProgressClearFlag();
  }
}

async function flush() {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  const userId = currentUser.id;
  const st = syncState();
  const sinceTs = st.lastProgressPush || 0;
  // Watermark = flush START: entries written mid-flush (ts > mark) are
  // picked up next time instead of skipped.
  const mark = Date.now();
  await pushWatchlist(sb, userId);
  await pushProgress(sb, userId, sinceTs);
  lastProgressPush = mark;
  setSyncState({ lastProgressPush: mark, lastSyncAt: mark });
  notifySyncUI();
}

async function mergeFromServer() {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  const userId = currentUser.id;
  const { data: rows, error } = await sb.from('watch_states').select('*').eq('user_id', userId);
  if (error) throw error;
  const list = Array.isArray(rows) ? rows : [];
  const tombs = storage.getTombstones();
  const tsOf = (iso) => {
    const t = new Date(iso || 0).getTime();
    return Number.isFinite(t) ? t : 0;
  };

  // Watchlist: union by id. Tombstones beat older server rows; server
  // beats local only when the local copy predates it (legacy items with
  // no updatedAt always yield to the server copy).
  const byId = new Map(storage.getWatchlist().map((i) => [String(i.id), i]));
  for (const r of list.filter((x) => x.status === 'watchlist')) {
    const sid = String(r.tmdb_id);
    const serverTs = tsOf(r.updated_at);
    const tomb = tombs.wl[sid] || 0;
    if (tomb > serverTs) {
      byId.delete(sid);
      continue;
    }
    const local = byId.get(sid);
    if (!local || (local.updatedAt || 0) < serverTs) {
      // Server wins the shared fields, but the local copy keeps its
      // richness (genre_ids, overview, dates) — the server stores the
      // minimal row, the device keeps the full TMDB object.
      byId.set(sid, {
        ...(local || {}),
        id: r.tmdb_id,
        media_type: r.media_type,
        type: r.media_type,
        title: r.title || local?.title || '',
        name: r.title || local?.name || '',
        poster_path: r.poster || local?.poster_path || '',
        poster: r.poster || local?.poster || '',
        updatedAt: serverTs,
      });
    }
  }
  storage.replaceWatchlist([...byId.values()]);

  // Progress: newer updated_at wins per key. Server wins preserve the
  // device's per-server/per-episode refinements (slots stay local).
  let localNewer = false;
  for (const r of list.filter((x) => x.status === 'history' || x.status === 'watched')) {
    const key = `${r.media_type}_${r.tmdb_id}`;
    const serverTs = tsOf(r.updated_at);
    const tomb = tombs.prog[key] || 0;
    if (tomb > serverTs) continue;
    const local = storage.getProgress(r.media_type, r.tmdb_id);
    if (!local || (local.updatedAt || 0) < serverTs) {
      const pct = r.status === 'watched' ? 100 : r.duration > 0 ? Math.min(100, Math.floor((r.position / r.duration) * 100)) : 0;
      storage.applyServerProgress({
        mediaId: r.tmdb_id,
        type: r.media_type,
        season: r.season || 1,
        episode: r.episode || 1,
        currentTime: r.position || 0,
        duration: r.duration || 0,
        percent: pct,
        title: r.title || '',
        poster: r.poster || '',
        updatedAt: serverTs,
      });
    } else if ((local.updatedAt || 0) > serverTs) {
      localNewer = true;
    }
  }
  if (localNewer) scheduleFlush(1500);
  setSyncState({ lastSyncAt: Date.now() });
  notifySyncUI();
}

// Manual "Sync now": pull, converge, push.
export async function syncNow() {
  if (!currentUser) throw new Error('Sign in first.');
  await mergeFromServer();
  stopFlush();
  await flush();
}
