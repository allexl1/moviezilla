const STORAGE_KEYS = {
  PROGRESS: 'moviezilla_playback_progress',
  WATCHLIST: 'moviezilla_watchlist',
  ACTIVE_SERVER: 'moviezilla_preferred_server',
  SEARCH_HISTORY: 'moviezilla_search_history',
  HIDDEN_LETTERBOXD: 'moviezilla_hidden_letterboxd',
  SEASON_COUNTS: 'moviezilla_season_counts',
};

// Single source of truth for every progress gate in the app (was: magic
// 2/95/30 scattered across storage + WatchlistView).
export const WATCHED_PCT = 95;
export const MIN_CONTINUE_PCT = 2;
export const MIN_CONTINUE_SEC = 30;
export const MAX_EPISODES_KEPT = 10;
// Series with real watch history behind them (finished episodes, or
// several deeply-watched ones) surface in Continue Watching after just a
// few seconds: opening S3E8 of a show you already watched for 2 seasons
// is never an accident. Fresh/unknown titles keep the 30s anti-clutter
// gate so stray taps don't spam the rail.
export const ESTABLISHED_EPISODES = 2;
export const ESTABLISHED_EP_SEC = 300;
export const ESTABLISHED_CONTINUE_SEC = 5;

export function tvEstablished(entry) {
  if (!entry || entry.type !== 'tv') return false;
  let deep = 0;
  for (const e of Object.values(entry.episodes || {})) {
    if ((e?.percent || 0) >= WATCHED_PCT) return true;
    if ((e?.currentTime || 0) >= ESTABLISHED_EP_SEC) deep += 1;
  }
  return deep >= ESTABLISHED_EPISODES;
}

function safeGet(key, fallback = {}) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Failed to write to localStorage key "${key}":`, err);
  }
}

function notifyWatchlist() {
  try {
    window.dispatchEvent(new CustomEvent('mz:watchlist'));
  } catch {
    // Non-browser environment: subscribers simply never fire.
  }
}

// --- Account sync hooks ------------------------------------------------------
// Local concerns live here; the engine in account.js subscribes to the
// window event — storage never imports it (no cycle). Tombstones let
// offline deletes win over older server rows on the next merge.
const SYNC_KEYS = {
  TOMBS: 'moviezilla_sync_tombstones',
  CLEAR_PROGRESS: 'moviezilla_sync_clear_progress',
};

function dispatchAccountDirty(kind, extra = {}) {
  try {
    window.dispatchEvent(new CustomEvent('mz:account-dirty', { detail: { kind, ...extra } }));
  } catch {
    // Non-browser: the engine simply never fires.
  }
}

export function getTombstones() {
  const t = safeGet(SYNC_KEYS.TOMBS, {});
  return { wl: t.wl || {}, prog: t.prog || {} };
}

function setTombstones(t) {
  safeSet(SYNC_KEYS.TOMBS, t);
}

export function addTombstone(scope, id) {
  if (id == null || id === '') return;
  const t = getTombstones();
  const bucket = { ...(t[scope] || {}) };
  bucket[String(id)] = Date.now();
  const keys = Object.keys(bucket)
    .sort((a, b) => bucket[b] - bucket[a])
    .slice(0, 200);
  const next = {};
  for (const k of keys) next[k] = bucket[k];
  setTombstones({ ...t, [scope]: next });
}

export function clearTombstones(scope, ids) {
  const t = getTombstones();
  const bucket = { ...(t[scope] || {}) };
  for (const id of ids || []) delete bucket[String(id)];
  setTombstones({ ...t, [scope]: bucket });
}

export function setProgressClearFlag() {
  safeSet(SYNC_KEYS.CLEAR_PROGRESS, { at: Date.now() });
}

export function getProgressClearFlag() {
  try {
    return Boolean(JSON.parse(localStorage.getItem(SYNC_KEYS.CLEAR_PROGRESS) || 'null'));
  } catch {
    return false;
  }
}

export function clearProgressClearFlag() {
  try {
    localStorage.removeItem(SYNC_KEYS.CLEAR_PROGRESS);
  } catch {
    // ignore
  }
}

// Seconds → "4:05" / "1:02:03" for position display when no duration (and
// hence no percent) is known.
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

// Full calendar date for history rows ("September 19, 2026"): group
// headers stay weekly/monthly, but every row carries its own exact day.
// en-US pinned on purpose: the format is the spec, not the locale.
export function formatFullDate(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// One honest progress string for every history entry shape.
export function progressLabel(h) {
  if (!h) return '';
  if (h.percent >= WATCHED_PCT) return 'Watched';
  if (h.duration > 0 && h.percent > 0) return `${h.percent}%`;
  if (h.currentTime > 0) return formatClock(h.currentTime);
  return 'Opened';
}

export const storage = {
  // Save position: e.g. tmdbId, type ('movie'|'tv'), season, episode,
  // currentTime, duration, server. Positions are tracked PER SERVER —
  // Vidy and VidLink keep their own clocks (different cuts/offsets), so
  // one shared timestamp corrupts both. Top-level fields stay "latest
  // wins" for display; resume always prefers the current server's slot.
  // Never let a 0s write clobber a real timestamp (mount/unmount races).
  saveProgress({ mediaId, type, season = 1, episode = 1, currentTime = 0, duration = 0, title = '', poster = '', genres = [], server = '' }) {
    if (!mediaId) return;
    const allProgress = safeGet(STORAGE_KEYS.PROGRESS, {});
    const key = `${type}_${mediaId}`;
    const prev = allProgress[key];

    if ((currentTime || 0) <= 0 && (prev?.currentTime || 0) > 0) {
      // Refresh recency but keep the real position + episode.
      prev.updatedAt = Date.now();
      if (title && !prev.title) prev.title = title;
      if (poster && !prev.poster) prev.poster = poster;
      safeSet(STORAGE_KEYS.PROGRESS, allProgress);
      dispatchAccountDirty('progress');
      return;
    }

    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
    const stamp = {
      currentTime: Math.floor(currentTime),
      duration: Math.floor(duration),
      percent: Math.min(100, Math.floor(progressPercent)),
      updatedAt: Date.now(),
    };

    // Per-server slot (top-level mirrors the latest write for display).
    let servers = prev?.servers;
    if (server) {
      servers = { ...(prev?.servers || {}) };
      servers[server] = { ...stamp };
    }

    // Per-episode memory inside the series entry: bouncing between
    // episodes (or rooms on different episodes) no longer resets the
    // others to zero. Top-level season/episode/time stay "latest wins".
    let episodes = prev?.episodes;
    if (type === 'tv') {
      episodes = { ...(prev?.episodes || {}) };
      const epPrev = episodes[`${season}x${episode}`] || {};
      let epServers = epPrev.servers;
      if (server) {
        epServers = { ...(epPrev.servers || {}) };
        epServers[server] = { ...stamp };
      }
      episodes[`${season}x${episode}`] = { ...stamp, servers: epServers };
      const keys = Object.keys(episodes).sort(
        (a, b) => (episodes[a].updatedAt || 0) - (episodes[b].updatedAt || 0)
      );
      while (keys.length > MAX_EPISODES_KEPT) delete episodes[keys.shift()];
    }

    allProgress[key] = {
      mediaId,
      type,
      season,
      episode,
      currentTime: Math.floor(currentTime),
      duration: Math.floor(duration),
      percent: Math.min(100, Math.floor(progressPercent)),
      title,
      poster,
      genres,
      episodes,
      servers,
      updatedAt: Date.now(),
    };

    safeSet(STORAGE_KEYS.PROGRESS, allProgress);
    dispatchAccountDirty('progress');
  },

  // Explicit episode switch: the new episode takes over the top-level
  // immediately (S1E1/100% must not shadow a started S1E2, and a quick
  // peek must not vanish). Position 0 with fresh clocks — per-episode
  // memory and the old episode's slots survive untouched underneath.
  switchEpisode({ mediaId, type, season = 1, episode = 1, title = '', poster = '', genres = [] }) {
    if (!mediaId) return;
    const allProgress = safeGet(STORAGE_KEYS.PROGRESS, {});
    const key = `${type}_${mediaId}`;
    const prev = allProgress[key] || {};
    allProgress[key] = {
      mediaId,
      type,
      season,
      episode,
      currentTime: 0,
      duration: 0,
      percent: 0,
      title: title || prev.title || '',
      poster: poster || prev.poster || '',
      genres: genres?.length ? genres : prev.genres || [],
      episodes: prev.episodes,
      servers: undefined,
      updatedAt: Date.now(),
    };
    safeSet(STORAGE_KEYS.PROGRESS, allProgress);
    dispatchAccountDirty('progress');
  },

  // Raw entries for the sync engine (merge/push work on whole entries).
  getProgressEntries() {
    return Object.values(safeGet(STORAGE_KEYS.PROGRESS, {}));
  },

  // Season catalog cache (history rewrite): per-show episode counts so
  // series completion is checkable. { [mediaId]: { seasons: {n: total},
  // totalSeasons, at } }. Fresh loads overwrite (a new season airing
  // heals a stale "complete" read back to incomplete). Specials
  // (season 0) are never stored — they never gate completion.
  // Filled opportunistically wherever season details load (episode
  // drawer, player); nothing here fetches.
  recordSeasonCounts(mediaId, seasons, totalSeasons) {
    if (!mediaId) return;
    const clean = {};
    for (const [k, v] of Object.entries(seasons || {})) {
      const n = Number(k);
      const total = Number(v);
      if (n >= 1 && total > 0) clean[n] = Math.floor(total);
    }
    if (Object.keys(clean).length === 0) return;
    const all = safeGet(STORAGE_KEYS.SEASON_COUNTS, {});
    all[String(mediaId)] = {
      seasons: clean,
      totalSeasons: Math.max(0, Math.floor(Number(totalSeasons) || 0)),
      at: Date.now(),
    };
    safeSet(STORAGE_KEYS.SEASON_COUNTS, all);
  },

  getSeasonCounts(mediaId) {
    if (!mediaId) return null;
    return safeGet(STORAGE_KEYS.SEASON_COUNTS, {})[String(mediaId)] || null;
  },

  // Merge one season's episode count into the catalog cache (season
  // details load one season at a time in the drawers, so a full
  // overwrite there would wipe the seasons already known). Specials
  // (season 0) never stored — they never gate completion. totalSeasons
  // only ever grows: a stale small read must not shrink a known catalog.
  noteSeasonCount(mediaId, season, count, totalSeasons) {
    if (!mediaId) return;
    const n = Math.floor(Number(season) || 0);
    const total = Math.floor(Number(count) || 0);
    if (n < 1 || total <= 0) return;
    const all = safeGet(STORAGE_KEYS.SEASON_COUNTS, {});
    const prev = all[String(mediaId)] || { seasons: {}, totalSeasons: 0 };
    all[String(mediaId)] = {
      seasons: { ...(prev.seasons || {}), [n]: total },
      totalSeasons: Math.max(
        Math.floor(Number(totalSeasons) || 0),
        Math.floor(Number(prev.totalSeasons) || 0)
      ),
      at: Date.now(),
    };
    safeSet(STORAGE_KEYS.SEASON_COUNTS, all);
  },

  // Next-episode arithmetic over the catalog cache (manual Next button):
  // known season → next in season, or S+1 E1 across a boundary, or null
  // on the known finale (the button hides there). Unknown catalog never
  // claims a finale — optimistic E+1 until a season load fills the cache.
  nextEpisode({ mediaId, season = 1, episode = 1, totalSeasons = 0 } = {}) {
    const s = Math.floor(Number(season) || 1);
    const e = Math.floor(Number(episode) || 1);
    const catalog = mediaId ? safeGet(STORAGE_KEYS.SEASON_COUNTS, {})[String(mediaId)] : null;
    const known = Math.floor(Number(catalog?.seasons?.[s]) || 0);
    if (known > 0 && e < known) return { season: s, episode: e + 1 };
    if (known > 0 && e >= known) {
      const total = Math.max(
        Math.floor(Number(catalog?.totalSeasons) || 0),
        Math.floor(Number(totalSeasons) || 0)
      );
      if (total >= 1 && s >= total) return null;
      return { season: s + 1, episode: 1 };
    }
    return { season: s, episode: e + 1 };
  },

  // Episode watched truth, any server: episodes finished inside the
  // player carry per-server clocks, so a server-less top-level read
  // alone misses them. Any stamp past the watched percent counts.
  isEpisodeWatched(type, mediaId, season, episode) {
    if (!mediaId) return false;
    const ep = safeGet(STORAGE_KEYS.PROGRESS, {})[`${type}_${mediaId}`]?.episodes?.[`${season}x${episode}`];
    if (!ep) return false;
    const pctOf = (x) => {
      if (!x) return 0;
      if (x.percent != null) return x.percent;
      if ((x.duration || 0) > 0) return (x.currentTime / x.duration) * 100;
      return 0;
    };
    if (pctOf(ep) >= WATCHED_PCT) return true;
    return Object.values(ep.servers || {}).some((sl) => pctOf(sl) >= WATCHED_PCT);
  },

  // Whole-entry watched truth for list filters (Watched tab, History
  // lane): movies are one unit, series read the derived truth — a manual
  // series mark belongs in Watched even when its top-level percent is low.
  isEntryWatched(h) {
    if (!h) return false;
    if (h.type !== 'tv') return (h.percent || 0) >= WATCHED_PCT;
    return storage.isSeriesWatched(h, storage.getSeasonCounts(h.mediaId));
  },

  // Manual series mark (history rewrite): the user saying "I finished
  // this" (or taking it back) beats every inference. Unmarking is a
  // deliberate user action, not a backwards move — allowed, timestamped
  // so sync latest-wins stays sane.
  setSeriesWatched({ mediaId, type, watched, title = '', poster = '' }) {
    if (!mediaId) return;
    const all = safeGet(STORAGE_KEYS.PROGRESS, {});
    const key = `${type}_${mediaId}`;
    const prev = all[key] || { mediaId, type, season: 1, episode: 1 };
    all[key] = {
      ...prev,
      mediaId,
      type,
      title: title || prev.title || '',
      poster: poster || prev.poster || '',
      manualWatched: Boolean(watched),
      manualWatchedAt: Date.now(),
      updatedAt: Date.now(),
    };
    safeSet(STORAGE_KEYS.PROGRESS, all);
    dispatchAccountDirty('progress');
  },

  // Series truth (history rewrite): a series is watched ONLY when every
  // episode is watched or the user marked it themselves. A single 100%
  // stamp — ended event, manual eye, or a poisoned wall write — must
  // never promote the whole series (that exact bug hid shows from
  // Continue Watching). Movies are one unit: percent>=95, unchanged.
  // Unknown catalog (no counts) means manual-only: under-mark, never
  // over-mark.
  isSeriesWatched(entry, catalog) {
    if (!entry) return false;
    if (entry.manualWatched) return true;
    if (entry.type !== 'tv') return (entry.percent || 0) >= WATCHED_PCT;
    // Episode percent lives on the stamp for new rows; older rows only
    // carry currentTime/duration, so derive it when absent.
    const pctOf = (x) => {
      if (!x) return 0;
      if (x.percent != null) return x.percent;
      if ((x.duration || 0) > 0) return (x.currentTime / x.duration) * 100;
      return 0;
    };
    const total = Math.floor(Number(catalog?.totalSeasons) || 0);
    const seasons = catalog?.seasons || null;
    if (!(total >= 1) || !seasons) return false;
    const eps = entry.episodes || {};
    for (let s = 1; s <= total; s++) {
      const count = Math.floor(Number(seasons[s]) || 0);
      if (count <= 0) return false;
      for (let e = 1; e <= count; e++) {
        if (pctOf(eps[`${s}x${e}`]) < WATCHED_PCT) return false;
      }
    }
    return true;
  },

  // Single resume resolver (history rewrite, folds old A1): every
  // announcer and the player open ask here, never raw slots. Ranking:
  // finished series restarts at 0; finished episodes restart at 0;
  // current-server slot for the open episode; best other-server slot
  // (owner-ordered auto-jump, nothing deleted); legacy untracked
  // stamps; legacy top-level; else 0. Points past a known duration
  // are poison (paused-embed inflation) and dropped; the player clamp
  // still applies on open as a second net. TV reads episode-keyed
  // truth only — title-level slots never stand in for another
  // episode (that cross-contamination restarted players mid-show).
  // Ancient rows with no episodes map fall back to top-level, like
  // the old strict read did.
  resolveResume({ type, mediaId, server = '', season: seasonSel = null, episode: episodeSel = null } = {}) {
    const none = (season, episode) => ({ second: 0, season, episode, duration: 0, seriesWatched: false, source: 'zero' });
    if (!mediaId) return none(1, 1);
    const entry = safeGet(STORAGE_KEYS.PROGRESS, {})[`${type}_${mediaId}`];
    if (!entry) return none(1, 1);
    // Explicit episode overrides the top-level (episode switching asks
    // where THAT episode stopped, not where the title points).
    const topSeason = Number(entry.season) || 1;
    const topEpisode = Number(entry.episode) || 1;
    const season = seasonSel == null ? topSeason : Number(seasonSel) || 1;
    const episode = episodeSel == null ? topEpisode : Number(episodeSel) || 1;
    const topDur = Math.max(0, Math.floor(Number(entry.duration) || 0));
    const catalog = safeGet(STORAGE_KEYS.SEASON_COUNTS, {})[String(mediaId)] || null;
    if (storage.isSeriesWatched(entry, catalog)) {
      return { second: 0, season, episode, duration: topDur, seriesWatched: true, source: 'finished' };
    }
    const sane = (t, d) => {
      const tt = Math.floor(Number(t) || 0);
      if (tt <= 0) return 0;
      const dd = Math.floor(Number(d) || 0);
      if (dd > 60 && tt > dd) return 0;
      return tt;
    };
    const bestOf = (slots) => {
      let best = 0;
      let bestDur = 0;
      for (const s of Object.values(slots || {})) {
        const c = sane(s?.currentTime, s?.duration);
        if (c > best) {
          best = c;
          bestDur = Math.max(0, Math.floor(Number(s?.duration) || 0));
        }
      }
      return { best, bestDur };
    };
    const episodes = entry.episodes || null;
    if (entry.type === 'tv' && episodes) {
      const ep = episodes[`${season}x${episode}`] || null;
      const epPct =
        ep == null
          ? 0
          : ep.percent != null
            ? ep.percent
            : ep.duration > 0
              ? (ep.currentTime / ep.duration) * 100
              : 0;
      if (epPct >= WATCHED_PCT) {
        return { second: 0, season, episode, duration: topDur, seriesWatched: false, source: 'episode-done' };
      }
      const tracked = ep && ep.servers && Object.keys(ep.servers).length > 0;
      if (tracked) {
        const mine = server ? ep.servers[server] : null;
        const t = mine ? sane(mine.currentTime, mine.duration) : 0;
        if (t > 0) {
          return { second: t, season, episode, duration: Math.max(0, Math.floor(Number(mine.duration) || 0)), seriesWatched: false, source: 'slot' };
        }
        const jump = bestOf(ep.servers);
        if (jump.best > 0) {
          return { second: jump.best, season, episode, duration: jump.bestDur, seriesWatched: false, source: 'jump' };
        }
        return { second: 0, season, episode, duration: topDur, seriesWatched: false, source: 'zero' };
      }
      if (ep) {
        const t = sane(ep.currentTime, ep.duration);
        if (t > 0) {
          return { second: t, season, episode, duration: Math.max(0, Math.floor(Number(ep.duration) || 0)), seriesWatched: false, source: 'episode' };
        }
        return { second: 0, season, episode, duration: topDur, seriesWatched: false, source: 'zero' };
      }
      return { second: 0, season, episode, duration: topDur, seriesWatched: false, source: 'zero' };
    }
    const entryTracked = entry.servers && Object.keys(entry.servers).length > 0;
    if (entryTracked) {
      const mine = server ? entry.servers[server] : null;
      const t = mine ? sane(mine.currentTime, mine.duration) : 0;
      if (t > 0) {
        return { second: t, season, episode, duration: Math.max(0, Math.floor(Number(mine.duration) || 0)), seriesWatched: false, source: 'slot' };
      }
      const jump = bestOf(entry.servers);
      if (jump.best > 0) {
        return { second: jump.best, season, episode, duration: jump.bestDur, seriesWatched: false, source: 'jump' };
      }
      return { second: 0, season, episode, duration: topDur, seriesWatched: false, source: 'zero' };
    }
    if ((entry.percent || 0) >= WATCHED_PCT) {
      return { second: 0, season, episode, duration: topDur, seriesWatched: false, source: 'episode-done' };
    }
    const t = sane(entry.currentTime, entry.duration);
    if (t > 0) {
      return { second: t, season, episode, duration: topDur, seriesWatched: false, source: 'top' };
    }
    return { second: 0, season, episode, duration: topDur, seriesWatched: false, source: 'zero' };
  },

  // Server-newer row lands here: top-level clock adopts the server while
  // the device's per-server/per-episode refinements survive (slots are
  // device-specific — Vidy seconds mean nothing on a phone that only
  // ever used VidLink).
  applyServerProgress({ mediaId, type, season, episode, currentTime, duration, percent, title, poster, updatedAt }) {
    if (mediaId == null) return;
    const allProgress = safeGet(STORAGE_KEYS.PROGRESS, {});
    const key = `${type}_${mediaId}`;
    const prev = allProgress[key] || {};
    allProgress[key] = {
      ...prev,
      mediaId,
      type,
      season: season || 1,
      episode: episode || 1,
      currentTime: Math.floor(currentTime || 0),
      duration: Math.floor(duration || 0),
      percent: Math.min(100, Math.floor(percent || 0)),
      title: title || prev.title || '',
      poster: poster || prev.poster || '',
      genres: prev.genres || [],
      episodes: prev.episodes,
      servers: prev.servers,
      updatedAt: updatedAt || Date.now(),
    };
    safeSet(STORAGE_KEYS.PROGRESS, allProgress);
  },

  // This server's slot — STRICT. Once an entry tracks per-server clocks,
  // a missing slot means "never watched here": start at 0, never borrow
  // another provider's seconds (that cross-contamination restarted
  // players at 0:00 and looped reloads on shorter cuts). Entries written
  // before slots existed (no servers map) still fall back to top-level.
  getServerProgress(type, mediaId, server) {
    if (!mediaId) return null;
    const allProgress = safeGet(STORAGE_KEYS.PROGRESS, {});
    const entry = allProgress[`${type}_${mediaId}`];
    if (!entry) return null;
    const tracked = entry.servers && Object.keys(entry.servers).length > 0;
    if (tracked) return (server && entry.servers[server]) || null;
    return { currentTime: entry.currentTime, duration: entry.duration, updatedAt: entry.updatedAt };
  },

  // Saved position of one specific episode (for episode switching),
  // same strict per-server rule as above.
  getEpisodeProgress(type, mediaId, season, episode, server = '') {
    if (!mediaId) return null;
    const allProgress = safeGet(STORAGE_KEYS.PROGRESS, {});
    const ep = allProgress[`${type}_${mediaId}`]?.episodes?.[`${season}x${episode}`];
    if (!ep) return null;
    const tracked = ep.servers && Object.keys(ep.servers).length > 0;
    if (tracked) return (server && ep.servers[server]) || null;
    return ep;
  },

  // Retrieve position to resume
  getProgress(type, mediaId) {
    if (!mediaId) return null;
    const allProgress = safeGet(STORAGE_KEYS.PROGRESS, {});
    return allProgress[`${type}_${mediaId}`] || null;
  },

  // Get all partially watched items sorted by most recent. Anything with
  // 30s+ on the clock counts — percent-gating alone hid short watches of
  // long titles once providers started reporting real durations. Series
  // with established history (2 finished/deep seasons behind them) count
  // from 5s: the next episode of your show always belongs on the rail.
  // Watched-exclusion reads DERIVED series truth (history rewrite), not
  // raw top-level percent — a single poisoned 100% stamp must never hide
  // a half-watched series again.
  getAllContinueWatching() {
    const allProgress = safeGet(STORAGE_KEYS.PROGRESS, {});
    const counts = safeGet(STORAGE_KEYS.SEASON_COUNTS, {});
    return Object.values(allProgress)
      .filter((item) => {
        if (storage.isSeriesWatched(item, counts[String(item.mediaId)] || null)) return false;
        if (item.percent > MIN_CONTINUE_PCT) return true;
        const gate = item.type === 'tv' && tvEstablished(item) ? ESTABLISHED_CONTINUE_SEC : MIN_CONTINUE_SEC;
        return (item.currentTime || 0) >= gate;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  // Full watch history (everything with a timestamp), newest first,
  // deduplicated per title (latest sighting wins).
  getWatchHistory() {
    const allProgress = safeGet(STORAGE_KEYS.PROGRESS, {});
    const seen = new Set();
    return Object.values(allProgress)
      .filter((item) => item.updatedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((item) => {
        const key = `${item.type}_${item.mediaId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  },

  // Clear all playback progress / continue-watching history
  clearPlaybackHistory() {
    try {
      localStorage.removeItem(STORAGE_KEYS.PROGRESS);
    } catch (err) {
      console.error('Failed to clear playback history:', err);
    }
    setProgressClearFlag();
    dispatchAccountDirty('progress');
  },

  // Preferred Server memory. Only offered ids survive — a stale stored
  // id from a retired lineup falls back instead of mismatching the UI.
  getPreferredServer(defaultServer = 'vidy') {
    try {
      const v = localStorage.getItem(STORAGE_KEYS.ACTIVE_SERVER) || defaultServer;
      return ['vidy', 'vidlink', 'vaplayer'].includes(v) ? v : defaultServer;
    } catch {
      return defaultServer;
    }
  },

  setPreferredServer(serverName) {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SERVER, serverName);
    } catch (err) {
      console.error('Failed to set preferred server:', err);
    }
  },

  // Watchlist
  getWatchlist() {
    return safeGet(STORAGE_KEYS.WATCHLIST, []);
  },

  // Subscribe to watchlist changes (same-tab; localStorage events don't
  // fire in the writing tab). Returns an unsubscribe function.
  subscribeWatchlist(fn) {
    try {
      window.addEventListener('mz:watchlist', fn);
      return () => window.removeEventListener('mz:watchlist', fn);
    } catch {
      return () => {};
    }
  },

  toggleWatchlist(item) {
    const list = safeGet(STORAGE_KEYS.WATCHLIST, []);
    const idx = list.findIndex((x) => x.id === item.id);
    let updated;
    if (idx >= 0) {
      updated = list.filter((x) => x.id !== item.id);
      addTombstone('wl', item.id);
    } else {
      updated = [{ ...item, updatedAt: Date.now() }, ...list];
    }
    safeSet(STORAGE_KEYS.WATCHLIST, updated);
    notifyWatchlist();
    dispatchAccountDirty('watchlist');
    return idx === -1; // returns true if added, false if removed
  },

  isInWatchlist(id) {
    const list = safeGet(STORAGE_KEYS.WATCHLIST, []);
    return list.some((x) => x.id === id);
  },

  // Recent searches (newest first, max 8, deduplicated)
  getSearchHistory() {
    const list = safeGet(STORAGE_KEYS.SEARCH_HISTORY, []);
    return Array.isArray(list) ? list : [];
  },

  addSearchHistory(term) {
    const clean = String(term || '').trim();
    if (!clean) return;
    const list = storage
      .getSearchHistory()
      .filter((t) => t.toLowerCase() !== clean.toLowerCase());
    safeSet(STORAGE_KEYS.SEARCH_HISTORY, [clean, ...list].slice(0, 8));
  },

  // Letterboxd rows are remote (can't delete from Letterboxd itself) —
  // hiding stores a local blocklist so dismissed titles stay gone.
  getHiddenLetterboxd() {
    const list = safeGet(STORAGE_KEYS.HIDDEN_LETTERBOXD, []);
    return Array.isArray(list) ? list : [];
  },

  hideLetterboxd(id) {
    if (!id) return;
    const hidden = storage.getHiddenLetterboxd();
    if (!hidden.includes(id)) safeSet(STORAGE_KEYS.HIDDEN_LETTERBOXD, [...hidden, id]);
    notifyWatchlist();
  },

  clearSearchHistory() {
    try {
      localStorage.removeItem(STORAGE_KEYS.SEARCH_HISTORY);
    } catch (err) {
      console.error('Failed to clear search history:', err);
    }
  },

  removeSearchHistory(term) {
    const clean = String(term || '').trim().toLowerCase();
    if (!clean) return;
    const list = storage.getSearchHistory().filter((t) => t.toLowerCase() !== clean);
    safeSet(STORAGE_KEYS.SEARCH_HISTORY, list);
  },

  // Remove one title from playback history (all keys for this media).
  removeProgress(type, mediaId) {
    if (!mediaId) return;
    try {
      const all = safeGet(STORAGE_KEYS.PROGRESS, {});
      delete all[`${type}_${mediaId}`];
      safeSet(STORAGE_KEYS.PROGRESS, all);
      addTombstone('prog', `${type}_${mediaId}`);
      dispatchAccountDirty('progress');
    } catch (err) {
      console.error('Failed to remove playback history:', err);
    }
  },

  // Un-mark one episode as watched: drops its per-episode stamp. If the
  // top-level pointed at this episode, it resets to 0 (unwatched) instead
  // of showing a stale 100%.
  unmarkEpisode({ mediaId, type, season = 1, episode = 1 }) {
    if (!mediaId) return;
    try {
      const all = safeGet(STORAGE_KEYS.PROGRESS, {});
      const key = `${type}_${mediaId}`;
      const entry = all[key];
      if (!entry) return;
      const episodes = { ...(entry.episodes || {}) };
      delete episodes[`${season}x${episode}`];
      const topIsThis = Number(entry.season) === Number(season) && Number(entry.episode) === Number(episode);
      all[key] = {
        ...entry,
        episodes,
        ...(topIsThis ? { currentTime: 0, duration: 0, percent: 0 } : null),
        updatedAt: Date.now(),
      };
      safeSet(STORAGE_KEYS.PROGRESS, all);
      dispatchAccountDirty('progress');
    } catch (err) {
      console.error('Failed to unmark episode:', err);
    }
  },

  // Remove one title from the watchlist by TMDB id.
  removeFromWatchlist(id) {
    const list = safeGet(STORAGE_KEYS.WATCHLIST, []).filter((x) => x.id !== id);
    safeSet(STORAGE_KEYS.WATCHLIST, list);
    addTombstone('wl', id);
    notifyWatchlist();
    dispatchAccountDirty('watchlist');
  },

  // Wholesale replace (sync merge). Notifies UI like any other write.
  replaceWatchlist(list) {
    safeSet(STORAGE_KEYS.WATCHLIST, Array.isArray(list) ? list : []);
    notifyWatchlist();
  },

  // Same replace without the UI event: stamping push watermarks must not
  // re-render lists or re-trigger the engine.
  replaceWatchlistSilent(list) {
    safeSet(STORAGE_KEYS.WATCHLIST, Array.isArray(list) ? list : []);
  },
};
