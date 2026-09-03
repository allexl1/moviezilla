import { DirectApiProvider } from './providers/directApiProvider';
import { VidyProvider } from './providers/vidyProvider';
import { VidLinkFallbackProvider } from './providers/vidlinkFallbackProvider';

class SourceManager {
  constructor() {
    this.providers = [
      new DirectApiProvider(),
      new VidyProvider(),
      new VidLinkFallbackProvider(),
    ].sort((a, b) => a.priority - b.priority);

    this.vidlinkFallback = new VidLinkFallbackProvider();
  }

  async resolve(media, onProgress = () => {}) {
    if (!media || !media.id) {
      throw new Error('Invalid media item provided for resolution.');
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
            providerName: source.providerName,
            providerId: source.provider,
            isFallback: source.type === 'embed',
          });
          return source;
        }
      } catch (err) {
        lastError = err;
        console.warn(`[MovieZilla SourceManager] Provider ${provider.name} failed:`, err.message);
      }
    }

    throw lastError || new Error('All media providers failed to return a valid source.');
  }

  async resolveVidLinkFallback(media) {
    return await this.vidlinkFallback.resolve(media);
  }
}

export const sourceManager = new SourceManager();

export async function resolveVideoSource(media, onProgress) {
  return await sourceManager.resolve(media, onProgress);
}

export async function resolveVidLinkFallback(media) {
  return await sourceManager.resolveVidLinkFallback(media);
}
