/**
 * Factory for creating a normalized VideoSource instance.
 */
export function createVideoSource({
  id,
  title,
  streamUrl,
  poster = '',
  backdrop = '',
  subtitles = [],
  audioTracks = [],
  episodeInfo = null,
  metadata = {},
}) {
  if (!id || !streamUrl) {
    throw new Error('VideoSource requires both an "id" and a "streamUrl".');
  }

  return {
    id: String(id),
    title,
    streamUrl,
    poster,
    backdrop,
    subtitles: subtitles.map((s, idx) => ({
      html: s.label || `Subtitle ${idx + 1}`,
      url: s.url,
      type: s.type || 'vtt',
      default: !!s.default,
    })),
    audioTracks: audioTracks.map((a, idx) => ({
      name: a.name || `Audio Track ${idx + 1}`,
      url: a.url,
      default: !!a.default,
    })),
    episodeInfo: episodeInfo
      ? {
          season: episodeInfo.season,
          episode: episodeInfo.episode,
          hasPrevious: Boolean(episodeInfo.hasPrevious),
          hasNext: Boolean(episodeInfo.hasNext),
          onPrevious: episodeInfo.onPrevious || null,
          onNext: episodeInfo.onNext || null,
        }
      : null,
    metadata,
    progressKey: `moviezilla_progress_${id}`,
  };
}
