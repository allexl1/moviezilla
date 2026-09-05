const ALLOWED_PATHS = [
  /^trending\/all\/week$/,
  /^discover\/(movie|tv)$/,
  /^search\/(movie|multi)$/,
  /^watch\/providers\/movie$/,
  /^(movie|tv)\/\d+$/,
  /^(movie|tv)\/\d+\/images$/,
  /^tv\/\d+\/season\/\d+$/,
];

// Never forward credential/session params even if a caller sends them.
const BLOCKED_PARAMS = new Set([
  'api_key',
  'api_token',
  'session_id',
  'guest_session_id',
  'session',
  'token',
]);

// Best-effort in-memory rate limit (per serverless instance, not global).
const rateBuckets = new Map();
const RATE_WINDOW = 60 * 1000;
const RATE_MAX = 240;

function rateLimited(ip) {
  const now = Date.now();
  const hits = (rateBuckets.get(ip) || []).filter((t) => now - t < RATE_WINDOW);
  hits.push(now);
  rateBuckets.set(ip, hits);
  if (rateBuckets.size > 2000) rateBuckets.clear();
  return hits.length > RATE_MAX;
}

function cacheHeader(tmdbPath) {
  // Search results change fast and are query-specific: short cache.
  // Catalog/details/seasons are near-immutable: longer edge cache.
  if (/^search\//.test(tmdbPath)) {
    return 'public, s-maxage=60, stale-while-revalidate=120';
  }
  return 'public, s-maxage=600, stale-while-revalidate=1200';
}

export default async function handler(req, res) {
  try {
    const { path, ...queryParams } = req.query;

    if (!path || typeof path !== 'string') {
      return res.status(400).json({
        error: 'Invalid or missing path',
      });
    }

    const pathSegments = path
      .split('/')
      .filter((segment) => segment && segment !== '.' && segment !== '..');

    if (pathSegments.length === 0) {
      return res.status(400).json({
        error: 'Malformed path',
      });
    }

    const tmdbPath = pathSegments.join('/');

    if (!ALLOWED_PATHS.some((re) => re.test(tmdbPath))) {
      return res.status(403).json({
        error: 'TMDB path not allowed',
      });
    }

    const forwarded = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    if (rateLimited(forwarded)) {
      res.setHeader?.('Retry-After', '60');
      return res.status(429).json({
        error: 'Rate limit exceeded, retry later',
      });
    }

    for (const blocked of BLOCKED_PARAMS) {
      delete queryParams[blocked];
    }

    const apiKey = process.env.TMDB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: 'Server configuration error: TMDB_API_KEY is not set',
      });
    }

    const searchParams = new URLSearchParams({
      api_key: apiKey,
      ...queryParams,
    });

    const targetUrl =
      `https://api.themoviedb.org/3/${tmdbPath}?${searchParams.toString()}`;

    const response = await fetch(targetUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'TMDB upstream error',
        status: response.status,
        message: data.status_message || 'Unknown upstream error',
      });
    }

    res.setHeader?.('Cache-Control', cacheHeader(tmdbPath));
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to communicate with TMDB API',
      details: err.message,
    });
  }
}