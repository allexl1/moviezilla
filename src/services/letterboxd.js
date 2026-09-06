import { FALLBACK_POSTER } from './tmdb';

export const letterboxd = {
  // Reads the public Letterboxd watchlist (via our proxy, which parses the
  // watchlist grid HTML — there is no public watchlist RSS feed). Posters
  // are not embedded in that HTML, so rows use the fallback poster until
  // tapped, when the title lazily resolves to a real TMDB entry.
  async fetchUserWatchlist(username) {
    if (!username) return [];
    try {
      const res = await fetch(`/api/letterboxd/${encodeURIComponent(username)}`);
      if (!res.ok) {
        let detail = '';
        try {
          const body = await res.json();
          detail = body.error || body.message || '';
        } catch {
          // Non-JSON error body — fall through to the generic message.
        }
        throw new Error(detail || `Status ${res.status}`);
      }
      const data = await res.json();

      return (data.films || []).map((f) => ({
        // NOTE: id is the Letterboxd URL (stable list key only) — NOT a
        // TMDB id. Callers must resolve via tmdb.resolveTitle() before
        // entering the detail/playback flow.
        id: f.link || f.slug,
        title: f.title,
        name: f.title,
        release_date: f.year || '',
        poster_path: FALLBACK_POSTER,
        media_type: 'movie',
        source: 'letterboxd',
      }));
    } catch (err) {
      // Throw (don't swallow to []) so callers can tell "sync failed"
      // apart from "list is empty".
      throw new Error(`Letterboxd sync failed: ${err.message || err}`, { cause: err });
    }
  },
};
