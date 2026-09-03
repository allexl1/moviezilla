import React, { useEffect, useRef, useState } from 'react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { AlertCircle, RotateCcw } from 'lucide-react';

export default function Player({ source, onNextEpisode, onPrevEpisode }) {
  const artRef = useRef(null);
  const playerInstance = useRef(null);
  const [playbackError, setPlaybackError] = useState(null);
  const [savedPosition, setSavedPosition] = useState(0);

  useEffect(() => {
    if (!source || !artRef.current) return;

    setPlaybackError(null);

    // Retrieve saved progress from localStorage
    const storedTime = parseFloat(localStorage.getItem(source.progressKey) || '0');
    if (storedTime > 15) {
      setSavedPosition(storedTime);
    }

    const art = new Artplayer({
      container: artRef.current,
      url: source.streamUrl,
      poster: source.backdrop || source.poster,
      title: source.title,
      type: 'm3u8',
      volume: 0.85,
      autoplay: true,
      autoSize: false,
      autoMini: true,
      playbackRate: true,
      aspectRatio: true,
      setting: true,
      pip: true,
      fullscreen: true,
      fullscreenWeb: true,
      miniProgressBar: true,
      lock: true,
      fastForward: true,
      autoOrientation: true,
      theme: '#ffffff',
      hotkey: true,
      whitelist: ['*'],
      customType: {
        m3u8: function (video, url, artInstance) {
          if (Hls.isSupported()) {
            if (artInstance.hls) artInstance.hls.destroy();

            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
            });

            hls.loadSource(url);
            hls.attachMedia(video);
            artInstance.hls = hls;

            hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
              // Extract quality levels dynamically from HLS manifest
              const levels = data.levels || [];
              if (levels.length > 1) {
                const qualitySelector = levels.map((lvl, index) => ({
                  html: `${lvl.height}p`,
                  level: index,
                  default: index === hls.currentLevel,
                }));

                qualitySelector.unshift({
                  html: 'Auto',
                  level: -1,
                  default: hls.currentLevel === -1,
                });

                artInstance.setting.update({
                  name: 'quality',
                  html: 'Quality',
                  tooltip: 'Auto',
                  selector: qualitySelector,
                  onSelect: function (item) {
                    hls.currentLevel = item.level;
                    return item.html;
                  },
                });
              }

              // Apply saved position if requested
              if (storedTime > 15) {
                artInstance.seek = storedTime;
              }
            });

            hls.on(Hls.Events.ERROR, (_, errorData) => {
              if (errorData.fatal) {
                switch (errorData.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    setPlaybackError('Network interruption: unable to fetch media playlist.');
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    setPlaybackError('Corrupt media segment encountered. Recovering...');
                    hls.recoverMediaError();
                    break;
                  default:
                    setPlaybackError('Fatal playback error. This stream cannot be loaded.');
                    hls.destroy();
                    break;
                }
              }
            });

            artInstance.on('destroy', () => hls.destroy());
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
            if (storedTime > 15) {
              video.currentTime = storedTime;
            }
          } else {
            setPlaybackError('Native HLS stream is not supported in this browser.');
          }
        },
      },
      settings: [
        ...(source.subtitles.length > 0
          ? [
              {
                name: 'subtitle-switch',
                html: 'Subtitles',
                selector: [
                  { html: 'Off', url: '', default: true },
                  ...source.subtitles.map((sub) => ({
                    html: sub.html,
                    url: sub.url,
                    type: sub.type,
                    default: sub.default,
                  })),
                ],
                onSelect: function (item) {
                  if (!item.url) {
                    artInstance.subtitle.show = false;
                  } else {
                    artInstance.subtitle.switch(item.url, { name: item.html });
                    artInstance.subtitle.show = true;
                  }
                  return item.html;
                },
              },
            ]
          : []),
      ],
      controls: [
        ...(source.episodeInfo?.hasPrevious
          ? [
              {
                position: 'left',
                html: '<span class="art-icon">⏮</span>',
                tooltip: 'Previous Episode',
                click: () => onPrevEpisode && onPrevEpisode(),
              },
            ]
          : []),
        ...(source.episodeInfo?.hasNext
          ? [
              {
                position: 'left',
                html: '<span class="art-icon">⏭</span>',
                tooltip: 'Next Episode',
                click: () => onNextEpisode && onNextEpisode(),
              },
            ]
          : []),
      ],
    });

    // Save timestamp periodically
    art.on('video:timeupdate', () => {
      if (art.currentTime > 5 && art.currentTime < art.duration - 15) {
        localStorage.setItem(source.progressKey, String(art.currentTime));
      }
    });

    // Clear position on complete
    art.on('video:ended', () => {
      localStorage.removeItem(source.progressKey);
    });

    playerInstance.current = art;

    return () => {
      if (playerInstance.current && playerInstance.current.destroy) {
        playerInstance.current.destroy(false);
      }
    };
  }, [source]);

  const handleResume = () => {
    if (playerInstance.current && savedPosition > 0) {
      playerInstance.current.seek = savedPosition;
      setSavedPosition(0);
    }
  };

  return (
    <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
      <div ref={artRef} className="w-full h-full" />

      {/* Resume notification banner */}
      {savedPosition > 0 && (
        <div className="absolute top-4 left-4 z-30 flex items-center gap-3 px-4 py-2 rounded-full glass-panel border border-white/20 bg-black/60 backdrop-blur-md">
          <RotateCcw className="w-4 h-4 text-white/80" />
          <span className="text-xs text-white/90">
            Resume from {Math.floor(savedPosition / 60)}:{('0' + Math.floor(savedPosition % 60)).slice(-2)}?
          </span>
          <button
            onClick={handleResume}
            className="text-xs bg-white text-black px-2.5 py-0.5 rounded-full font-semibold hover:bg-white/90 transition-all cursor-pointer"
          >
            Resume
          </button>
          <button
            onClick={() => setSavedPosition(0)}
            className="text-xs text-white/50 hover:text-white transition-all cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Structured playback error overlay */}
      {playbackError && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center p-6 bg-black/90 backdrop-blur-md text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
          <h3 className="text-lg font-semibold text-white mb-1">Playback Error</h3>
          <p className="text-sm text-white/60 max-w-md mb-4">{playbackError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs border border-white/15 transition-all"
          >
            Reload Stream
          </button>
        </div>
      )}
    </div>
  );
}
