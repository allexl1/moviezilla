export async function onRequestGet(context) {
  const { params } = context;
  const tmdbId = String(params.id);

  // Allow open CORS
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  };

  const DIRECT_CATALOG = {
    "550": {
      type: "hls",
      url: "https://content.jwplatform.com/manifests/vM7nH0Kl.m3u8",
      subtitles: [
        {
          label: "English",
          src: "https://content.jwplatform.com/tracks/114979.vtt",
          srclang: "en",
          default: true
        }
      ]
    }
  };

  if (DIRECT_CATALOG[tmdbId]) {
    return new Response(JSON.stringify(DIRECT_CATALOG[tmdbId]), {
      status: 200,
      headers,
    });
  }

  return new Response(JSON.stringify({ error: 'Direct source not found' }), {
    status: 404,
    headers,
  });
}
