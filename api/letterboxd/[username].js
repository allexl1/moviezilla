export default async function handler(req, res) {
  const { username } = req.query;

  try {
    const rss = await fetch(`https://letterboxd.com/${username}/rss/`);
    if (!rss.ok) throw new Error(`Letterboxd status ${rss.status}`);
    const text = await rss.text();

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).send(text);
  } catch (err) {
    return res.status(500).json({ error: 'Letterboxd proxy failed', message: err.message });
  }
}
