import { DirectApiProvider } from './providers/directApiProvider';
import { VidyProvider } from './providers/vidyProvider';
import { VidlinkFallbackProvider } from './providers/vidlinkFallbackProvider';

class SourceResolver {
  constructor() {
    this.providers = [
      new DirectApiProvider(),
      new VidyProvider(),
      new VidlinkFallbackProvider(),
    ];
  }

  async resolveSource({ mediaId, type = 'movie', season = 1, episode = 1, preferredServer = null }) {
    // 1. If user chose a specific server, try matching it first
    if (preferredServer) {
      const matched = this.providers.find((p) => p.id === preferredServer);
      if (matched) {
        try {
          const result = await matched.resolve(mediaId, type, season, episode);
          if (result) return result;
        } catch (e) {
          console.warn(`Preferred server "${preferredServer}" failed, falling back:`, e);
        }
      }
    }

    // 2. Cascade through providers sequentially until one resolves
    for (const provider of this.providers) {
      try {
        const result = await provider.resolve(mediaId, type, season, episode);
        if (result) return result;
      } catch (err) {
        console.warn(`Provider ${provider.name} failed:`, err);
      }
    }

    // 3. Guaranteed ultimate fallback: VidLink Iframe URL
    const fallbackUrl = type === 'tv'
      ? `https://vidlink.pro/tv/${mediaId}/${season}/${episode}?primaryColor=95ff50&secondaryColor=101014`
      : `https://vidlink.pro/movie/${mediaId}?primaryColor=95ff50&secondaryColor=101014`;

    return {
      type: 'embed',
      url: fallbackUrl,
      server: 'vidlink',
    };
  }
}

export const sourceResolver = new SourceResolver();
