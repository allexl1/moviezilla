const cache = new Map();

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
      `https://v3-cinemeta.strem.io/meta/${kind}/${encodeURIComponent(imdbId)}.json`
    );
    if (!res.ok) throw new Error(`Cinemeta ${res.status}`);
    const data = await res.json();
    const raw = data?.meta?.imdbRating;
    const rating = raw != null && raw !== '' ? Number(raw) : null;
    const value = Number.isFinite(rating) ? rating : null;
    cache.set(key, value);
    return value;
  } catch {
    cache.set(key, null);
    return null;
  }
}

export function imdbIdOf(details, mediaType) {
  if (!details) return null;
  if (mediaType !== 'tv' && details.imdb_id) return details.imdb_id;
  return details.external_ids?.imdb_id || null;
}
