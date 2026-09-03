import React, { useEffect, useRef } from 'react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';

export default function Player({ streamUrl, poster, title }) {
  const artRef = useRef(null);

  useEffect(() => {
    if (!artRef.current || !streamUrl) return;

    const art = new Artplayer({
      container: artRef.current,
      url: streamUrl,
      poster: poster,
      title: title,
      type: 'm3u8',
      customType: {
        m3u8: function (video, url, artInstance) {
          if (Hls.isSupported()) {
            if (artInstance.hls) artInstance.hls.destroy();
            const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
            hls.loadSource(url);
            hls.attachMedia(video);
            artInstance.hls = hls;
            artInstance.on('destroy', () => hls.destroy());
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
          }
        },
      },
      volume: 0.8,
      autoplay: true,
      pip: true,
      setting: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      miniProgressBar: true,
      theme: '#ffffff',
    });

    return () => {
      if (art && art.destroy) art.destroy(false);
    };
  }, [streamUrl]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
      <div ref={artRef} className="w-full h-full" />
    </div>
  );
}
