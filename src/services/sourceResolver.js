import { createVideoSource } from '../types/source';

const IMG_BASE = 'https://image.tmdb.org/t/p/original';

/**
 * Resolves a TMDB movie/show entity into a normalized VideoSource.
 * Uses verified open HLS development stream manifests as baseline fallbacks.
 */
export async function resolveVideoSource(media) {
  if (!media || !media.id) {
    throw new Error('Invalid media item provided to resolver.');
  }

  // Development & Authorized HLS Test Manifests
  const DEV_SOURCES = [
    {
      title: 'Tears of Steel (4K/1080p HLS + Subtitles)',
      url: 'https://content.jwplatform.com/manifests/vM7nH0Kl.m3u8',
      subtitles: [
        {
          label: 'English',
          url: 'https://content.jwplatform.com/tracks/114979.vtt',
          default: true,
        },
      ],
    },
    {
      title: 'Big Buck Bunny (Adaptive HLS Multi-bitrate)',
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      subtitles: [],
    },
  ];

  // Pick deterministic source based on ID
  const selectedDevSource = DEV_SOURCES[media.id % DEV_SOURCES.length];

  return createVideoSource({
    id: media.id,
    title: media.title || media.name || 'Untitled Stream',
    streamUrl: selectedDevSource.url,
    poster: media.poster_path ? `${IMG_BASE}${media.poster_path}` : '',
    backdrop: media.backdrop_path ? `${IMG_BASE}${media.backdrop_path}` : '',
    subtitles: selectedDevSource.subtitles,
    metadata: {
      releaseDate: media.release_date || media.first_air_date,
      rating: media.vote_average,
      overview: media.overview,
    },
    episodeInfo: null, // Ready for TV show schema extension
  });
}
