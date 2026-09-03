export default async function handler(req, res) {
  const { path, ...queryParams } = req.query;
  const tmdbPath = Array.isArray(path) ? path.join('/') : path;
  
  const TMDB_API_KEY = process.env.VITE_TMDB_API_KEY || '4f298a53e5522830f82c2b18972e0946';
  
  const searchParams = new URLSearchParams({
    api_key: TMDB_API_KEY,
    ...queryParams,
  });

  const targetUrl = `https://api.themoviedb.org/3/${tmdbPath}?${searchParams.toString()}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch from TMDB proxy', details: err.message });
  }
}
