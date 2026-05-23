import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import type { Segment } from "../types";

function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface Props {
  segments: Segment[];
  segFrom: number | null;
  segTo: number | null;
  audioRef: RefObject<HTMLAudioElement>;
  isActive: boolean;
  onRangeChange: (from: number | null, to: number | null) => void;
}

export function ScriptTab({
  segments,
  segFrom,
  segTo,
  audioRef,
  isActive,
  onRangeChange,
}: Props) {
  // pendingSel: [] | [start] | [start, end]
  const [pendingSel, setPendingSel] = useState<number[]>(() => {
    if (segFrom != null && segTo != null) return [segFrom, segTo];
    if (segFrom != null) return [segFrom, segFrom];
    return [];
  });

  // Current audio position in ms — updated by timeupdate when active
  const [currentMs, setCurrentMs] = useState(0);

  // Sync selection when props change (e.g., next track clears range)
  useEffect(() => {
    if (segFrom != null && segTo != null) setPendingSel([segFrom, segTo]);
    else if (segFrom != null) setPendingSel([segFrom, segFrom]);
    else setPendingSel([]);
  }, [segFrom, segTo]);

  // Register timeupdate when active
  useEffect(() => {
    if (!isActive) return;
    const a = audioRef.current;
    if (!a) return;
    const handler = () => setCurrentMs(a.currentTime * 1000);
    a.addEventListener("timeupdate", handler);
    return () => a.removeEventListener("timeupdate", handler);
  }, [isActive, audioRef]);

  // Which segment is currently playing
  const activeSeq = useMemo(() => {
    if (currentMs <= 0) return null;
    return (
      segments.find((s) => s.start_ms <= currentMs && s.end_ms > currentMs)
        ?.seq ?? null
    );
  }, [currentMs, segments]);

  // Auto-scroll to active segment
  const segRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  useEffect(() => {
    if (activeSeq == null) return;
    const el = segRefs.current.get(activeSeq);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeSeq]);

  // Range selection logic
  const handleTap = (seq: number) => {
    if (pendingSel.length === 0 || pendingSel.length === 2) {
      setPendingSel([seq]);
    } else {
      const [a] = pendingSel;
      if (a === seq) setPendingSel([]);
      else setPendingSel([Math.min(a, seq), Math.max(a, seq)]);
    }
  };

  const isInSelection = (seq: number) => {
    if (pendingSel.length === 0) return false;
    if (pendingSel.length === 1) return seq === pendingSel[0];
    return seq >= pendingSel[0] && seq <= pendingSel[1];
  };

  const handleApply = () => {
    if (pendingSel.length === 0) onRangeChange(null, null);
    else if (pendingSel.length === 1) onRangeChange(pendingSel[0], pendingSel[0]);
    else onRangeChange(pendingSel[0], pendingSel[1]);
  };

  const selLabel =
    pendingSel.length === 0
      ? "Full track"
      : pendingSel.length === 1
      ? `Segment ${pendingSel[0]}`
      : `Segments ${pendingSel[0]} – ${pendingSel[1]}`;

  return (
    <div className="flex flex-col h-full">
      {/* Info bar */}
      <div className="px-5 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between shrink-0">
        <p className="text-xs text-indigo-600 leading-tight">
          {pendingSel.length === 0 && "Tap a segment to set start, tap again to set end."}
          {pendingSel.length === 1 && `From ${pendingSel[0]} — tap another to set end.`}
          {pendingSel.length === 2 && `Range: ${pendingSel[0]} – ${pendingSel[1]}`}
        </p>
        {pendingSel.length > 0 && (
          <button
            onClick={() => setPendingSel([])}
            className="text-xs text-rose-400 font-medium ml-3 shrink-0"
          >
            Clear
          </button>
        )}
      </div>

      {/* Script list */}
      <div className="flex-1 overflow-y-auto">
        {segments.length === 0 && (
          <p className="text-center text-gray-400 text-sm pt-20">No segments.</p>
        )}
        {segments.map((seg) => {
          const isPlaying = seg.seq === activeSeq;
          const inSel = isInSelection(seg.seq);

          return (
            <div
              key={seg.id}
              ref={(el) => {
                if (el) segRefs.current.set(seg.seq, el);
                else segRefs.current.delete(seg.seq);
              }}
              onClick={() => handleTap(seg.seq)}
              className={`flex gap-3 px-5 py-3 border-b border-gray-50 cursor-pointer transition-colors ${
                isPlaying
                  ? "bg-indigo-100"
                  : inSel
                  ? "bg-indigo-50"
                  : "bg-white hover:bg-gray-50"
              }`}
            >
              {/* Seq + time */}
              <div className="shrink-0 pt-0.5 text-right w-12">
                <p
                  className={`text-xs font-mono font-bold ${
                    isPlaying ? "text-indigo-600" : inSel ? "text-indigo-400" : "text-gray-300"
                  }`}
                >
                  {seg.seq}
                </p>
                <p className="text-[10px] text-gray-300 tabular-nums">
                  {fmtMs(seg.start_ms)}
                </p>
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                {seg.speaker && (
                  <span
                    className={`text-xs font-semibold mr-1 ${
                      isPlaying ? "text-indigo-500" : "text-gray-400"
                    }`}
                  >
                    [{seg.speaker}]
                  </span>
                )}
                <span
                  className={`text-sm leading-relaxed ${
                    isPlaying
                      ? "text-gray-900 font-medium"
                      : inSel
                      ? "text-gray-700"
                      : "text-gray-600"
                  }`}
                >
                  {seg.text}
                </span>
              </div>

              {/* Playing indicator */}
              {isPlaying && (
                <div className="shrink-0 flex items-center gap-0.5 self-center">
                  {[1, 2, 3].map((b) => (
                    <div
                      key={b}
                      className="w-0.5 bg-indigo-500 rounded-full animate-pulse"
                      style={{
                        height: `${8 + b * 4}px`,
                        animationDelay: `${b * 0.15}s`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Apply button */}
      <div className="sticky bottom-0 px-5 pb-8 pt-3 bg-white border-t border-gray-100 shrink-0">
        <button
          onClick={handleApply}
          className="w-full bg-indigo-600 text-white rounded-2xl py-3.5 font-semibold text-sm"
        >
          Apply — {selLabel}
        </button>
      </div>
    </div>
  );
}
