const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

export const GUARANTEED_TITLES = [
  {
    id: 533535,
    title: "Deadpool & Wolverine",
    name: "Deadpool & Wolverine",
    overview: "A listless Wade Wilson toils away in civilian life.",
    backdrop_path: "/yDHYTfA3R0jFYba16jBB1ef8oIt.jpg",
    poster_path: "/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg",
    media_type: "movie",
    vote_average: 7.8,
    release_date: "2024-07-24"
  },
  {
    id: 1399,
    title: "Game of Thrones",
    name: "Game of Thrones",
    overview: "Seven noble families fight for control of Westeros.",
    backdrop_path: "/2OMB0ynKlyIenMJWI2Dy9IWT4c.jpg",
    poster_path: "/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg",
    media_type: "tv",
    vote_average: 8.4,
    first_air_date: "2011-04-17"
  }
];

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
  try {
    const query = new URLSearchParams({
      path: endpoint,
      ...params,
    });

    const res = await fetch(`/api/tmdb?${query.toString()}`);

    if (!res.ok) {
      throw new Error(`Proxy status ${res.status}`);
    }

    const data = await res.json();

    if (data?.results && data.results.length > 0) {
      return data;
    }

    return { results: GUARANTEED_TITLES };
  } catch {
    return { results: GUARANTEED_TITLES };
  }
}

export const tmdb = {
  getImageUrl(path, size = 'original', fallback = '') {
  if (!path) {
    return fallback || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1200&q=80';
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
      params.primary_release_year = year;
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
      params.first_air_date_year = year;
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

  // Watch-provider catalog (logos) for the provider rail.
  async getProviderCatalog() {
    try {
      const query = new URLSearchParams({
        path: 'watch/providers/movie',
        watch_region: 'US',
      });
      const res = await fetch(`/api/tmdb?${query.toString()}`);
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      return { results: [] };
    }
  },

  async getMediaDetails(mediaType, id) {
    try {
      const query = new URLSearchParams({
        path: `${mediaType}/${id}`,
        append_to_response: 'videos,credits,similar',
      });

      const res = await fetch(`/api/tmdb?${query.toString()}`);

      if (!res.ok) {
        throw new Error();
      }

      return await res.json();
    } catch {
      return (
        GUARANTEED_TITLES.find((m) => m.id === Number(id)) ||
        GUARANTEED_TITLES[0]
      );
    }
  },

  // Title logo (cinejoy-style hero treatment), English preferred.
  async getLogos(mediaType, id) {
    try {
      const query = new URLSearchParams({ path: `${mediaType}/${id}/images` });
      const res = await fetch(`/api/tmdb?${query.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const logos = data?.logos || [];
      return (
        logos.find((l) => l.iso_639_1 === 'en') || logos[0] || null
      );
    } catch {
      return null;
    }
  },
  async getSeasonDetails(tvId, seasonNumber) {
    try {
      const query = new URLSearchParams({
        path: `tv/${tvId}/season/${seasonNumber}`,
      });

      const res = await fetch(`/api/tmdb?${query.toString()}`);

      if (!res.ok) {
        throw new Error();
      }

      return await res.json();
    } catch {
      return {
        episodes: [
          {
            episode_number: 1,
            name: "Episode 1",
            overview: "Season premiere.",
          },
          {
            episode_number: 2,
            name: "Episode 2",
            overview: "The journey continues.",
          },
        ],
      };
    }
  },

  async searchMulti(queryText) {
    return proxyFetch('search/multi', {
      query: queryText,
    });
  }
};