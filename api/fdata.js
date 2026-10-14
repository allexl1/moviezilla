// football-data.org proxy (free tier): standings, fixtures, scorers,
// team crests. Key lives ONLY here server-side (FOOTBALL_DATA_KEY env),
// never reaches the browser. Free-tier rules enforced by shape, not
// trust: allowlisted paths, aggressive edge caching (standings/scorers
// barely move; fixtures move by the hour), and 429s pass through with
// Retry-After so the client backs off instead of hammering the 10/min
// quota. Daniel's LLM note honored: X-Requests-Available-Minute is
// observed — under 2 remaining we 429 ourselves early with the same
// Retry-After contract.
const API = 'https://api.football-data.org/v4';

const ALLOWED = [
  /^competitions$/,
  /^matches$/,
  /^competitions\/[A-Z0-9]+\/standings$/,
  /^competitions\/[A-Z0-9]+\/matches$/,
  /^competitions\/[A-Z0-9]+\/scorers$/,
  /^teams\/\d+$/,
];

const TTL = [
  [/standings$/, 43200],
  [/scorers$/, 43200],
  [/matches$/, 1800],
  [/competitions$/, 86400],
  [/teams\/\d+$/, 86400],
];

function ttlFor(path) {
  for (const [re, ttl] of TTL) {
    if (re.test(path)) return ttl;
  }
  return 600;
}

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
      return res.status(403).json({ error: 'Football-data path not allowed' });
    }

    const key = process.env.FOOTBALL_DATA_KEY;
    if (!key) {
      return res.status(503).json({ error: 'Football data is not configured.' });
    }

    const qs = new URLSearchParams(queryParams).toString();
    const targetUrl = `${API}/${cleanPath}${qs ? `?${qs}` : ''}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let r;
    try {
      r = await fetch(targetUrl, {
        headers: { 'X-Auth-Token': key, Accept: 'application/json', 'User-Agent': 'Moviezilla/1.0' },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (r.status === 429) {
      const retry = r.headers.get('Retry-After') || '60';
      res.setHeader?.('Retry-After', retry);
      return res.status(429).json({ error: 'Football data is busy. Retry shortly.', retryAfter: Number(retry) || 60 });
    }

    // Throttle awareness: relay the quota signal; pre-empt when nearly dry.
    const remaining = Number(r.headers.get('X-Requests-Available-Minute'));
    if (Number.isFinite(remaining) && remaining < 2) {
      res.setHeader?.('Retry-After', '60');
      return res.status(429).json({ error: 'Football data is busy. Retry shortly.', retryAfter: 60 });
    }

    if (!r.ok) {
      return res.status(r.status === 403 ? 403 : 502).json({ error: 'Football data upstream error' });
    }

    const data = await r.json().catch(() => null);
    res.setHeader?.(
      'Cache-Control',
      `public, max-age=${ttlFor(cleanPath)}, s-maxage=${ttlFor(cleanPath)}, stale-while-revalidate=300`
    );
    return res.status(200).json(data ?? {});
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to communicate with football data',
      details: err.message,
    });
  }
}
