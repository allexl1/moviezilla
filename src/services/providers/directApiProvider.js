import { BaseProvider } from './base';
import { createVideoSource } from '../../types/source';

const IMG_BASE = 'https://image.tmdb.org/t/p/original';

export class DirectApiProvider extends BaseProvider {
  constructor() {
    super({
      id: 'direct-hls',
      name: 'Direct HLS',
      priority: 1,
    });
  }

  async resolve(media) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    try {
      const res = await fetch(`/api/source/movie/${media.id}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Direct API returned HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data || !data.url) {
        throw new Error('Direct API payload missing stream URL');
      }

      return createVideoSource({
        id: media.id,
        title: media.title || media.name,
        type: data.type || 'hls',
        url: data.url,
        poster: media.poster_path ? `${IMG_BASE}${media.poster_path}` : '',
        backdrop: media.backdrop_path ? `${IMG_BASE}${media.backdrop_path}` : '',
        subtitles: data.subtitles || [],
        audioTracks: data.audioTracks || [],
        provider: this.id,
        providerName: this.name,
        metadata: {
          voteAverage: media.vote_average,
          releaseDate: media.release_date,
          overview: media.overview,
        },
      });
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }
}
