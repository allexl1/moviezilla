export default async function handler(req, res) {
  const { id, season = 1, episode = 1 } = req.query;

  try {
    return res.status(200).json({
      status: 'ok',
      id,
      season,
      episode,
      streamUrl: null,
      subtitles: [],
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to resolve TV episode', message: err.message });
  }
}
