export async function onRequestGet(context) {
  const { params } = context;
  const tmdbId = String(params.id);

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  // Plug in legitimate, direct full-length media streams here:
  // e.g. "550": { type: "hls", url: "https://your-storage.com/movies/550.m3u8" }
  const DIRECT_CATALOG = {};

  if (DIRECT_CATALOG[tmdbId]) {
    return new Response(JSON.stringify(DIRECT_CATALOG[tmdbId]), {
      status: 200,
      headers,
    });
  }

  // When no direct source is configured, trigger the embed fallback
  return new Response(JSON.stringify({ error: 'Direct source not configured' }), {
    status: 404,
    headers,
  });
}
