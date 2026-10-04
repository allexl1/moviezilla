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

// Top Rated upgrade: TMDB orders the grid instantly (vote-floored, honest
// on its own), then the first visible cards upgrade to exact-ID IMDb
// figures where they resolve. Anything unresolved keeps TMDB — never
// empty, never faked. Cached both layers, so repeat visits cost zero.
export async function upgradeTopRatings(items, mediaType, tmdbGetDetails, limit = 8) {
  const out = {};
  const slice = (items || []).slice(0, limit);
  await Promise.all(
    slice.map(async (m) => {
      try {
        if (!m?.id) return;
        const details = await tmdbGetDetails(mediaType, m.id);
        const imdbId = imdbIdOf(details, mediaType);
        if (!imdbId) return;
        const r = await getImdbRating(mediaType, imdbId);
        if (Number.isFinite(r)) out[m.id] = r;
      } catch {
        // unresolved — TMDB figure stands
      }
    })
  );
  return out;
}
