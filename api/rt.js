// Rotten Tomatoes scores. Two backends:
// 1. RapidAPI (rottentomato.p.rapidapi.com) if RAPIDAPI_KEY is set —
//    your curl was correct but missing the key header:
//    x-rapidapi-key: $RAPIDAPI_KEY + x-rapidapi-host.
// 2. Free keyless rt-api fallback (no key needed).
// Client sends ?title=&year= ; we return { critic, audience } as integers.
// Year-guarded: a title mismatch (remakes, same names) returns nothing
// rather than a wrong film's score. Cached a day at the edge.
export default async function handler(req, res) {
  const title = String(req.query?.title || '').trim();
  const year = String(req.query?.year || '').slice(0, 4);

  if (!title) {
    return res.status(400).json({ error: 'Missing title' });
  }

  // Optional paid backend — set RAPIDAPI_KEY in Vercel/.env.local.
  if (process.env.RAPIDAPI_KEY) {
    try {
      const r = await fetch(
        `https://rottentomato.p.rapidapi.com/?name=${encodeURIComponent(title)}`,
        {
          headers: {
            Accept: 'application/json',
            'x-rapidapi-host': 'rottentomato.p.rapidapi.com',
            'x-rapidapi-key': process.env.RAPIDAPI_KEY,
          },
        }
      );
      if (r.ok) {
        const body = await r.json();
        const num = (v) => {
          const n = parseInt(String(v ?? '').replace(/[^0-9]/g, ''), 10);
          return Number.isFinite(n) ? n : null;
        };
        // Best-effort across RapidAPI shape variants.
        const critic =
          num(body?.tomatometer ?? body?.critic ?? body?.data?.tomatometer ?? body?.rating?.critic);
        const audience =
          num(body?.audience_score ?? body?.audience ?? body?.data?.audience_score ?? body?.rating?.audience);
        if (critic != null || audience != null) {
          res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
          return res.status(200).json({ critic, audience });
        }
      }
      // Fall through to free backend on shape/parse failure.
    } catch {
      // Fall through to free backend.
    }
  }

  try {
    const r = await fetch(
      `https://rt-api-jade.vercel.app/api/rotten-tomatoes?movie=${encodeURIComponent(title)}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!r.ok) throw new Error(`RT upstream ${r.status}`);
    const body = await r.json();
    const data = body?.data;
    if (!body?.success || !data) throw new Error('No RT match');

    // Guard against same-title mismatches (e.g. remakes).
    if (/^\d{4}$/.test(year) && data.year && String(data.year) !== year) {
      const rtYear = Number(data.year);
      if (Number.isFinite(rtYear) && Math.abs(rtYear - Number(year)) > 1) {
        return res.status(404).json({ error: 'Year mismatch' });
      }
    }

    const num = (v) => {
      const n = parseInt(String(v ?? '').replace(/[^0-9]/g, ''), 10);
      return Number.isFinite(n) ? n : null;
    };

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).json({
      critic: num(data.tomatometer),
      audience: num(data.audience_score),
    });
  } catch (err) {
    return res.status(502).json({ error: 'RT lookup failed', message: err.message });
  }
}
