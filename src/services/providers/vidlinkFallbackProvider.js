import { BaseProvider } from './base';
import { createVideoSource } from '../../types/source';

const IMG_BASE = 'https://image.tmdb.org/t/p/original';

export class VidLinkFallbackProvider extends BaseProvider {
  constructor() {
    super({
      id: 'vidlink-fallback',
      name: 'VidLink Embed Fallback',
      priority: 99, // Lowest priority (safe fallback)
    });
  }

  async resolve(media) {
    const poster = media.poster_path ? `${IMG_BASE}${media.poster_path}` : '';
    const backdrop = media.backdrop_path ? `${IMG_BASE}${media.backdrop_path}` : '';

    return createVideoSource({
      id: media.id,
      title: media.title || media.name,
      type: 'embed',
      url: `https://vidlink.pro/movie/${media.id}?primaryColor=ffffff&secondaryColor=08090a&iconColor=ffffff&icons=vid&autoplay=true`,
      poster,
      backdrop,
      provider: this.id,
      metadata: {
        voteAverage: media.vote_average,
        releaseDate: media.release_date,
        overview: media.overview,
      },
    });
  }
}
