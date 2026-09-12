// Tenor GIF client via our own /api/gif proxy (key stays server-side,
// same posture as the TMDB proxy). Trending on open, debounced search.

async function callGif(action, params = {}) {
  const query = new URLSearchParams({ action, ...params });
  const res = await fetch(`/api/gif?${query.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `GIF request failed: ${res.status}`);
  }
  const results = data.results || [];
  return results
    .map((r) => {
      const fmts = r.media_formats || {};
      const full = fmts.gif?.url || fmts.mediumgif?.url || null;
      const preview = fmts.tinygif?.url || fmts.nanogif?.url || full;
      if (!full || !preview) return null;
      return {
        id: r.id,
        title: r.title || r.content_description || '',
        url: full,
        preview,
      };
    })
    .filter(Boolean);
}

export function gifTrending() {
  return callGif('trending', { limit: '18' });
}

export function gifSearch(q) {
  return callGif('search', { q, limit: '18' });
}
