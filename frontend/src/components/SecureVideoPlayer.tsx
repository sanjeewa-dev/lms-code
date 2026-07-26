import { useCallback, useEffect, useRef, useState } from 'react';
import Player from '@vimeo/player';
import { Icon } from './icons';

export type VideoPlayConfig =
  | { kind: 'youtube'; videoId: string }
  | { kind: 'vimeo'; videoId: string }
  | { kind: 'stream'; streamUrl: string };

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

type ControlProps = {
  playing: boolean;
  muted: boolean;
  volume: number;
  current: number;
  duration: number;
  speed: number;
  onTogglePlay: () => void;
  onSeek: (value: number) => void;
  onVolume: (value: number) => void;
  onToggleMute: () => void;
  onSpeed: (value: number) => void;
  onFullscreen: () => void;
};

function PlayerControls({
  playing,
  muted,
  volume,
  current,
  duration,
  speed,
  onTogglePlay,
  onSeek,
  onVolume,
  onToggleMute,
  onSpeed,
  onFullscreen,
}: ControlProps) {
  return (
    <div className="flex flex-col gap-2 border-t border-white/10 bg-black/90 px-3 py-2.5">
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(current, duration || 0)}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-brand-500"
        aria-label="Seek"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onTogglePlay}
          className="grid h-9 w-9 place-items-center rounded-lg text-white hover:bg-white/10"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <span className="text-sm font-bold tracking-tighter">❚❚</span>
          ) : (
            <Icon name="play" width={18} height={18} />
          )}
        </button>
        <span className="min-w-[5rem] text-xs tabular-nums text-slate-300">
          {formatTime(current)} / {formatTime(duration)}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleMute}
            className="rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-white/10"
          >
            {muted || volume === 0 ? 'Unmute' : 'Mute'}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            className="w-20 accent-brand-500"
            aria-label="Volume"
          />
        </div>
        <select
          value={speed}
          onChange={(e) => onSpeed(Number(e.target.value))}
          className="rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-xs text-slate-200"
          aria-label="Playback speed"
        >
          <option value={0.75}>0.75×</option>
          <option value={1}>1×</option>
          <option value={1.25}>1.25×</option>
          <option value={1.5}>1.5×</option>
          <option value={2}>2×</option>
        </select>
        <button
          type="button"
          onClick={onFullscreen}
          className="ml-auto rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-white/10"
        >
          Fullscreen
        </button>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: Record<string, unknown>
      ) => YtPlayer;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YtPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setPlaybackRate: (rate: number) => void;
  destroy: () => void;
}

let youtubeApiReady: Promise<void> | null = null;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (!youtubeApiReady) {
    youtubeApiReady = new Promise((resolve) => {
      window.onYouTubeIframeAPIReady = () => resolve();
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    });
  }
  return youtubeApiReady;
}

function usePlayerShell(title: string) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);

  const toggleFullscreen = useCallback(() => {
    shellRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  return {
    shellRef,
    playing,
    setPlaying,
    muted,
    setMuted,
    volume,
    setVolume,
    current,
    setCurrent,
    duration,
    setDuration,
    speed,
    setSpeed,
    toggleFullscreen,
    title,
  };
}

function StreamPlayer({ src, title }: { src: string; title: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shell = usePlayerShell(title);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => shell.setCurrent(video.currentTime);
    const onMeta = () => shell.setDuration(video.duration || 0);
    const onPlay = () => shell.setPlaying(true);
    const onPause = () => shell.setPlaying(false);

    video.addEventListener('timeupdate', onTime);
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.volume = shell.volume;
    video.play().catch(() => undefined);

    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, [src]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => undefined);
    else video.pause();
  };

  return (
    <div ref={shell.shellRef} className="flex h-full flex-col bg-black">
      <div className="relative min-h-0 flex-1">
        <video
          ref={videoRef}
          src={src}
          className="h-full w-full bg-black object-contain"
          playsInline
          disablePictureInPicture
          controlsList="nodownload noremoteplayback"
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
      <PlayerControls
        playing={shell.playing}
        muted={shell.muted}
        volume={shell.volume}
        current={shell.current}
        duration={shell.duration}
        speed={shell.speed}
        onTogglePlay={togglePlay}
        onSeek={(v) => {
          if (videoRef.current) videoRef.current.currentTime = v;
          shell.setCurrent(v);
        }}
        onVolume={(v) => {
          shell.setVolume(v);
          shell.setMuted(v === 0);
          if (videoRef.current) {
            videoRef.current.volume = v;
            videoRef.current.muted = v === 0;
          }
        }}
        onToggleMute={() => {
          shell.setMuted((m) => !m);
          if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
        }}
        onSpeed={(v) => {
          shell.setSpeed(v);
          if (videoRef.current) videoRef.current.playbackRate = v;
        }}
        onFullscreen={shell.toggleFullscreen}
      />
    </div>
  );
}

function YouTubePlayerView({ videoId, title }: { videoId: string; title: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const tickRef = useRef<number | null>(null);
  const shell = usePlayerShell(title);

  useEffect(() => {
    let cancelled = false;

    loadYouTubeApi().then(() => {
      if (cancelled || !mountRef.current || !window.YT) return;

      playerRef.current = new window.YT.Player(mountRef.current, {
        videoId,
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e: { target: YtPlayer }) => {
            shell.setDuration(e.target.getDuration() || 0);
            e.target.setVolume(Math.round(shell.volume * 100));
            e.target.playVideo();
          },
          onStateChange: (e: { data: number }) => {
            const playing = e.data === window.YT!.PlayerState.PLAYING;
            shell.setPlaying(playing);
          },
        },
      });

      tickRef.current = window.setInterval(() => {
        const p = playerRef.current;
        if (!p?.getCurrentTime) return;
        shell.setCurrent(p.getCurrentTime());
        const d = p.getDuration();
        if (d) shell.setDuration(d);
      }, 400);
    });

    return () => {
      cancelled = true;
      if (tickRef.current) window.clearInterval(tickRef.current);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId]);

  const player = () => playerRef.current;

  return (
    <div ref={shell.shellRef} className="flex h-full flex-col bg-black">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 [&_iframe]:pointer-events-none">
          <div ref={mountRef} className="h-full w-full" />
        </div>
      </div>
      <PlayerControls
        playing={shell.playing}
        muted={shell.muted}
        volume={shell.volume}
        current={shell.current}
        duration={shell.duration}
        speed={shell.speed}
        onTogglePlay={() => {
          const p = player();
          if (!p) return;
          if (shell.playing) p.pauseVideo();
          else p.playVideo();
        }}
        onSeek={(v) => player()?.seekTo(v, true)}
        onVolume={(v) => {
          shell.setVolume(v);
          player()?.setVolume(Math.round(v * 100));
          if (v === 0) player()?.mute();
          else player()?.unMute();
        }}
        onToggleMute={() => {
          const p = player();
          if (!p) return;
          if (shell.muted) {
            p.unMute();
            shell.setMuted(false);
          } else {
            p.mute();
            shell.setMuted(true);
          }
        }}
        onSpeed={(v) => {
          shell.setSpeed(v);
          player()?.setPlaybackRate(v);
        }}
        onFullscreen={shell.toggleFullscreen}
      />
    </div>
  );
}

function VimeoPlayerView({ videoId, title }: { videoId: string; title: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const tickRef = useRef<number | null>(null);
  const shell = usePlayerShell(title);

  useEffect(() => {
    if (!mountRef.current) return;

    const iframe = document.createElement('iframe');
    iframe.src = `https://player.vimeo.com/video/${videoId}?controls=0&dnt=1&transparent=0`;
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.className = 'h-full w-full border-0';
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    mountRef.current.innerHTML = '';
    mountRef.current.appendChild(iframe);

    const player = new Player(iframe);
    playerRef.current = player;

    player.ready().then(() => {
      player.getDuration().then((d) => shell.setDuration(d));
      player.setVolume(shell.volume);
      player.play().catch(() => undefined);
    });

    player.on('play', () => shell.setPlaying(true));
    player.on('pause', () => shell.setPlaying(false));

    tickRef.current = window.setInterval(() => {
      player.getCurrentTime().then((t) => shell.setCurrent(t));
    }, 400);

    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      player.unload().catch(() => undefined);
      playerRef.current = null;
    };
  }, [videoId]);

  const player = () => playerRef.current;

  return (
    <div ref={shell.shellRef} className="flex h-full flex-col bg-black">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 [&_iframe]:pointer-events-none">
          <div ref={mountRef} className="h-full w-full" />
        </div>
      </div>
      <PlayerControls
        playing={shell.playing}
        muted={shell.muted}
        volume={shell.volume}
        current={shell.current}
        duration={shell.duration}
        speed={shell.speed}
        onTogglePlay={() => {
          const p = player();
          if (!p) return;
          if (shell.playing) p.pause().catch(() => undefined);
          else p.play().catch(() => undefined);
        }}
        onSeek={(v) => player()?.setCurrentTime(v).catch(() => undefined)}
        onVolume={(v) => {
          shell.setVolume(v);
          player()?.setVolume(v).catch(() => undefined);
        }}
        onToggleMute={() => {
          const p = player();
          if (!p) return;
          if (shell.muted) {
            p.setVolume(shell.volume).catch(() => undefined);
            shell.setMuted(false);
          } else {
            p.setVolume(0).catch(() => undefined);
            shell.setMuted(true);
          }
        }}
        onSpeed={(v) => {
          shell.setSpeed(v);
          player()?.setPlaybackRate(v).catch(() => undefined);
        }}
        onFullscreen={shell.toggleFullscreen}
      />
    </div>
  );
}

export function SecureVideoPlayer({ config, title }: { config: VideoPlayConfig; title: string }) {
  if (config.kind === 'stream') {
    const src = config.streamUrl.startsWith('/')
      ? `${window.location.origin}${config.streamUrl}`
      : config.streamUrl;
    return <StreamPlayer src={src} title={title} />;
  }
  if (config.kind === 'youtube') {
    return <YouTubePlayerView videoId={config.videoId} title={title} />;
  }
  return <VimeoPlayerView videoId={config.videoId} title={title} />;
}
