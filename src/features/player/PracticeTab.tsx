import { RefObject, useEffect, useRef, useState } from "react";
import { completeSession, getSessionQuestions, submitBatchAnswers } from "../../api/session";
import type { BatchQuestion, QuestionResult } from "../../types";

type Phase = "questions" | "results";

function parseDisplayText(display: string) {
  const parts: { kind: "text" | "blank"; text?: string; index?: number }[] = [];
  let idx = 0;
  for (const chunk of display.split(/(＿+)/)) {
    if (/^＿+$/.test(chunk)) {
      parts.push({ kind: "blank", index: idx++ });
    } else if (chunk) {
      parts.push({ kind: "text", text: chunk });
    }
  }
  return parts;
}

interface Props {
  sessionId: number;
  audioRef: RefObject<HTMLAudioElement>;
  rangeStartMs: number;
  rangeEndMs: number;
  onComplete: () => void;
}

export function PracticeTab({ sessionId, audioRef, rangeStartMs, rangeEndMs, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("questions");
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<BatchQuestion[]>([]);
  const [inputs, setInputs] = useState<Record<number, string[]>>({});
  const [results, setResults] = useState<Record<number, QuestionResult>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [isRangePlaying, setIsRangePlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const isRangePlayingRef = useRef(false);
  const isLoopingRef = useRef(false);

  // Load questions immediately on mount
  useEffect(() => {
    setLoading(true);
    getSessionQuestions(sessionId)
      .then((qs) => {
        setQuestions(qs);
        const init: Record<number, string[]> = {};
        for (const q of qs) init[q.id] = Array(q.blank_count ?? 1).fill("");
        setInputs(init);
      })
      .catch(() => setError("Failed to load questions."))
      .finally(() => setLoading(false));
  }, [sessionId]);

  // Stop range play when audio reaches end of range or file ends
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onUpdate = () => {
      if (isRangePlayingRef.current && a.currentTime * 1000 >= rangeEndMs) {
        if (isLoopingRef.current) {
          a.currentTime = rangeStartMs / 1000;
          a.play();
        } else {
          a.pause();
          isRangePlayingRef.current = false;
          setIsRangePlaying(false);
        }
      }
    };
    const onEnded = () => {
      isRangePlayingRef.current = false;
      setIsRangePlaying(false);
      setPlayingId(null);
    };
    a.addEventListener("timeupdate", onUpdate);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("timeupdate", onUpdate);
      a.removeEventListener("ended", onEnded);
    };
  }, [audioRef, rangeEndMs, rangeStartMs]);

  const toggleRangePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    setPlayingId(null);
    if (isRangePlayingRef.current) {
      a.pause();
      isRangePlayingRef.current = false;
      setIsRangePlaying(false);
    } else {
      a.currentTime = rangeStartMs / 1000;
      a.play();
      isRangePlayingRef.current = true;
      setIsRangePlaying(true);
    }
  };

  const toggleLoop = () => {
    const next = !isLoopingRef.current;
    isLoopingRef.current = next;
    setIsLooping(next);
  };

  const replaySegment = (startMs: number, endMs: number, qId: number) => {
    const a = audioRef.current;
    if (!a) return;
    // Stop range play if active
    isRangePlayingRef.current = false;
    setIsRangePlaying(false);
    setPlayingId(qId);
    a.currentTime = startMs / 1000;
    a.play();
    const stopAt = () => {
      if (a.currentTime * 1000 >= endMs) {
        a.pause();
        a.removeEventListener("timeupdate", stopAt);
        setPlayingId(null);
      }
    };
    a.addEventListener("timeupdate", stopAt);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const answers = questionItems.map((q) => ({
        question_id: q.id,
        blank_answers: inputs[q.id] ?? [""],
      }));
      const res = await submitBatchAnswers(sessionId, answers);
      const map: Record<number, QuestionResult> = {};
      for (const r of res.results) map[r.question_id] = r;
      setResults(map);
      setPhase("results");
    } catch {
      setError("Submit failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = async () => {
    try { await completeSession(sessionId); } catch { /* ignore */ }
    onComplete();
  };

  const questionItems = questions.filter((q) => q.is_question);
  const allCorrect = questionItems.length > 0 && questionItems.every((q) => results[q.id]?.is_correct);
  const correctCount = questionItems.filter((q) => results[q.id]?.is_correct).length;
  const canSubmit = questionItems.length > 0 && questionItems.some((q) =>
    (inputs[q.id] ?? []).some((v) => v.trim().length > 0)
  );

  return (
    <div className="flex flex-col h-[95%] bg-gray-50">
      {/* Header */}
      <div className="px-5 pt-3.5 pb-3 shrink-0 bg-white border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">
          {phase === "results"
            ? allCorrect ? "All correct!" : `${correctCount} / ${questionItems.length} correct`
            : "Fill in the blanks"}
        </p>
        <div className="flex items-center gap-2">
          {phase === "results" && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              allCorrect ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}>
              {allCorrect ? "Perfect" : "Results"}
            </span>
          )}
          {/* Loop toggle */}
          <button
            onClick={toggleLoop}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
              isLooping
                ? "bg-indigo-100 text-indigo-600"
                : "text-gray-400 hover:text-indigo-500"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <path d="M17 2l4 4-4 4" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <path d="M7 22l-4-4 4-4" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
          {/* Play / Stop full range */}
          <button
            onClick={toggleRangePlay}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
              isRangePlaying
                ? "bg-indigo-100 text-indigo-600"
                : "text-gray-400 hover:text-indigo-500"
            }`}
          >
            {isRangePlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                <rect x="6" y="6" width="12" height="12" rx="1.5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 ml-0.5">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Question list */}
      <div className="flex-1 overflow-y-auto bg-white divide-y divide-gray-50">
        {loading && (
          <div className="flex justify-center pt-16">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {error && !loading && (
          <p className="text-center text-red-400 text-sm pt-16">{error}</p>
        )}
        {!loading && questions.map((q, qi) => {
          const result = results[q.id];
          const isCorrect = result?.is_correct;
          const isWrong = result && !result.is_correct;
          const isPlaying = playingId === q.id;
          const rowInputs = inputs[q.id] ?? [""];

          // Non-question: show full dialogue as read-only
          if (!q.is_question) {
            return (
              <div key={q.id} className="flex items-start gap-2.5 px-4 py-3 bg-gray-50">
                <span className="text-xs font-mono text-gray-200 shrink-0 w-4 pt-2 text-right">
                  {qi + 1}
                </span>
                {q.speaker && (
                  <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded shrink-0 mt-1.5 font-mono">
                    {q.speaker}
                  </span>
                )}
                <p className="flex-1 text-sm text-gray-400 leading-8 min-w-0">
                  {q.display_text}
                </p>
                <button
                  onClick={() => replaySegment(q.audio_start_ms, q.audio_end_ms, q.id)}
                  className="shrink-0 pt-2 text-gray-200 hover:text-gray-400 transition-colors"
                >
                  {isPlaying ? (
                    <div className="flex items-end gap-0.5 w-4 h-4">
                      {[1, 2, 3].map((b) => (
                        <div
                          key={b}
                          className="w-0.5 bg-gray-400 rounded-full animate-pulse"
                          style={{ height: `${4 + b * 3}px`, animationDelay: `${b * 0.15}s` }}
                        />
                      ))}
                    </div>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
              </div>
            );
          }

          const parts = parseDisplayText(q.display_text ?? "＿＿＿");
          return (
            <div
              key={q.id}
              className={`flex items-start gap-2.5 px-4 py-3 ${
                isCorrect ? "bg-emerald-50" : isWrong ? "bg-rose-50" : ""
              }`}
            >
              {/* Seq */}
              <span className="text-xs font-mono text-gray-300 shrink-0 w-4 pt-2 text-right">
                {qi + 1}
              </span>

              {/* Speaker badge */}
              {q.speaker && (
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0 mt-1.5 font-mono">
                  {q.speaker}
                </span>
              )}

              {/* Content with blanks */}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-800 leading-8 flex flex-wrap items-center gap-x-0.5">
                  {parts.map((part, i) => {
                    if (part.kind === "text") return <span key={i}>{part.text}</span>;
                    const idx = part.index!;
                    return (
                      <input
                        key={i}
                        value={rowInputs[idx] ?? ""}
                        onChange={(e) => {
                          if (isCorrect) return;
                          const next = [...rowInputs];
                          next[idx] = e.target.value;
                          setInputs((prev) => ({ ...prev, [q.id]: next }));
                        }}
                        disabled={!!isCorrect}
                        placeholder="　　"
                        className={`border-b-2 bg-transparent text-center text-sm outline-none min-w-[60px] max-w-[160px] px-1 transition-colors ${
                          isCorrect
                            ? "border-emerald-400 text-emerald-700 disabled:opacity-100"
                            : isWrong
                            ? "border-rose-400 focus:border-rose-500"
                            : "border-indigo-300 focus:border-indigo-500"
                        }`}
                        style={{ width: `${Math.max(60, (rowInputs[idx]?.length ?? 3) * 15)}px` }}
                      />
                    );
                  })}
                </div>
                {isWrong && result.correct_text && (
                  <p className="text-xs text-rose-500 mt-0.5 leading-relaxed">
                    {result.correct_text}
                  </p>
                )}
              </div>

              {/* Per-segment play / playing icon */}
              <button
                onClick={() => replaySegment(q.audio_start_ms, q.audio_end_ms, q.id)}
                className="shrink-0 pt-2 text-gray-300 hover:text-indigo-400 transition-colors"
              >
                {isPlaying ? (
                  <div className="flex items-end gap-0.5 w-4 h-4">
                    {[1, 2, 3].map((b) => (
                      <div
                        key={b}
                        className="w-0.5 bg-indigo-500 rounded-full animate-pulse"
                        style={{ height: `${4 + b * 3}px`, animationDelay: `${b * 0.15}s` }}
                      />
                    ))}
                  </div>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Bottom actions */}
      <div className="px-5 pb-8 pt-3 bg-white border-t border-gray-100 shrink-0">
        {error && phase === "questions" && (
          <p className="text-red-500 text-xs mb-2 text-center">{error}</p>
        )}
        {phase === "questions" && (
          <button
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            className="w-full bg-indigo-600 text-white rounded-2xl py-3.5 font-bold text-sm disabled:opacity-40"
          >
            {submitting ? "Checking…" : "Check answers"}
          </button>
        )}
        {phase === "results" && (
          <div className="flex gap-3">
            {!allCorrect && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 border-2 border-indigo-500 text-indigo-600 rounded-2xl py-3.5 font-bold text-sm disabled:opacity-40"
              >
                {submitting ? "Checking…" : "Resubmit"}
              </button>
            )}
            <button
              onClick={handleDone}
              className={`${allCorrect ? "w-full" : "flex-1"} bg-indigo-600 text-white rounded-2xl py-3.5 font-bold text-sm`}
            >
              {allCorrect ? "Done ✓" : "Finish"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
