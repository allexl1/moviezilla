// GIF proxy (trending + search). Key stays server-side — the client
// only ever talks to /api/gif, same posture as the TMDB proxy.
// Provider: KLIPY (api.klipy.com) — the designated Tenor successor
// (Tenor's third-party API was shut down June 30, 2026; KLIPY mirrors
// its request/response shape, which is why this file still speaks
// Tenor-ish). Requires KLIPY_API_KEY in env (free at partner.klipy.com).
// Without it every call fails visibly so the picker shows the reason.

const ALLOWED_ACTIONS = new Set(['trending', 'search']);

export default async function handler(req, res) {
  try {
    const { action, q = '', limit = '12', pos = '' } = req.query || {};

    if (!ALLOWED_ACTIONS.has(action)) {
      return res.status(400).json({ error: 'Invalid or missing action' });
    }

    const apiKey = process.env.KLIPY_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'GIFs not configured yet — the host needs a Klipy API key (free at partner.klipy.com).',
      });
    }

    const params = new URLSearchParams({
      key: apiKey,
      client_key: 'moviezilla',
      limit: String(Math.min(Math.max(parseInt(limit, 10) || 12, 1), 24)),
      media_filter: 'gif,tinygif,nanogif',
      contentfilter: 'high',
    });
    if (action === 'search') {
      if (!String(q).trim()) return res.status(200).json({ results: [] });
      params.set('q', String(q).slice(0, 120));
      if (pos) params.set('pos', String(pos).slice(0, 32));
    } else {
      if (pos) params.set('pos', String(pos).slice(0, 32));
    }

    const targetUrl = `https://api.klipy.com/v2/${action === 'search' ? 'search' : 'featured'}?${params.toString()}`;
    const response = await fetch(targetUrl, { headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'GIF upstream error',
        status: response.status,
      });
    }

    res.setHeader?.('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
    return res.status(200).json({ results: data.results || [] });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to communicate with GIF API',
      details: err.message,
    });
  }
}
