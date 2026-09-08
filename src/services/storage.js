const STORAGE_KEYS = {
  PROGRESS: 'moviezilla_playback_progress',
  WATCHLIST: 'moviezilla_watchlist',
  ACTIVE_SERVER: 'moviezilla_preferred_server',
  SEARCH_HISTORY: 'moviezilla_search_history',
  HIDDEN_LETTERBOXD: 'moviezilla_hidden_letterboxd',
};

// Single source of truth for every progress gate in the app (was: magic
// 2/95/30 scattered across storage + WatchlistView).
export const WATCHED_PCT = 95;
export const MIN_CONTINUE_PCT = 2;
export const MIN_CONTINUE_SEC = 30;
export const MAX_EPISODES_KEPT = 10;

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
      return;
    }

    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
    const stamp = {
      currentTime: Math.floor(currentTime),
      duration: Math.floor(duration),
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
  // long titles once providers started reporting real durations.
  getAllContinueWatching() {
    const allProgress = safeGet(STORAGE_KEYS.PROGRESS, {});
    return Object.values(allProgress)
      .filter(
        (item) =>
          (item.percent > MIN_CONTINUE_PCT && item.percent < WATCHED_PCT) ||
          (item.percent < WATCHED_PCT && (item.currentTime || 0) >= MIN_CONTINUE_SEC)
      )
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
  },

  // Preferred Server memory. Only offered ids survive — a stale stored
  // id from a retired lineup falls back instead of mismatching the UI.
  getPreferredServer(defaultServer = 'vidy') {
    try {
      const v = localStorage.getItem(STORAGE_KEYS.ACTIVE_SERVER) || defaultServer;
      return ['vidy', 'vidlink', 'russian'].includes(v) ? v : defaultServer;
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
    } else {
      updated = [item, ...list];
    }
    safeSet(STORAGE_KEYS.WATCHLIST, updated);
    notifyWatchlist();
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
    } catch (err) {
      console.error('Failed to remove playback history:', err);
    }
  },

  // Remove one title from the watchlist by TMDB id.
  removeFromWatchlist(id) {
    const list = safeGet(STORAGE_KEYS.WATCHLIST, []).filter((x) => x.id !== id);
    safeSet(STORAGE_KEYS.WATCHLIST, list);
    notifyWatchlist();
  },
};
