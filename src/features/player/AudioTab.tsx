import { RefObject, useEffect, useRef, useState } from "react";
import type { Segment, Track } from "../../types";
import { ScriptTab } from "./ScriptTab";

export type AutoAdvance = "off" | "sequential" | "shuffle";

interface Props {
  audioRef: RefObject<HTMLAudioElement>;
  track: Track & { segments: Segment[] };
  segFrom: number | null;
  segTo: number | null;
  trackIndex: number;
  trackTotal: number;
  isActive: boolean;
  autoAdvance: AutoAdvance;
  onSetAutoAdvance: (m: AutoAdvance) => void;
  onPrev: () => void;
  onNext: () => void;
  onRangeChange: (from: number | null, to: number | null) => void;
}

function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function AudioTab({
  audioRef, track, segFrom, segTo,
  trackIndex, trackTotal, isActive,
  autoAdvance, onSetAutoAdvance,
  onPrev, onNext, onRangeChange,
}: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [duration, setDuration] = useState(track.duration_ms ?? 0);
  const [isScriptOpen, setIsScriptOpen] = useState(false);

  const isLoopingRef = useRef(false);
  const autoAdvanceRef = useRef(autoAdvance);
  const onNextRef = useRef(onNext);
  const progressBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => { autoAdvanceRef.current = autoAdvance; }, [autoAdvance]);
  useEffect(() => { onNextRef.current = onNext; }, [onNext]);

  useEffect(() => {
    if (track.duration_ms) setDuration(track.duration_ms);
  }, [track.duration_ms]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onTimeUpdate = () => setCurrentMs(a.currentTime * 1000);
    const onLoaded = () => { if (!isNaN(a.duration)) setDuration(a.duration * 1000); };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      if (!isActive) return;
      if (isLoopingRef.current) {
        a.currentTime = 0;
        a.play();
      } else if (autoAdvanceRef.current !== "off") {
        onNextRef.current();
      }
    };

    setIsPlaying(!a.paused);
    setCurrentMs(a.currentTime * 1000);
    if (!isNaN(a.duration) && a.duration > 0) setDuration(a.duration * 1000);

    a.addEventListener("timeupdate", onTimeUpdate);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("durationchange", onLoaded);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("timeupdate", onTimeUpdate);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("durationchange", onLoaded);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
    };
  }, [audioRef, isActive]);

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

  const toggleLoop = () => {
    const next = !isLoopingRef.current;
    isLoopingRef.current = next;
    setIsLooping(next);
  };

  const cycleAdvance = () => {
    const modes: AutoAdvance[] = ["off", "sequential", "shuffle"];
    onSetAutoAdvance(modes[(modes.indexOf(autoAdvance) + 1) % modes.length]);
  };

  const progress = duration > 0 ? currentMs / duration : 0;

  // ── Icons ───────────────────────────────────────────────────────────────

  const IconPlay = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 ml-0.5">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
  const IconPause = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
  const IconPrev = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M6 6h2v12H6zm3.5 6L20 18V6z" />
    </svg>
  );
  const IconNext = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M16 6h2v12h-2zM4 18l10.5-6L4 6z" />
    </svg>
  );
  const IconLoop = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
  const IconSequential = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
  const IconShuffle = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
    </svg>
  );
  const IconScript = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" className="w-4 h-4">
      <path d="M4 6h16M4 10h16M4 14h10" />
    </svg>
  );
  const IconChevronDown = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );

  const AdvanceIcon = () =>
    autoAdvance === "shuffle" ? <IconShuffle /> : <IconSequential />;

  // ── Layout: script open ──────────────────────────────────────────────────
  if (isScriptOpen) {
    return (
      <div className="flex flex-col h-[90%]">
        {/* Compact player bar ~20% */}
        <div className="shrink-0 px-4 pt-3 pb-2 bg-white border-b border-gray-100 space-y-2">
          {/* Progress */}
          <div
            ref={progressBarRef}
            onClick={seek}
            className="h-1 bg-gray-100 rounded-full cursor-pointer"
          >
            <div
              className="h-full bg-indigo-500 rounded-full"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          {/* Controls */}
          <div className="flex items-center gap-2">
            <button onClick={onPrev} className="text-gray-300 hover:text-gray-600 transition-colors">
              <IconPrev />
            </button>
            <button
              onClick={togglePlay}
              className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center shrink-0"
            >
              {isPlaying ? <IconPause /> : <IconPlay />}
            </button>
            <button onClick={onNext} className="text-gray-300 hover:text-gray-600 transition-colors">
              <IconNext />
            </button>
            <span className="text-xs text-gray-400 tabular-nums flex-1 text-center">
              {fmtMs(currentMs)} / {fmtMs(duration)}
            </span>
            <button
              onClick={toggleLoop}
              className={`transition-colors ${isLooping ? "text-indigo-600" : "text-gray-300 hover:text-indigo-400"}`}
            >
              <IconLoop />
            </button>
            <button
              onClick={cycleAdvance}
              className={`transition-colors ${autoAdvance !== "off" ? "text-indigo-600" : "text-gray-300 hover:text-indigo-400"}`}
            >
              <AdvanceIcon />
            </button>
            <button
              onClick={() => setIsScriptOpen(false)}
              className="text-indigo-500 hover:text-indigo-700 transition-colors"
            >
              <IconChevronDown />
            </button>
          </div>
        </div>

        {/* Script ~80% */}
        <div className="flex-1 overflow-hidden">
          <ScriptTab
            segments={track.segments}
            segFrom={segFrom}
            segTo={segTo}
            audioRef={audioRef}
            isActive={isActive}
            onRangeChange={onRangeChange}
          />
        </div>
      </div>
    );
  }

  // ── Layout: full player ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Spacer + artwork */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-5">
        {trackTotal > 1 && (
          <p className="text-xs text-gray-300 tabular-nums">
            {trackIndex + 1} / {trackTotal}
          </p>
        )}
        <div className="w-44 h-44 bg-indigo-50 rounded-3xl flex items-center justify-center shadow-sm">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-16 h-16 text-indigo-200">
            <path d="M9 3v10.55A4 4 0 1 0 11 17V7h4V3H9z" />
          </svg>
        </div>
        <p className="text-base font-semibold text-gray-800 text-center leading-snug">
          {track.title}
        </p>
      </div>

      {/* Progress */}
      <div className="px-6 pb-3">
        <div
          ref={progressBarRef}
          onClick={seek}
          className="h-1.5 bg-gray-100 rounded-full cursor-pointer mb-1.5"
        >
          <div
            className="h-full bg-indigo-500 rounded-full"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 tabular-nums">
          <span>{fmtMs(currentMs)}</span>
          <span>{fmtMs(duration)}</span>
        </div>
      </div>

      {/* Playback controls */}
      <div className="flex items-center justify-center gap-10 pb-5">
        <button onClick={onPrev} className="text-gray-300 hover:text-gray-600 transition-colors">
          <IconPrev />
        </button>
        <button
          onClick={togglePlay}
          className="w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-colors"
        >
          {isPlaying ? <IconPause /> : <IconPlay />}
        </button>
        <button onClick={onNext} className="text-gray-300 hover:text-gray-600 transition-colors">
          <IconNext />
        </button>
      </div>

      {/* Extra controls */}
      <div className="flex items-center justify-center gap-10 pb-8">
        <button
          onClick={toggleLoop}
          title="Loop track"
          className={`transition-colors ${isLooping ? "text-indigo-600" : "text-gray-300 hover:text-indigo-400"}`}
        >
          <IconLoop />
        </button>
        <button
          onClick={cycleAdvance}
          title={autoAdvance === "off" ? "Auto-advance off" : autoAdvance === "sequential" ? "Sequential" : "Shuffle"}
          className={`transition-colors ${autoAdvance !== "off" ? "text-indigo-600" : "text-gray-300 hover:text-indigo-400"}`}
        >
          <AdvanceIcon />
        </button>
        <button
          onClick={() => setIsScriptOpen(true)}
          title="Show script"
          className="text-gray-300 hover:text-indigo-400 transition-colors"
        >
          <IconScript />
        </button>
      </div>
    </div>
  );
}
