import { createVideoSource } from '../types/source';

const IMG_BASE = 'https://image.tmdb.org/t/p/original';

export async function resolveVideoSource(media) {
  if (!media || !media.id) {
    throw new Error('Invalid media item provided to resolver.');
  }

  const poster = media.poster_path ? `${IMG_BASE}${media.poster_path}` : '';
  const backdrop = media.backdrop_path ? `${IMG_BASE}${media.backdrop_path}` : '';
  const title = media.title || media.name || 'Untitled';

  return createVideoSource({
    id: media.id,
    title,
    type: 'embed',
    url: `https://vidlink.pro/movie/${media.id}?primaryColor=ffffff&secondaryColor=08090a&iconColor=ffffff&icons=vid&autoplay=true`,
    poster,
    backdrop,
    metadata: {
      voteAverage: media.vote_average,
      releaseDate: media.release_date,
      overview: media.overview,
    },
  });
}
