import { BaseProvider } from './base';
import { createVideoSource } from '../../types/source';

const IMG_BASE = 'https://image.tmdb.org/t/p/original';

export class VidyProvider extends BaseProvider {
  constructor() {
    super({
      id: 'vidy-embed',
      name: 'Vidy Embed',
      priority: 2,
    });
  }

  async resolve(media) {
    if (!media || !media.id) {
      throw new Error('Missing media ID for Vidy Embed');
    }

    const poster = media.poster_path ? `${IMG_BASE}${media.poster_path}` : '';
    const backdrop = media.backdrop_path ? `${IMG_BASE}${media.backdrop_path}` : '';

    return createVideoSource({
      id: media.id,
      title: media.title || media.name || 'Untitled Media',
      type: 'embed',
      url: `https://vidy.st/movie/${media.id}`,
      poster,
      backdrop,
      provider: this.id,
      providerName: this.name,
      metadata: {
        voteAverage: media.vote_average,
        releaseDate: media.release_date,
        overview: media.overview,
      },
    });
  }
}
