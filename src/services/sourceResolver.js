import { createVideoSource } from '../types/source';

const IMG_BASE = 'https://image.tmdb.org/t/p/original';

/**
 * Resolves any TMDB movie object into an authorized VideoSource.
 * Defaults to the standard Mux HLS test manifest for independent player verification.
 */
export async function resolveVideoSource(media, preferredSource = 'development-hls') {
  if (!media || !media.id) {
    throw new Error('Invalid media item provided to resolver.');
  }

  const poster = media.poster_path ? `${IMG_BASE}${media.poster_path}` : '';
  const backdrop = media.backdrop_path ? `${IMG_BASE}${media.backdrop_path}` : '';
  const title = media.title || media.name || 'Untitled';

  // 1. Legitimate Development Stream (Mux HLS Test Manifest)
  if (preferredSource === 'development-hls') {
    return createVideoSource({
      id: media.id,
      title,
      type: 'hls',
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      poster,
      backdrop,
      subtitles: [],
      metadata: {
        voteAverage: media.vote_average,
        releaseDate: media.release_date,
        overview: media.overview,
      },
    });
  }

  // 2. Open Embed Fallback (Categorized cleanly as type: 'embed')
  if (preferredSource === 'vidlink-embed') {
    return createVideoSource({
      id: media.id,
      title,
      type: 'embed',
      url: `https://vidlink.pro/movie/${media.id}?primaryColor=ffffff&secondaryColor=08090a&iconColor=ffffff&icons=vid&autoplay=true`,
      poster,
      backdrop,
    });
  }

  throw new Error(`Unknown source configuration: ${preferredSource}`);
}
