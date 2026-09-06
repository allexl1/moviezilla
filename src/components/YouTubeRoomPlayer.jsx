import React, { useEffect, useRef } from 'react';

// YouTube IFrame API loader (singleton — one script tag per page).
let apiPromise = null;
function loadYouTubeApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prev) {
          try {
            prev();
          } catch {
            // ignore
          }
        }
        resolve();
      };
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.onerror = () => {
        apiPromise = null;
        reject(new Error('YouTube API failed to load.'));
      };
      document.head.appendChild(tag);
    });
  }
  return apiPromise;
}

// Room player for YouTube videos. Unlike third-party embeds, YouTube
// exposes a real command API: exact seekTo + pause/play with no reload,
// so room sync here is frame-accurate instead of rebuild-based.
export default function YouTubeRoomPlayer({ videoId, roomTarget = null, onPosition = null }) {
  const mountRef = useRef(null);
  const playerRef = useRef(null);
  const pendingSeek = useRef(null);
  const pollRef = useRef(null);
  const lastSentRef = useRef({ at: 0, second: -1 });
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;

  const report = () => {
    const cb = onPositionRef.current;
    const pl = playerRef.current;
    if (!cb || !pl?.getCurrentTime) return;
    let second = 0;
    let duration = 0;
    try {
      second = Math.floor(pl.getCurrentTime() || 0);
      duration = Math.floor(pl.getDuration() || 0);
    } catch {
      return;
    }
    const now = Date.now();
    const last = lastSentRef.current;
    if (now - last.at < 4000 && Math.abs(second - last.second) < 10) return;
    lastSentRef.current = { at: now, second };
    cb({ second, duration, season: 1, episode: 1, server: 'youtube' });
  };

  // Mount once per video.
  useEffect(() => {
    let dead = false;
    let player = null;
    loadYouTubeApi()
      .then(() => {
        if (dead || !mountRef.current) return;
        player = new window.YT.Player(mountRef.current, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: () => {
              // Late joiners land on the room's second, still paused —
              // they press play themselves (autoplay with sound is blocked).
              if (pendingSeek.current != null) {
                try {
                  player.seekTo(pendingSeek.current, true);
                } catch {
                  // ignore
                }
                pendingSeek.current = null;
              }
            },
            onStateChange: (e) => {
              if (!window.YT) return;
              if (e.data === window.YT.PlayerState.PLAYING) {
                if (pollRef.current) clearInterval(pollRef.current);
                report();
                pollRef.current = setInterval(report, 2000);
              } else {
                if (pollRef.current) {
                  clearInterval(pollRef.current);
                  pollRef.current = null;
                }
                report();
              }
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => {
        // API blocked — the nocookie fallback link below still plays.
      });
    return () => {
      dead = true;
      if (pollRef.current) clearInterval(pollRef.current);
      try {
        player?.destroy();
      } catch {
        // ignore
      }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Room actions: exact seek, true remote pause/play — no reload ever.
  useEffect(() => {
    if (!roomTarget || roomTarget.key == null) return;
    const second = Math.max(0, roomTarget.second || 0);
    const apply = () => {
      const pl = playerRef.current;
      if (!pl?.seekTo) {
        pendingSeek.current = second;
        return;
      }
      try {
        if (roomTarget.action === 'pause') {
          pl.seekTo(second, true);
          pl.pauseVideo();
        } else {
          const t = pl.getCurrentTime?.() || 0;
          if (Math.abs(t - second) > 3 || roomTarget.action === 'play') {
            pl.seekTo(second, true);
          }
          if (roomTarget.action === 'play') pl.playVideo();
        }
      } catch {
        // ignore
      }
    };
    if (playerRef.current) apply();
    else pendingSeek.current = second;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomTarget?.key]);

  return (
    <div className="relative w-full h-full bg-black">
      <div ref={mountRef} className="w-full h-full" />
    </div>
  );
}

// Extract the 11-char id from watch / youtu.be / embed / shorts / live URLs.
export function parseYouTubeId(input) {
  const m = String(input || '').match(
    /(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

// Keyless title/author via oEmbed (CORS-open). Never fails hard —
// callers fall back to "YouTube video".
export async function fetchYouTubeMeta(url) {
  const id = parseYouTubeId(url);
  if (!id) throw new Error('That does not look like a YouTube link.');
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );
    if (!res.ok) throw new Error();
    const data = await res.json();
    return {
      id,
      title: data.title || 'YouTube video',
      author: data.author_name || '',
      thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  } catch {
    return { id, title: 'YouTube video', author: '', thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
  }
}
