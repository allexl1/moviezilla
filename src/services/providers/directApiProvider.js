import { BaseProvider } from './base';

export class DirectApiProvider extends BaseProvider {
  constructor() {
    super('direct', 'Direct Stream (Fastest)');
  }

  async resolve(mediaId, mediaType = 'movie', season = 1, episode = 1) {
    try {
      const endpoint = mediaType === 'tv'
        ? `/api/source/tv/${mediaId}?season=${season}&episode=${episode}`
        : `/api/source/movie/${mediaId}`;

      const res = await fetch(endpoint, {
        headers: { 'Accept': 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`Direct provider endpoint returned ${res.status}`);
      }

      const data = await res.json();
      if (data?.streamUrl) {
        return {
          type: 'direct',
          url: data.streamUrl,
          subtitles: data.subtitles || [],
          server: 'direct',
        };
      }
      return null;
    } catch (err) {
      console.warn(`DirectApiProvider failed for ${mediaType} ${mediaId}:`, err);
      return null;
    }
  }
}
