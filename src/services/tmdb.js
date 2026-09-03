const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || '4f298a53e5522830f82c2b18972e0946';

export const GUARANTEED_TITLES = [
  {
    id: 533535,
    title: "Deadpool & Wolverine",
    name: "Deadpool & Wolverine",
    overview: "A listless Wade Wilson toils away in civilian life with his days as the morally flexible mercenary, Deadpool, behind him.",
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
    overview: "Seven noble families fight for control of the mythical land of Westeros.",
    backdrop_path: "/2OMB0ynKlyIenMJWI2Dy9IWT4c.jpg",
    poster_path: "/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg",
    media_type: "tv",
    vote_average: 8.4,
    first_air_date: "2011-04-17"
  },
  {
    id: 299534,
    title: "Avengers: Endgame",
    name: "Avengers: Endgame",
    overview: "After the devastating events of Infinity War, the universe is in ruins.",
    backdrop_path: "/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg",
    poster_path: "/or06FN3Dka5tukK1e9sl16pB3iy.jpg",
    media_type: "movie",
    vote_average: 8.3,
    release_date: "2019-04-24"
  },
  {
    id: 157336,
    title: "Interstellar",
    name: "Interstellar",
    overview: "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.",
    backdrop_path: "/xJHokMbljvjADYdit5fK5VQsXEG.jpg",
    poster_path: "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
    media_type: "movie",
    vote_average: 8.4,
    release_date: "2014-11-05"
  },
  {
    id: 438631,
    title: "Dune",
    name: "Dune",
    overview: "Paul Atreides must travel to the most dangerous planet in the universe.",
    backdrop_path: "/jYEW5xZkZk2WTrdbMGAPFuBqbDc.jpg",
    poster_path: "/d5NXSklXo0qyIYkgV94XAgMIckC.jpg",
    media_type: "movie",
    vote_average: 8.0,
    release_date: "2021-09-15"
  }
];

async function safeFetch(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (data?.results && data.results.length > 0) return data;
    return { results: GUARANTEED_TITLES };
  } catch {
    return { results: GUARANTEED_TITLES };
  }
}

export const tmdb = {
  getImageUrl(path, size = 'original', fallback = '') {
    if (!path) return fallback || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1200&q=80';
    if (path.startsWith('http')) return path;
    return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
  },

  async getTrending() {
    return safeFetch(`${TMDB_BASE_URL}/trending/all/week?api_key=${TMDB_API_KEY}`);
  },

  async getMovies({ page = 1, genre = '', year = '', sort = 'popularity.desc', provider = '' } = {}) {
    const params = new URLSearchParams({ api_key: TMDB_API_KEY, page, sort_by: sort });
    if (genre) params.append('with_genres', genre);
    if (year && year !== 'All Years') params.append('primary_release_year', year);
    if (provider) {
      params.append('with_watch_providers', provider);
      params.append('watch_region', 'US');
    }
    return safeFetch(`${TMDB_BASE_URL}/discover/movie?${params.toString()}`);
  },

  async getSeries({ page = 1, genre = '', sort = 'popularity.desc' } = {}) {
    const params = new URLSearchParams({ api_key: TMDB_API_KEY, page, sort_by: sort });
    if (genre) params.append('with_genres', genre);
    return safeFetch(`${TMDB_BASE_URL}/discover/tv?${params.toString()}`);
  },

  async getAnime({ page = 1 } = {}) {
    const params = new URLSearchParams({
      api_key: TMDB_API_KEY,
      page,
      sort_by: 'popularity.desc',
      with_genres: '16',
      with_original_language: 'ja',
    });
    return safeFetch(`${TMDB_BASE_URL}/discover/tv?${params.toString()}`);
  },

  async getMediaDetails(mediaType, id) {
    try {
      const res = await fetch(`${TMDB_BASE_URL}/${mediaType}/${id}?api_key=${TMDB_API_KEY}&append_to_response=videos,credits,similar`);
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      return GUARANTEED_TITLES.find((m) => m.id === Number(id)) || GUARANTEED_TITLES[0];
    }
  },

  async getSeasonDetails(tvId, seasonNumber) {
    try {
      const res = await fetch(`${TMDB_BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`);
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      return {
        episodes: [
          { episode_number: 1, name: "Episode 1", overview: "Season premiere." },
          { episode_number: 2, name: "Episode 2", overview: "The journey continues." }
        ]
      };
    }
  },

  async searchMulti(query) {
    return safeFetch(`${TMDB_BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`);
  }
};
