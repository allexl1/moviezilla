// ESPN unofficial scoreboard proxy (live minutes + scores). No key,
// CORS-blocked in browsers, so it rides here server-side. ISOLATION:
// this whole layer is one file + one service + one UI overlay — if the
// unofficial endpoint ever dies, delete those and nothing else breaks.
// Polite by shape: 45s edge cache, client polls at 90s and only while
// live matches exist. Unofficial source, no license: scores render with
// a plain LIVE badge (they are genuinely live), never mixed silently
// into delayed rows without the badge.
const API = 'https://site.api.espn.com/apis/site/v2/sports';

const ALLOWED = [
  /^soccer\/[a-z0-9.]+\/scoreboard$/,
  /^soccer\/[a-z0-9.]+\/summary$/,
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

    if (!ALLOWED.some((re) => re.test(cleanPath)) || cleanPath.includes('..')) {
      return res.status(403).json({ error: 'ESPN path not allowed' });
    }

    // Only the event id rides along (summary endpoint); everything else
    // is dropped so callers can't reshape upstream queries.
    const qs = queryParams.event ? `?event=${encodeURIComponent(String(queryParams.event)).slice(0, 24)}` : '';
    const targetUrl = `${API}/${cleanPath}${qs}`;
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

    if (!r.ok) {
      return res.status(502).json({ error: 'ESPN upstream error' });
    }

    const data = await r.json().catch(() => null);
    res.setHeader?.('Cache-Control', 'public, max-age=45, s-maxage=45, stale-while-revalidate=60');
    return res.status(200).json(data ?? {});
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to communicate with ESPN',
      details: err.message,
    });
  }
}
