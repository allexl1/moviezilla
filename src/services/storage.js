const STORAGE_KEYS = {
  PROGRESS: 'moviezilla_playback_progress',
  HISTORY: 'moviezilla_watch_history',
  WATCHLIST: 'moviezilla_watchlist',
  ACTIVE_SERVER: 'moviezilla_preferred_server',
};

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

export const storage = {
  // Save position: e.g. tmdbId, type ('movie'|'tv'), season, episode, currentTime, duration
  saveProgress({ mediaId, type, season = 1, episode = 1, currentTime = 0, duration = 0, title = '', poster = '' }) {
    if (!mediaId) return;
    const allProgress = safeGet(STORAGE_KEYS.PROGRESS, {});
    const key = `${type}_${mediaId}`;

    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

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
      updatedAt: Date.now(),
    };

    safeSet(STORAGE_KEYS.PROGRESS, allProgress);
  },

  // Retrieve position to resume
  getProgress(type, mediaId) {
    if (!mediaId) return null;
    const allProgress = safeGet(STORAGE_KEYS.PROGRESS, {});
    return allProgress[`${type}_${mediaId}`] || null;
  },

  // Get all partially watched items sorted by most recent
  getAllContinueWatching() {
    const allProgress = safeGet(STORAGE_KEYS.PROGRESS, {});
    return Object.values(allProgress)
      .filter((item) => item.percent > 2 && item.percent < 95)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  // Preferred Server memory
  getPreferredServer(defaultServer = 'VidLink') {
    try {
      return localStorage.getItem(STORAGE_KEYS.ACTIVE_SERVER) || defaultServer;
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
    return idx === -1; // returns true if added, false if removed
  },

  isInWatchlist(id) {
    const list = safeGet(STORAGE_KEYS.WATCHLIST, []);
    return list.some((x) => x.id === id);
  },
};
