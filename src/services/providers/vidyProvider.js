import { BaseProvider } from './base';
import { createVideoSource } from '../../types/source';
import { tmdb } from '../tmdb';

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

    const poster = tmdb.getImageUrl(media.poster_path, 'original');
const backdrop = tmdb.getImageUrl(media.backdrop_path, 'original');

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
