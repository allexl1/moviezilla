/**
 * Factory for creating a normalized VideoSource.
 * Supported types: 'hls' | 'mp4' | 'embed'
 */
export function createVideoSource({
  id,
  title,
  type = 'embed',
  url,
  poster = '',
  backdrop = '',
  subtitles = [],
  audioTracks = [],
  quality = null,
  provider = 'unknown',
  providerName = 'Unknown Provider',
  metadata = {},
}) {
  if (!id || !url) {
    throw new Error('VideoSource requires both "id" and "url".');
  }

  const validTypes = ['hls', 'mp4', 'embed'];
  const resolvedType = validTypes.includes(String(type).toLowerCase())
    ? String(type).toLowerCase()
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
          label: s.label || s.language || `Subtitle ${idx + 1}`,
          src: s.src || s.url || '',
          srclang: s.srclang || s.lang || 'en',
          default: Boolean(s.default),
        }))
      : [],
    audioTracks: Array.isArray(audioTracks) ? audioTracks : [],
    quality,
    provider,
    providerName,
    metadata,
    progressKey: `moviezilla_progress_${id}`,
  };
}
