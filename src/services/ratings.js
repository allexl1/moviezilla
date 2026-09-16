const cache = new Map();
const CACHE_MAX = 200;
function cacheSet(key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

// IMDb ratings without an API key: TMDB details carry the IMDb ID, and the
// Stremio Cinemeta catalog serves that title's metadata (incl. imdbRating)
// keyless. Rotten Tomatoes has no free/keyless source, so it is
// deliberately not faked — UI shows IMDb + TMDB only.
export async function getImdbRating(mediaType, imdbId) {
  if (!imdbId) return null;
  const key = `${mediaType}:${imdbId}`;
  if (cache.has(key)) return cache.get(key);

  try {
    const kind = mediaType === 'tv' ? 'series' : 'movie';
    const res = await fetch(
      `https://v3-cinemeta.strem.io/meta/${kind}/${encodeURIComponent(imdbId)}.json`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`Cinemeta ${res.status}`);
    const data = await res.json();
    const raw = data?.meta?.imdbRating;
    const rating = raw != null && raw !== '' ? Number(raw) : null;
    const value = Number.isFinite(rating) ? rating : null;
    cacheSet(key, value);
    return value;
  } catch {
    cacheSet(key, null);
    return null;
  }
}

export function imdbIdOf(details, mediaType) {
  if (!details) return null;
  if (mediaType !== 'tv' && details.imdb_id) return details.imdb_id;
  return details.external_ids?.imdb_id || null;
}
