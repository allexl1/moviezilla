export async function onRequestGet(context) {
  const { params } = context;
  const tmdbId = String(params?.id || '');

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  // Direct media catalog hook.
  // Map TMDB IDs to legitimate, authorized direct HLS/MP4 streams here.
  const DIRECT_CATALOG = {};

  if (DIRECT_CATALOG[tmdbId]) {
    return new Response(JSON.stringify(DIRECT_CATALOG[tmdbId]), {
      status: 200,
      headers,
    });
  }

  // Gracefully report 404 so SourceManager cascades to embed providers
  return new Response(
    JSON.stringify({ error: 'Direct HLS stream not indexed for this title' }),
    { status: 404, headers }
  );
}
