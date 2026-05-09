import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { getTrack } from "../../api/content";
import { getExercise, startSession } from "../../api/session";
import type { Segment } from "../../types";

function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function TrackPage() {
  const { id } = useParams<{ id: string }>();
  const trackId = Number(id);
  const navigate = useNavigate();

  // selection: null | [startSeq] | [startSeq, endSeq]
  const [sel, setSel] = useState<number[]>([]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["track", trackId],
    queryFn: () => getTrack(trackId),
    enabled: !!trackId,
  });

  const exQuery = useQuery({
    queryKey: ["exercise", trackId],
    queryFn: () => getExercise(trackId),
    enabled: !!trackId,
  });

  const startMut = useMutation({
    mutationFn: ({
      exerciseId,
      from,
      to,
    }: {
      exerciseId: number;
      from?: number;
      to?: number;
    }) => startSession(exerciseId, from, to),
    onSuccess: (session) => navigate(`/tracks/${trackId}/session`, { state: { sessionId: session.id } }),
  });

  const handleSegmentTap = (seq: number) => {
    if (sel.length === 0) {
      setSel([seq]);
    } else if (sel.length === 1) {
      if (sel[0] === seq) {
        setSel([]);
      } else {
        const [a] = sel;
        setSel([Math.min(a, seq), Math.max(a, seq)]);
      }
    } else {
      // third tap resets
      setSel([seq]);
    }
  };

  const isSelected = (seg: Segment) => {
    if (sel.length === 0) return false;
    if (sel.length === 1) return seg.seq === sel[0];
    return seg.seq >= sel[0] && seg.seq <= sel[1];
  };

  const handleStart = (lockSelection: boolean) => {
    if (!exQuery.data) return;
    const exerciseId = exQuery.data.id;
    if (lockSelection && sel.length > 0) {
      const from = sel[0];
      const to = sel.length === 2 ? sel[1] : sel[0];
      startMut.mutate({ exerciseId, from, to });
    } else {
      startMut.mutate({ exerciseId });
    }
  };

  const segments = data?.segments ?? [];
  const hasSelection = sel.length > 0;

  return (
    <div className="flex flex-col h-full min-h-screen">
      {/* Header */}
      <div className="px-6 pt-14 pb-3 border-b border-gray-100">
        <button
          onClick={() => navigate(-1)}
          className="text-indigo-500 text-sm font-medium mb-3 flex items-center gap-1"
        >
          ← Back
        </button>
        {data && (
          <>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">{data.title}</h1>
            {data.description && (
              <p className="text-gray-400 text-sm mt-1">{data.description}</p>
            )}
          </>
        )}
      </div>

      {/* Selection hint */}
      <div className="px-6 py-2 bg-indigo-50 text-indigo-600 text-xs">
        {sel.length === 0 && "Tap a segment to select a range, or play all."}
        {sel.length === 1 && `Segment ${sel[0]} selected — tap another to set range end.`}
        {sel.length === 2 && `Range: segments ${sel[0]}–${sel[1]}`}
      </div>

      {/* Segment list */}
      <div className="flex-1 overflow-y-auto pb-28">
        {isLoading && (
          <div className="flex justify-center pt-20">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {isError && (
          <p className="text-center text-red-400 pt-20 text-sm">Failed to load track.</p>
        )}
        {segments.map((seg) => {
          const active = isSelected(seg);
          return (
            <button
              key={seg.id}
              onClick={() => handleSegmentTap(seg.seq)}
              className={`w-full flex items-center gap-4 px-6 py-3 border-b border-gray-50 text-left transition-colors ${
                active ? "bg-indigo-50" : "bg-white"
              }`}
            >
              <span
                className={`text-xs font-mono w-6 text-center shrink-0 ${
                  active ? "text-indigo-500 font-bold" : "text-gray-300"
                }`}
              >
                {seg.seq}
              </span>
              <span className={`text-xs ${active ? "text-indigo-600" : "text-gray-400"}`}>
                {fmtMs(seg.start_ms)} – {fmtMs(seg.end_ms)}
              </span>
              {seg.speaker && (
                <span className="text-xs text-gray-300 ml-auto shrink-0">{seg.speaker}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom action bar */}
      <div className="sticky bottom-0 px-6 pb-8 pt-4 bg-white border-t border-gray-100">
        {startMut.isError && (
          <p className="text-red-500 text-xs text-center mb-2">Failed to start session.</p>
        )}
        <div className="flex gap-3">
          {hasSelection && (
            <button
              onClick={() => handleStart(true)}
              disabled={startMut.isPending || !exQuery.data}
              className="flex-1 bg-indigo-600 text-white rounded-2xl py-3.5 font-semibold text-sm disabled:opacity-50"
            >
              {startMut.isPending ? "..." : "Play Selected"}
            </button>
          )}
          <button
            onClick={() => handleStart(false)}
            disabled={startMut.isPending || !exQuery.data}
            className={`${hasSelection ? "flex-1" : "w-full"} border border-indigo-600 text-indigo-600 rounded-2xl py-3.5 font-semibold text-sm disabled:opacity-50`}
          >
            {startMut.isPending ? "..." : "Play All"}
          </button>
        </div>
      </div>
    </div>
  );
}
