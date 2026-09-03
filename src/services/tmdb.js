const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';

export const IMG_ORIGINAL = 'https://image.tmdb.org/t/p/original';
export const IMG_W500 = 'https://image.tmdb.org/t/p/w500';
export const IMG_W185 = 'https://image.tmdb.org/t/p/w185';

async function fetchFromTmdb(endpoint, params = {}) {
  if (!API_KEY) throw new Error('VITE_TMDB_API_KEY is not defined.');
  const query = new URLSearchParams({ api_key: API_KEY, ...params });
  const res = await fetch(`${TMDB_BASE}${endpoint}?${query}`);
  if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
  return await res.json();
}

export async function getTrending(type = 'movie') {
  const data = await fetchFromTmdb(`/trending/${type}/week`);
  return data.results || [];
}

export async function getTopRated(type = 'movie') {
  const data = await fetchFromTmdb(`/${type}/top_rated`);
  return data.results || [];
}

export async function getAnimeList() {
  // TMDB anime is Animation (genre ID 16) with Japanese original language
  const data = await fetchFromTmdb('/discover/tv', {
    with_genres: '16',
    with_original_language: 'ja',
    sort_by: 'popularity.desc',
  });
  return data.results || [];
}

export async function searchMulti(query) {
  if (!query || query.trim().length < 2) return [];
  const data = await fetchFromTmdb('/search/multi', {
    query: query.trim(),
    include_adult: 'false',
  });
  return (data.results || []).filter(
    (item) => item.media_type === 'movie' || item.media_type === 'tv'
  );
}

export async function getMediaDetails(type, id) {
  return await fetchFromTmdb(`/${type}/${id}`, {
    append_to_response: 'credits,videos,recommendations',
  });
}

export async function getTvSeason(tvId, seasonNumber) {
  return await fetchFromTmdb(`/tv/${tvId}/season/${seasonNumber}`);
}
