const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

// Single source of truth for fallback imagery (missing TMDB paths / broken
// loads). YouTube trailer thumbnails and Letterboxd posters stay direct
// intentionally — see getImageUrl below.
export const FALLBACK_BACKDROP = 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1200&q=80';
export const FALLBACK_POSTER = 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=500&q=80';
export const FALLBACK_PROFILE = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80';

export const MOVIE_GENRES = [
  { id: '', name: 'All Genres' },
  { id: '28', name: 'Action' },
  { id: '12', name: 'Adventure' },
  { id: '16', name: 'Animation' },
  { id: '35', name: 'Comedy' },
  { id: '80', name: 'Crime' },
  { id: '99', name: 'Documentary' },
  { id: '18', name: 'Drama' },
  { id: '10751', name: 'Family' },
  { id: '14', name: 'Fantasy' },
  { id: '36', name: 'History' },
  { id: '27', name: 'Horror' },
  { id: '10402', name: 'Music' },
  { id: '9648', name: 'Mystery' },
  { id: '10749', name: 'Romance' },
  { id: '878', name: 'Sci-Fi' },
  { id: '53', name: 'Thriller' },
  { id: '10752', name: 'War' },
  { id: '37', name: 'Western' },
];

export const TV_GENRES = [
  { id: '', name: 'All Genres' },
  { id: '10759', name: 'Action & Adventure' },
  { id: '16', name: 'Animation' },
  { id: '35', name: 'Comedy' },
  { id: '80', name: 'Crime' },
  { id: '99', name: 'Documentary' },
  { id: '18', name: 'Drama' },
  { id: '10751', name: 'Family' },
  { id: '10762', name: 'Kids' },
  { id: '9648', name: 'Mystery' },
  { id: '10763', name: 'News' },
  { id: '10764', name: 'Reality' },
  { id: '10765', name: 'Sci-Fi & Fantasy' },
  { id: '10767', name: 'Talk' },
  { id: '10768', name: 'War & Politics' },
  { id: '37', name: 'Western' },
];

export const COUNTRIES = [
  { id: '', name: 'All Countries' },
  { id: 'US', name: 'United States' },
  { id: 'GB', name: 'United Kingdom' },
  { id: 'JP', name: 'Japan' },
  { id: 'KR', name: 'South Korea' },
  { id: 'FR', name: 'France' },
  { id: 'DE', name: 'Germany' },
  { id: 'IN', name: 'India' },
  { id: 'ES', name: 'Spain' },
  { id: 'IT', name: 'Italy' },
  { id: 'CA', name: 'Canada' },
];

export const SORTS = [
  { id: 'popularity.desc', name: 'Popular' },
  { id: 'vote_average.desc', name: 'Top Rated' },
  { id: 'primary_release_date.desc', name: 'Newest' },
];

export const TV_SORTS = [
  { id: 'popularity.desc', name: 'Popular' },
  { id: 'vote_average.desc', name: 'Top Rated' },
  { id: 'first_air_date.desc', name: 'Newest' },
];

async function proxyFetch(endpoint, params = {}) {
  // Short client cache for catalog/search: key includes every param, so
  // different filters/queries can never collide. 2-min staleness on public
  // catalog data is negligible; repeat visits and re-renders skip the network.
  const cacheKey = `catalog:${endpoint}:${JSON.stringify(params)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const query = new URLSearchParams({
    path: endpoint,
    ...params,
  });

  const res = await fetch(`/api/tmdb?${query.toString()}`);

  if (!res.ok) {
    throw new Error(`TMDB request failed: ${res.status}`);
  }

  const data = await res.json();
  const payload = data ?? { results: [] };
  cacheSet(cacheKey, payload, 120 * 1000);
  return payload;
}

// Tiny in-memory TTL cache for immutable detail calls (details, logos,
// seasons). Catalog/search stay uncached — they change with filters/query.
const responseCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function cacheGet(key) {
  const hit = responseCache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > (hit.ttl || CACHE_TTL)) {
    responseCache.delete(key);
    return undefined;
  }
  return hit.data;
}

function cacheSet(key, data, ttl = CACHE_TTL) {
  responseCache.set(key, { data, at: Date.now(), ttl });
}

export const tmdb = {
  // Absolute URLs (Letterboxd posters, YouTube thumbnails) pass through
  // intentionally — only relative TMDB paths use the image proxy.
  getImageUrl(path, size = 'original', fallback = '') {
  if (!path) {
    return fallback || FALLBACK_BACKDROP;
  }

  if (path.startsWith('http')) {
    return path;
  }

  return `/api/tmdb-image?size=${encodeURIComponent(size)}&path=${encodeURIComponent(path)}`;
},

  async getTrending() {
    return proxyFetch('trending/all/week');
  },

  async getMovies({
    page = 1,
    genre = '',
    year = '',
    sort = 'popularity.desc',
    provider = '',
    country = '',
  } = {}) {
    const params = {
      page,
      sort_by: sort,
    };

    if (genre) {
      params.with_genres = genre;
    }

    if (year && year !== 'All Years') {
      if (year === '2020s') {
        params['primary_release_date.gte'] = '2020-01-01';
        params['primary_release_date.lte'] = '2029-12-31';
      } else {
        params.primary_release_year = year;
      }
    }

    if (provider) {
      params.with_watch_providers = provider;
      params.watch_region = 'US';
    }

    if (country) {
      params.with_origin_country = country;
    }

    return proxyFetch('discover/movie', params);
  },

  async getSeries({
    page = 1,
    genre = '',
    year = '',
    sort = 'popularity.desc',
    provider = '',
    country = '',
  } = {}) {
    const params = {
      page,
      sort_by: sort,
    };

    if (genre) {
      params.with_genres = genre;
    }

    if (year && year !== 'All Years') {
      if (year === '2020s') {
        params['first_air_date.gte'] = '2020-01-01';
        params['first_air_date.lte'] = '2029-12-31';
      } else {
        params.first_air_date_year = year;
      }
    }

    if (provider) {
      params.with_watch_providers = provider;
      params.watch_region = 'US';
    }

    if (country) {
      params.with_origin_country = country;
    }

    return proxyFetch('discover/tv', params);
  },

  async getAnime({ page = 1, sort = 'popularity.desc' } = {}) {
    return proxyFetch('discover/tv', {
      page,
      sort_by: sort,
      with_genres: '16',
      with_original_language: 'ja',
    });
  },

  async getPopularMovies({ page = 1 } = {}) {
    return proxyFetch('discover/movie', {
      page,
      sort_by: 'popularity.desc',
      'vote_count.gte': 100,
    });
  },

  async getPopularTV({ page = 1 } = {}) {
    return proxyFetch('discover/tv', {
      page,
      sort_by: 'popularity.desc',
      'vote_count.gte': 100,
    });
  },

  async getTopRatedMovies({ page = 1 } = {}) {
    return proxyFetch('discover/movie', {
      page,
      sort_by: 'vote_average.desc',
      'vote_count.gte': 500,
    });
  },

  async getMediaDetails(mediaType, id) {
    const cacheKey = `details:${mediaType}:${id}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const query = new URLSearchParams({
      path: `${mediaType}/${id}`,
      append_to_response: 'videos,credits,similar,release_dates,content_ratings',
    });

    const res = await fetch(`/api/tmdb?${query.toString()}`);

    if (!res.ok) {
      throw new Error(`TMDB details failed: ${res.status}`);
    }

    const data = await res.json();
    cacheSet(cacheKey, data);
    return data;
  },

  // Title logo (cinejoy-style hero treatment), English preferred.
  async getLogos(mediaType, id) {
    const cacheKey = `logos:${mediaType}:${id}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const query = new URLSearchParams({ path: `${mediaType}/${id}/images` });
      const res = await fetch(`/api/tmdb?${query.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const logos = data?.logos || [];
      const logo =
        logos.find((l) => l.iso_639_1 === 'en') || logos[0] || null;
      cacheSet(cacheKey, logo);
      return logo;
    } catch {
      return null;
    }
  },
  async getSeasonDetails(tvId, seasonNumber) {
    const cacheKey = `season:${tvId}:${seasonNumber}`;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const query = new URLSearchParams({
      path: `tv/${tvId}/season/${seasonNumber}`,
    });

    const res = await fetch(`/api/tmdb?${query.toString()}`);

    if (!res.ok) {
      throw new Error(`TMDB season failed: ${res.status}`);
    }

    const data = await res.json();
    cacheSet(cacheKey, data);
    return data;
  },

  async searchMulti(queryText) {
    return proxyFetch('search/multi', {
      query: queryText,
    });
  },

  // Resolve a Letterboxd-style title/year to a real TMDB item (lazy, on
  // selection — not at list-fetch time). Scores candidates on normalized
  // title (diacritics/punctuation/articles stripped, original_title
  // accepted) plus release-year agreement; requires an exact title match
  // so similar titles can't win. Returns the TMDB item or null; throws on
  // network failure. Never fabricates an ID.
  async resolveTitle(title, year = '') {
    const norm = (s) =>
      String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/^the\s+/, '')
        .replace(/[^a-z0-9 ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const cleanYear = String(year || '').slice(0, 4);
    const wantYear = /^\d{4}$/.test(cleanYear) ? cleanYear : '';
    const target = norm(title);
    if (!target) return null;

    const score = (c) => {
      const t = norm(c.title || c.name);
      const o = norm(c.original_title || c.original_name);
      let s = 0;
      if (t === target) s += 5;
      else if (o === target) s += 4;
      else if (t.startsWith(target) || target.startsWith(t)) s += 1;
      else return -1;
      const y = String(c.release_date || c.first_air_date || '').slice(0, 4);
      if (wantYear) s += y === wantYear ? 3 : -2;
      return s;
    };

    const pick = (results) => {
      let best = null;
      let bestScore = 4;
      for (const c of results || []) {
        if (c.media_type !== undefined && c.media_type !== 'movie' && c.media_type !== 'tv') continue;
        if (!c.poster_path) continue;
        const s = score(c);
        const pop = c.popularity || c.vote_count || 0;
        if (s > bestScore || (s === bestScore && best && pop > (best.popularity || best.vote_count || 0))) {
          best = c;
          bestScore = s;
        }
      }
      return best;
    };

    const params = { query: title };
    if (wantYear) params.year = wantYear;

    const movieRes = await proxyFetch('search/movie', params);
    const movieMatch = pick(movieRes?.results);
    if (movieMatch) return { ...movieMatch, media_type: 'movie' };

    const multiRes = await proxyFetch('search/multi', { query: title });
    return pick(multiRes?.results) || null;
  }
};