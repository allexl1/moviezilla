// TheSportsDB v1 proxy (photos, artwork, lineups). The free key is
// PUBLIC by design (`123`, per their docs) — no secret to protect —
// but everything still rides the proxy for edge caching and one
// allowlist. Free limits are per-endpoint result caps plus 30 req/min
// shared on the public key, so the client caches photos permanently
// (faces don't change) and fetches lazily, never in lists.
const API = 'https://www.thesportsdb.com/api/v1/json/123';

const ALLOWED = [
  /^searchteams\.php$/,
  /^searchplayers\.php$/,
  /^lookupplayer\.php$/,
  /^lookupteam\.php$/,
  /^lookup_all_players\.php$/,
  /^lookuplineup\.php$/,
  /^lookupeventstats\.php$/,
  /^lookupplayerstats\.php$/,
];

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
      return res.status(403).json({ error: 'SportsDB path not allowed' });
    }

    const qs = new URLSearchParams(queryParams).toString();
    const targetUrl = `${API}/${cleanPath}${qs ? `?${qs}` : ''}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let r;
    try {
      r = await fetch(targetUrl, {
        headers: { Accept: 'application/json', 'User-Agent': 'Moviezilla/1.0' },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (r.status === 429) {
      const retry = r.headers.get('Retry-After') || '60';
      res.setHeader?.('Retry-After', retry);
      return res.status(429).json({ error: 'Sports art is busy. Retry shortly.', retryAfter: Number(retry) || 60 });
    }

    if (!r.ok) {
      return res.status(502).json({ error: 'Sports art upstream error' });
    }

    const data = await r.json().catch(() => null);
    // Portraits, badges and squads barely move: cache a day at the edge.
    res.setHeader?.('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=600');
    return res.status(200).json(data ?? {});
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to communicate with sports art',
      details: err.message,
    });
  }
}
