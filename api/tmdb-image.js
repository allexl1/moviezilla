export default async function handler(req, res) {
  try {
    const { path, size = 'original' } = req.query;

    if (!path || typeof path !== 'string') {
      return res.status(400).json({
        error: 'Invalid or missing image path',
      });
    }

    const safePath = path
      .split('/')
      .filter((segment) => segment && segment !== '.' && segment !== '..')
      .join('/');

    if (!safePath) {
      return res.status(400).json({
        error: 'Malformed image path',
      });
    }

    const allowedSizes = new Set([
      'w92',
      'w154',
      'w185',
      'w300',
      'w342',
      'w500',
      'w780',
      'w1280',
      'original',
    ]);

    const imageSize = allowedSizes.has(size) ? size : 'original';

    const targetUrl =
      `https://image.tmdb.org/t/p/${imageSize}/${safePath}`;

    const response = await fetch(targetUrl);

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'TMDB image upstream error',
        status: response.status,
      });
    }

    const contentType =
      response.headers.get('content-type') || 'image/jpeg';

    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Cache-Control',
      'public, max-age=86400, s-maxage=604800'
    );
    res.setHeader('Content-Length', buffer.length);

    return res.status(200).send(buffer);
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to communicate with TMDB image service',
      details: err.message,
    });
  }
}