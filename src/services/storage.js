const STORAGE_KEYS = {
  FAVORITES: 'moviezilla_favorites',
  HISTORY: 'moviezilla_history',
  LETTERBOXD: 'moviezilla_letterboxd',
};

// Safe JSON Parse helper
function safeGet(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.error(`[Storage] Failed parsing ${key}:`, err);
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`[Storage] Failed setting ${key}:`, err);
  }
}

// --- Favorites ---
export function getFavorites() {
  return safeGet(STORAGE_KEYS.FAVORITES, []);
}

export function isFavorite(id) {
  const list = getFavorites();
  return list.some((item) => String(item.id) === String(id));
}

export function toggleFavorite(media) {
  if (!media?.id) return [];
  const list = getFavorites();
  const exists = list.some((item) => String(item.id) === String(media.id));

  let updated;
  if (exists) {
    updated = list.filter((item) => String(item.id) !== String(media.id));
  } else {
    updated = [
      {
        id: media.id,
        title: media.title || media.name,
        poster_path: media.poster_path,
        media_type: media.media_type || (media.first_air_date ? 'tv' : 'movie'),
        vote_average: media.vote_average,
        release_date: media.release_date || media.first_air_date,
        savedAt: Date.now(),
      },
      ...list,
    ];
  }
  safeSet(STORAGE_KEYS.FAVORITES, updated);
  return updated;
}

// --- Watch History ---
export function getHistory() {
  return safeGet(STORAGE_KEYS.HISTORY, []);
}

export function recordWatchHistory(media, season = 1, episode = 1) {
  if (!media?.id) return;
  const list = getHistory().filter((item) => String(item.id) !== String(media.id));
  const isTv = media.media_type === 'tv' || Boolean(media.first_air_date);

  const entry = {
    id: media.id,
    title: media.title || media.name,
    poster_path: media.poster_path,
    backdrop_path: media.backdrop_path,
    media_type: isTv ? 'tv' : 'movie',
    season: isTv ? season : null,
    episode: isTv ? episode : null,
    watchedAt: Date.now(),
  };

  safeSet(STORAGE_KEYS.HISTORY, [entry, ...list].slice(0, 25));
}

export function clearHistory() {
  safeSet(STORAGE_KEYS.HISTORY, []);
}

// --- Letterboxd Config ---
export function getLetterboxdConfig() {
  return safeGet(STORAGE_KEYS.LETTERBOXD, { username: '', items: [] });
}

export function setLetterboxdConfig(config) {
  safeSet(STORAGE_KEYS.LETTERBOXD, config);
}

// --- Backup & Restore ---
export function exportUserData() {
  const data = {
    favorites: getFavorites(),
    history: getHistory(),
    letterboxd: getLetterboxdConfig(),
    exportDate: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `moviezilla-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importUserData(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (data.favorites) safeSet(STORAGE_KEYS.FAVORITES, data.favorites);
    if (data.history) safeSet(STORAGE_KEYS.HISTORY, data.history);
    if (data.letterboxd) safeSet(STORAGE_KEYS.LETTERBOXD, data.letterboxd);
    return true;
  } catch (err) {
    console.error('[Storage] Import failed:', err);
    return false;
  }
}
