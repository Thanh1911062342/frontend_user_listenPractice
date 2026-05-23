import { RefObject, useEffect, useRef, useState } from "react";

interface Props {
  audioRef: RefObject<HTMLAudioElement>;
  title?: string;
  trackIndex?: number;
  trackTotal?: number;
  onPrev?: () => void;
  onNext?: () => void;
  onExpand?: () => void;
}

function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function MiniAudioPlayer({
  audioRef, title, trackIndex, trackTotal,
  onPrev, onNext, onExpand,
}: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [duration, setDuration] = useState(0);
  const progressBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onTimeUpdate = () => setCurrentMs(a.currentTime * 1000);
    const onLoaded = () => { if (!isNaN(a.duration)) setDuration(a.duration * 1000); };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    setIsPlaying(!a.paused);
    setCurrentMs(a.currentTime * 1000);
    if (!isNaN(a.duration) && a.duration > 0) setDuration(a.duration * 1000);

    a.addEventListener("timeupdate", onTimeUpdate);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("durationchange", onLoaded);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => {
      a.removeEventListener("timeupdate", onTimeUpdate);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("durationchange", onLoaded);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, [audioRef]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    a.paused ? a.play() : a.pause();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    const bar = progressBarRef.current;
    if (!a || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
    a.currentTime = ratio * (duration / 1000);
  };

  const progress = duration > 0 ? currentMs / duration : 0;

  return (
    <div className="bg-white border-b border-gray-100 shadow-sm pt-12 shrink-0">
      {/* Progress bar */}
      <div
        ref={progressBarRef}
        onClick={seek}
        className="h-1 bg-gray-100 cursor-pointer"
      >
        <div
          className="h-full bg-indigo-500 transition-all"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Controls + Title */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        {/* Artwork */}
        <button
          onClick={onExpand}
          className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center shrink-0 hover:bg-indigo-100 transition-colors"
          title="Open player"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-indigo-300">
            <path d="M9 3v10.55A4 4 0 1 0 11 17V7h4V3H9z" />
          </svg>
        </button>

        {/* Title + meta */}
        <button
          onClick={onExpand}
          className="flex-1 min-w-0 text-left"
        >
          <p className="text-sm font-medium text-gray-900 truncate">
            {title || "Now Playing"}
          </p>
          <p className="text-xs text-gray-400 tabular-nums">
            {fmtMs(currentMs)} / {fmtMs(duration)}
            {trackTotal && trackTotal > 1 && (
              <span className="ml-2 text-gray-300">· {(trackIndex ?? 0) + 1}/{trackTotal}</span>
            )}
          </p>
        </button>

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {onPrev && (
            <button
              onClick={onPrev}
              className="text-gray-300 hover:text-gray-600 transition-colors p-1"
              title="Previous"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M6 6h2v12H6zm3.5 6L20 18V6z" />
              </svg>
            </button>
          )}
          <button
            onClick={togglePlay}
            className="w-9 h-9 bg-indigo-600 text-white rounded-full flex items-center justify-center shrink-0 hover:bg-indigo-700 transition-colors"
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          {onNext && (
            <button
              onClick={onNext}
              className="text-gray-300 hover:text-gray-600 transition-colors p-1"
              title="Next"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M16 6h2v12h-2zM4 18l10.5-6L4 6z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
