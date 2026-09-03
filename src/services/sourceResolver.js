import { DirectApiProvider } from './providers/directApiProvider';
import { VidLinkFallbackProvider } from './providers/vidlinkFallbackProvider';

class SourceManager {
  constructor() {
    this.providers = [
      new DirectApiProvider(),
      new VidLinkFallbackProvider(),
    ].sort((a, b) => a.priority - b.priority);
  }

  /**
   * Resolves a media item through registered providers in priority order.
   * Invokes onProgress callback with status updates.
   */
  async resolve(media, onProgress = () => {}) {
    if (!media || !media.id) {
      throw new Error('Invalid media object provided for resolution.');
    }

    let lastError = null;

    for (const provider of this.providers) {
      try {
        onProgress({
          status: 'resolving',
          providerName: provider.name,
          providerId: provider.id,
        });

        const source = await provider.resolve(media);
        if (source && source.url) {
          onProgress({
            status: 'resolved',
            providerName: provider.name,
            providerId: provider.id,
            isFallback: provider.id === 'vidlink-fallback',
          });
          return source;
        }
      } catch (err) {
        lastError = err;
        console.warn(`[MovieZilla SourceManager] Provider ${provider.id} failed:`, err.message);
      }
    }

    throw lastError || new Error('All media providers failed to return a valid source.');
  }
}

export const sourceManager = new SourceManager();

// Backward-compatible entrypoint
export async function resolveVideoSource(media, onProgress) {
  return await sourceManager.resolve(media, onProgress);
}
