import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  AlertCircle,
  Settings,
  Tv,
} from 'lucide-react';

export default function Player({ source }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const hlsInstanceRef = useRef(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [qualityLevels, setQualityLevels] = useState([]);
  const [currentQuality, setCurrentQuality] = useState(-1); // -1 = Auto

  // UI state
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [savedResumeTime, setSavedResumeTime] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  // Initialize playback and HLS
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source || source.type === 'embed') return;

    setErrorMessage(null);
    setIsLoading(true);

    // Check localStorage for saved position
    const savedTime = parseFloat(localStorage.getItem(source.progressKey) || '0');
    if (savedTime > 15) {
      setSavedResumeTime(savedTime);
    } else {
      setSavedResumeTime(0);
    }

    // Clean up previous HLS instance if active
    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy();
      hlsInstanceRef.current = null;
    }

    if (source.type === 'hls') {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });
        hlsInstanceRef.current = hls;

        hls.loadSource(source.url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          setIsLoading(false);
          const levels = data.levels.map((lvl, index) => ({
            id: index,
            height: lvl.height,
            bitrate: lvl.bitrate,
          }));
          setQualityLevels(levels);
          video.play().catch(() => setIsPlaying(false));
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                setErrorMessage('Network error: Unable to load video manifest or stream chunks.');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                setErrorMessage('Media decode error. Attempting automatic recovery...');
                hls.recoverMediaError();
                break;
              default:
                setErrorMessage('Fatal stream error: The requested HLS source could not be played.');
                hls.destroy();
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native iOS Safari HLS handling
        video.src = source.url;
        video.addEventListener('loadedmetadata', () => {
          setIsLoading(false);
          video.play().catch(() => setIsPlaying(false));
        });
      } else {
        setErrorMessage('Your browser does not support HLS video playback.');
      }
    } else if (source.type === 'mp4') {
      video.src = source.url;
      video.load();
    }

    return () => {
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      }
    };
  }, [source]);

  // Handle video events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsLoading(true);
    const onPlaying = () => setIsLoading(false);
    const onLoadedMetadata = () => {
      setDuration(video.duration);
      setIsLoading(false);
    };

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);

      // Save playback position periodically
      if (video.currentTime > 5 && video.duration && video.currentTime < video.duration - 10) {
        localStorage.setItem(source.progressKey, String(video.currentTime));
      }

      // Calculate buffered progress
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      localStorage.removeItem(source.progressKey);
    };

    const onError = () => {
      setIsLoading(false);
      setErrorMessage('Video failed to load. Please verify source availability.');
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
    };
  }, [source]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      const video = videoRef.current;
      if (!video) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seekRelative(10);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seekRelative(-10);
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Auto-hide control bar on inactivity
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3200);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  const seekRelative = (seconds) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(Math.max(video.currentTime + seconds, 0), duration);
  };

  const handleSeek = (e) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const target = (parseFloat(e.target.value) / 100) * duration;
    video.currentTime = target;
    setCurrentTime(target);
  };

  const handleVolumeChange = (e) => {
    const video = videoRef.current;
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (video) {
      video.volume = val;
      video.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      // Browser does not support PiP
    }
  };

  const handleSpeedChange = (speed) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackSpeed(speed);
    setShowSettings(false);
  };

  const handleQualityChange = (levelIndex) => {
    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.currentLevel = levelIndex;
      setCurrentQuality(levelIndex);
    }
    setShowSettings(false);
  };

  const applyResumeTime = () => {
    const video = videoRef.current;
    if (video && savedResumeTime > 0) {
      video.currentTime = savedResumeTime;
      setSavedResumeTime(0);
    }
  };

  const formatTime = (secs) => {
    if (isNaN(secs) || secs === 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden group select-none border border-white/10 shadow-2xl"
    >
      {/* Native HTML5 Video Element */}
      <video
        ref={videoRef}
        playsInline
        className="w-full h-full object-contain cursor-pointer"
        onClick={togglePlay}
        poster={source.backdrop || source.poster}
      />

      {/* Loading Spinner */}
      {isLoading && !errorMessage && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/30 backdrop-blur-[2px]">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Playback Error Overlay */}
      {errorMessage && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-6 text-center backdrop-blur-md">
          <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
          <h4 className="text-base font-semibold text-white mb-1">Playback Unavailable</h4>
          <p className="text-xs text-white/60 max-w-sm mb-4">{errorMessage}</p>
          <button
            onClick={() => {
              setErrorMessage(null);
              videoRef.current?.load();
            }}
            className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs border border-white/15 transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {/* Resume Playback Pill */}
      {savedResumeTime > 0 && !isPlaying && (
        <div className="absolute top-4 left-4 z-40 flex items-center gap-2.5 px-4 py-2 rounded-full glass-panel border border-white/20 bg-black/60 backdrop-blur-md shadow-xl">
          <RotateCcw className="w-3.5 h-3.5 text-white/80" />
          <span className="text-xs text-white/90">
            Resume from {formatTime(savedResumeTime)}?
          </span>
          <button
            onClick={applyResumeTime}
            className="text-xs bg-white text-black px-2.5 py-0.5 rounded-full font-semibold hover:bg-white/90 transition-all cursor-pointer"
          >
            Resume
          </button>
          <button
            onClick={() => setSavedResumeTime(0)}
            className="text-xs text-white/40 hover:text-white transition-all cursor-pointer ml-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Center Big Play Button Overlay on Pause */}
      {!isPlaying && !isLoading && !errorMessage && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center cursor-pointer bg-black/25"
        >
          <div className="w-16 h-16 rounded-full glass-panel border border-white/25 flex items-center justify-center shadow-2xl transition-transform transform group-hover:scale-110 active:scale-95">
            <Play className="w-7 h-7 text-white fill-white translate-x-0.5" />
          </div>
        </div>
      )}

      {/* Liquid-Glass Control Bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-30 p-4 transition-all duration-300 bg-gradient-to-t from-black/80 via-black/40 to-transparent ${
          showControls || !isPlaying ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
        }`}
      >
        <div className="glass-panel rounded-2xl p-3 border border-white/15 shadow-2xl backdrop-blur-xl flex flex-col gap-2.5">
          {/* Seek Bar & Buffer Progress */}
          <div className="relative w-full h-1.5 flex items-center group/seek cursor-pointer">
            {/* Background Track */}
            <div className="absolute inset-0 rounded-full bg-white/10" />
            {/* Buffer Track */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/20 transition-all"
              style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }}
            />
            {/* Played Progress Track */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white transition-all"
              style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            />
            {/* Native Seek Input */}
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={duration ? (currentTime / duration) * 100 : 0}
              onChange={handleSeek}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between text-white/90">
            {/* Left Controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all cursor-pointer"
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white translate-x-0.5" />}
              </button>

              <div className="flex items-center gap-1.5 group/vol">
                <button
                  onClick={toggleMute}
                  className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-all cursor-pointer"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-white/60" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-white" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-14 sm:w-20 h-1 bg-white/20 rounded-full appearance-none accent-white cursor-pointer"
                />
              </div>

              <span className="text-[11px] font-mono text-white/60">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-2 relative">
              {/* Settings / Quality / Speed Menu */}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-all cursor-pointer text-white/80 hover:text-white"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>

              {showSettings && (
                <div className="absolute bottom-11 right-0 w-44 rounded-xl glass-panel border border-white/20 bg-black/80 backdrop-blur-xl p-2.5 shadow-2xl flex flex-col gap-2 z-50 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider px-1">Speed</span>
                    <div className="flex gap-1 mt-1">
                      {[0.75, 1, 1.25, 1.5, 2].map((s) => (
                        <button
                          key={s}
                          onClick={() => handleSpeedChange(s)}
                          className={`flex-1 py-1 rounded text-center transition-all ${
                            playbackSpeed === s ? 'bg-white text-black font-semibold' : 'hover:bg-white/10 text-white/70'
                          }`}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {qualityLevels.length > 0 && (
                    <div className="border-t border-white/10 pt-2">
                      <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider px-1">Quality</span>
                      <div className="flex flex-col gap-0.5 mt-1 max-h-28 overflow-y-auto">
                        <button
                          onClick={() => handleQualityChange(-1)}
                          className={`text-left px-2 py-1 rounded transition-all ${
                            currentQuality === -1 ? 'bg-white text-black font-semibold' : 'hover:bg-white/10 text-white/70'
                          }`}
                        >
                          Auto
                        </button>
                        {qualityLevels.map((lvl) => (
                          <button
                            key={lvl.id}
                            onClick={() => handleQualityChange(lvl.id)}
                            className={`text-left px-2 py-1 rounded transition-all ${
                              currentQuality === lvl.id ? 'bg-white text-black font-semibold' : 'hover:bg-white/10 text-white/70'
                            }`}
                          >
                            {lvl.height}p
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* PiP Button */}
              <button
                onClick={togglePiP}
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-all cursor-pointer text-white/80 hover:text-white"
                title="Picture-in-Picture"
              >
                <Tv className="w-4 h-4" />
              </button>

              {/* Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-all cursor-pointer text-white/80 hover:text-white"
                title="Fullscreen"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
