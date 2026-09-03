/**
 * Factory for creating a normalized VideoSource.
 * Supported types: 'hls' | 'mp4' | 'embed'
 */
export function createVideoSource({
  id,
  title,
  type = 'hls',
  url,
  poster = '',
  backdrop = '',
  subtitles = [],
  metadata = {},
}) {
  if (!id || !url) {
    throw new Error('VideoSource requires both "id" and "url".');
  }

  const validTypes = ['hls', 'mp4', 'embed'];
  const resolvedType = validTypes.includes(type.toLowerCase())
    ? type.toLowerCase()
    : 'embed';

  return {
    id: String(id),
    title: title || 'Untitled Media',
    type: resolvedType,
    url,
    poster,
    backdrop,
    subtitles: Array.isArray(subtitles)
      ? subtitles.map((s, idx) => ({
          label: s.label || `Subtitle ${idx + 1}`,
          src: s.src || s.url,
          srclang: s.srclang || 'en',
          default: Boolean(s.default),
        }))
      : [],
    metadata,
    progressKey: `moviezilla_progress_${id}`,
  };
}
