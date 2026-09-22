// Rotten Tomatoes scores. Three backends, in order:
// 1. OMDb (free OMDB_API_KEY, 1000 req/day) — exact IMDb-ID lookup when
//    the client sends ?imdb=, else title+year. Most reliable, no guessing.
// 2. RapidAPI (rottentomato.p.rapidapi.com) if RAPIDAPI_KEY is set.
// 3. Free keyless rt-api fallback (no key needed, frequently quota-dry).
// Client sends ?title=&year= (+ ?imdb= when known); we return { critic,
// audience } as integers. OMDb only carries the Tomatometer — audience
// stays null (hidden gracefully) rather than faked.
// Year-guarded: a title mismatch (remakes, same names) returns nothing
// rather than a wrong film's score. Cached a day at the edge.
export default async function handler(req, res) {
  const title = String(req.query?.title || '').trim();
  const year = String(req.query?.year || '').slice(0, 4);
  const imdb = String(req.query?.imdb || '').trim();

  if (!title && !imdb) {
    return res.status(400).json({ error: 'Missing title' });
  }

  // Primary backend — exact when the IMDb ID is known.
  if (process.env.OMDB_API_KEY) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      let r;
      try {
        const url = imdb
          ? `https://www.omdbapi.com/?i=${encodeURIComponent(imdb)}&apikey=${process.env.OMDB_API_KEY}`
          : `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&y=${encodeURIComponent(year)}&apikey=${process.env.OMDB_API_KEY}`;
        r = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (r.ok) {
        const body = await r.json();
        if (body?.Response === 'True') {
          // Title path only: guard against same-title mismatches.
          if (!imdb && /^\d{4}$/.test(year) && body.Year) {
            const bodyYear = Number(String(body.Year).slice(0, 4));
            if (Number.isFinite(bodyYear) && Math.abs(bodyYear - Number(year)) > 1) {
              throw new Error('Year mismatch');
            }
          }
          const num = (v) => {
            const n = parseInt(String(v ?? '').replace(/[^0-9]/g, ''), 10);
            return Number.isFinite(n) ? n : null;
          };
          const rt = (body?.Ratings || []).find(
            (x) => /rotten tomatoes/i.test(String(x?.Source || ''))
          );
          const critic = num(rt?.Value);
          if (critic != null) {
            res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
            return res.status(200).json({ critic, audience: null });
          }
        }
      }
      // Fall through to the next backend on miss/parse failure.
    } catch {
      // Fall through to the next backend.
    }
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
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    let r;
    try {
      r = await fetch(
        `https://rt-api-jade.vercel.app/api/rotten-tomatoes?movie=${encodeURIComponent(title)}`,
        { headers: { Accept: 'application/json' }, signal: ctrl.signal }
      );
    } finally {
      clearTimeout(timer);
    }
    // Free backend is flaky (402 = quota, 404 = no match): treat as a miss,
    // not a 502. Cache misses briefly so detail pages don't hammer it.
    if (r.status === 402 || r.status === 429) {
      res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=600');
      return res.status(404).json({ error: 'RT quota exceeded, try later' });
    }
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
    // Client hides missing RT silently — 404 keeps consoles clean.
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=600');
    return res.status(404).json({ error: 'RT lookup failed', message: err.message });
  }
}
