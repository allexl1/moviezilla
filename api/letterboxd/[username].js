export default async function handler(req, res) {
  const { username } = req.query;

  try {
    // Watchlist feed — NOT the diary feed ({user}/rss/ returns diary
    // entries). The watchlist RSS lives at {user}/watchlist/rss/.
    const rss = await fetch(`https://letterboxd.com/${encodeURIComponent(String(username))}/watchlist/rss/`);
    if (!rss.ok) throw new Error(`Letterboxd status ${rss.status}`);
    const text = await rss.text();

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).send(text);
  } catch (err) {
    return res.status(500).json({ error: 'Letterboxd proxy failed', message: err.message });
  }
}
