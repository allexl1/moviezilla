export const EMBED_SERVERS = [
  {
    id: 'vidy',
    name: 'Server 1 (Vidy)',
    badge: 'Fast',
    getMovieUrl: (tmdbId) => `https://vidy.st/movie/${tmdbId}`,
    getTvUrl: (tmdbId, season, episode) => `https://vidy.st/tv/${tmdbId}/${season}/${episode}`,
  },
  {
    id: 'vidlink',
    name: 'Server 2 (VidLink)',
    badge: 'Multi-Lang',
    getMovieUrl: (tmdbId) =>
      `https://vidlink.pro/movie/${tmdbId}?primaryColor=ffffff&secondaryColor=08090a&iconColor=ffffff&icons=vid&autoplay=false`,
    getTvUrl: (tmdbId, season, episode) =>
      `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}?primaryColor=ffffff&secondaryColor=08090a&iconColor=ffffff&icons=vid&autoplay=false`,
  },
  {
    id: 'embedsu',
    name: 'Server 3 (Embed.su)',
    badge: 'HD',
    getMovieUrl: (tmdbId) => `https://embed.su/embed/movie/${tmdbId}`,
    getTvUrl: (tmdbId, season, episode) => `https://embed.su/embed/tv/${tmdbId}/${season}/${episode}`,
  },
  {
    id: 'smashystream',
    name: 'Server 4 (Smashy)',
    badge: 'Backup',
    getMovieUrl: (tmdbId) => `https://player.smashystream.com/movie/${tmdbId}`,
    getTvUrl: (tmdbId, season, episode) => `https://player.smashystream.com/tv/${tmdbId}?s=${season}&e=${episode}`,
  },
  {
    id: 'vidsrc',
    name: 'Server 5 (VidSrc.cc)',
    badge: 'Stable',
    getMovieUrl: (tmdbId) => `https://vidsrc.cc/v2/embed/movie/${tmdbId}`,
    getTvUrl: (tmdbId, season, episode) => `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${season}/${episode}`,
  },
  {
    id: 'autoembed',
    name: 'Server 6 (AutoEmbed)',
    badge: 'Mirror',
    getMovieUrl: (tmdbId) => `https://player.autoembed.cc/embed/movie/${tmdbId}`,
    getTvUrl: (tmdbId, season, episode) => `https://player.autoembed.cc/embed/tv/${tmdbId}/${season}/${episode}`,
  },
];
