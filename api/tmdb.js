export default async function handler(req, res) {
  try {
    const { path, ...queryParams } = req.query;

    if (!path || typeof path !== 'string') {
      return res.status(400).json({
        error: 'Invalid or missing path',
      });
    }

    const pathSegments = path
      .split('/')
      .filter((segment) => segment && segment !== '.' && segment !== '..');

    if (pathSegments.length === 0) {
      return res.status(400).json({
        error: 'Malformed path',
      });
    }

    const tmdbPath = pathSegments.join('/');
    const apiKey = process.env.TMDB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: 'Server configuration error: TMDB_API_KEY is not set',
      });
    }

    const searchParams = new URLSearchParams({
      api_key: apiKey,
      ...queryParams,
    });

    const targetUrl =
      `https://api.themoviedb.org/3/${tmdbPath}?${searchParams.toString()}`;

    const response = await fetch(targetUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'TMDB upstream error',
        status: response.status,
        message: data.status_message || 'Unknown upstream error',
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to communicate with TMDB API',
      details: err.message,
    });
  }
}