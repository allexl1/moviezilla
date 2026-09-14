// Streamed API proxy: schedule + per-match stream sources, no key.
// Upstream hops domains (su <-> pk); bases are tried in order so one
// dead domain degrades instead of 500ing. STREAM_BASE env overrides.
// Matches change by the minute (short edge cache); stream URLs live
// longer. Never forward credential params.
const STREAM_BASES = [
  process.env.STREAM_BASE,
  'https://streamed.pk',
  'https://streamed.su',
].filter(Boolean);

const ALLOWED = [
  /^api\/matches\/(football|live|all)$/,
  /^api\/stream\/[^/]+\/[^/]+$/,
];

const BLOCKED_PARAMS = new Set([
  'api_key',
  'api_token',
  'session_id',
  'guest_session_id',
  'session',
  'token',
]);

export default async function handler(req, res) {
  try {
    const { path, ...queryParams } = req.query;

    if (!path || typeof path !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing path' });
    }

    const cleanPath = path
      .split('/')
      .filter((s) => s && s !== '.' && s !== '..')
      .join('/');

    if (!ALLOWED.some((re) => re.test(cleanPath))) {
      return res.status(403).json({ error: 'Football path not allowed' });
    }

    for (const blocked of BLOCKED_PARAMS) delete queryParams[blocked];

    const qs = new URLSearchParams(queryParams).toString();

    let response = null;
    let data = null;
    let lastStatus = 502;
    for (const base of STREAM_BASES) {
      const targetUrl = `${base}/${cleanPath}${qs ? `?${qs}` : ''}`;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        let r;
        try {
          r = await fetch(targetUrl, {
            headers: { Accept: 'application/json', 'User-Agent': 'Moviezilla/1.0' },
            signal: ctrl.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        const body = await r.json().catch(() => null);
        if (r.ok) {
          response = r;
          data = body;
          break;
        }
        lastStatus = r.status;
      } catch {
        // Try the next base.
      }
    }

    if (!response) {
      return res.status(502).json({
        error: 'Stream API upstream error',
        status: lastStatus,
      });
    }

    const isLive = /\/live$/.test(cleanPath);
    res.setHeader?.(
      'Cache-Control',
      isLive
        ? 'public, max-age=20, s-maxage=30, stale-while-revalidate=60'
        : 'public, max-age=60, s-maxage=120, stale-while-revalidate=300'
    );
    return res.status(200).json(data ?? []);
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to communicate with stream API',
      details: err.message,
    });
  }
}
