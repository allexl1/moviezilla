export default async function handler(req, res) {
  const { id } = req.query;

  try {
    return res.status(200).json({
      status: 'ok',
      id,
      streamUrl: null,
      subtitles: [],
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to resolve movie', message: err.message });
  }
}
