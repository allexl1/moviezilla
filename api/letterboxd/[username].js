const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Letterboxd exposes NO public watchlist RSS (/watchlist/rss/ is 403) —
// only the diary feed (/rss/) is public. So the watchlist is read from the
// public watchlist grid HTML, which embeds per-film data attributes.
// Returns JSON: { films: [{ title, year, slug, link }] }.
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCodePoint(Number(n));
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => {
      try {
        return String.fromCodePoint(parseInt(n, 16));
      } catch {
        return '';
      }
    })
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseFilms(html) {
  const films = [];
  const seen = new Set();
  const re =
    /data-item-name="([^"]+?)"[^>]*?data-item-slug="([^"]+?)"[^>]*?data-item-link="([^"]+?)"/gs;
  let m;
  while ((m = re.exec(html))) {
    const slug = m[2];
    if (seen.has(slug)) continue;
    seen.add(slug);
    const name = decodeEntities(m[1]).trim();
    const yearMatch = /^(.*)\s\((\d{4})\)\s*$/.exec(name);
    films.push({
      title: (yearMatch ? yearMatch[1] : name).trim(),
      year: yearMatch ? yearMatch[2] : '',
      slug,
      link: m[3],
    });
  }
  return films;
}

export default async function handler(req, res) {
  const username = String(req.query?.username || '').trim();

  if (!username || !/^[A-Za-z0-9_-]{1,30}$/.test(username)) {
    return res.status(400).json({ error: 'Invalid Letterboxd username' });
  }

  try {
    const films = [];
    const seen = new Set();

    // Follow watchlist pagination (page 1 has no /page/1/ path), cap at 5
    // pages so a huge list can't stall the serverless function.
    for (let page = 1; page <= 5; page++) {
      const url =
        page === 1
          ? `https://letterboxd.com/${encodeURIComponent(username)}/watchlist/`
          : `https://letterboxd.com/${encodeURIComponent(username)}/watchlist/page/${page}/`;

      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
      });

      if (!r.ok) {
        if (page === 1) throw new Error(`Letterboxd status ${r.status}`);
        break;
      }

      const html = await r.text();
      const before = films.length;
      for (const f of parseFilms(html)) {
        if (seen.has(f.slug)) continue;
        seen.add(f.slug);
        films.push(f);
      }

      // No new titles, or no link onward = last page.
      if (films.length === before) break;
      if (!html.includes(`/watchlist/page/${page + 1}/`)) break;
    }

    if (films.length === 0) {
      return res.status(404).json({
        error: 'Watchlist is empty or private. Public watchlists only.',
      });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json({ films });
  } catch (err) {
    return res.status(500).json({
      error: 'Letterboxd fetch failed',
      message: err.message,
    });
  }
}
