import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getAudioToken, getCurrentQuestion, nextQuestion, submitAnswer } from "../../api/session";
import type { AnswerResult, Question } from "../../types";

type Phase =
  | "loading"
  | "awaiting_play"
  | "playing"
  | "input"
  | "result"
  | "done";

interface BlankPart {
  kind: "text" | "blank";
  text?: string;
  index?: number;
}

function parseDisplayText(display: string): BlankPart[] {
  const parts: BlankPart[] = [];
  let blankIdx = 0;
  const chunks = display.split(/(＿+)/);
  for (const chunk of chunks) {
    if (/^＿+$/.test(chunk)) {
      parts.push({ kind: "blank", index: blankIdx++ });
    } else if (chunk) {
      parts.push({ kind: "text", text: chunk });
    }
  }
  return parts;
}

export function SessionPage() {
  const { id: trackId } = useParams<{ id: string }>();
  const { state } = useLocation() as { state: { sessionId: number } | null };
  const navigate = useNavigate();

  const sessionId = state?.sessionId;

  const [phase, setPhase] = useState<Phase>("loading");
  const [question, setQuestion] = useState<Question | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [textInput, setTextInput] = useState("");
  const [blankInputs, setBlankInputs] = useState<string[]>([]);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const endTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  // ── Load first question + audio token ──────────────────────────────────
  useEffect(() => {
    if (!sessionId || !trackId) {
      navigate("/", { replace: true });
      return;
    }
    Promise.all([
      getCurrentQuestion(sessionId),
      getAudioToken(Number(trackId)),
    ])
      .then(([q, token]) => {
        setQuestion(q);
        setAudioUrl(token.url);
        initForQuestion(q);
        setPhase("awaiting_play");
      })
      .catch(() => setError("Failed to load exercise."));
  }, []); // eslint-disable-line

  const initForQuestion = (q: Question) => {
    setTextInput("");
    setResult(null);
    setError("");
    if (q.blank_count) {
      setBlankInputs(Array(q.blank_count).fill(""));
    } else {
      setBlankInputs([]);
    }
    startTimeRef.current = q.audio_start_ms / 1000;
    endTimeRef.current = q.audio_end_ms / 1000;
  };

  // ── Audio time monitoring ───────────────────────────────────────────────
  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.currentTime >= endTimeRef.current) {
      audio.pause();
      if (phase === "playing") setPhase("input");
    }
  }, [phase]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.addEventListener("timeupdate", handleTimeUpdate);
    return () => audio.removeEventListener("timeupdate", handleTimeUpdate);
  }, [handleTimeUpdate]);

  // ── Play ───────────────────────────────────────────────────────────────
  const play = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    audio.currentTime = startTimeRef.current;
    audio.play();
    setPhase("playing");
  };

  const replay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = startTimeRef.current;
    audio.play();
    setPhase("playing");
  };

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!question || !sessionId) return;
    setSubmitting(true);
    setError("");
    try {
      const userIn = question.type === "dictation" ? textInput : blankInputs.join(" ");
      const blanks = question.type === "fill_blank" ? blankInputs : undefined;
      const res = await submitAnswer(sessionId, question.id, userIn, blanks);
      setResult(res);
      setPhase("result");
    } catch {
      setError("Failed to submit. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Continue ───────────────────────────────────────────────────────────
  const handleContinue = async () => {
    if (!sessionId) return;
    setPhase("loading");
    try {
      const res = await nextQuestion(sessionId);
      if (res.completed || !res.question) {
        setPhase("done");
      } else {
        setQuestion(res.question);
        initForQuestion(res.question);
        setPhase("awaiting_play");
      }
    } catch {
      setError("Failed to advance.");
      setPhase("result");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (!sessionId) return null;

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">
      {/* Hidden audio element */}
      {audioUrl && (
        <audio ref={audioRef} src={audioUrl} preload="auto" />
      )}

      {/* Header */}
      <div className="px-6 pt-14 pb-4 bg-white border-b border-gray-100">
        <button
          onClick={() => navigate(`/tracks/${trackId}`)}
          className="text-indigo-500 text-sm font-medium mb-3 flex items-center gap-1"
        >
          ← Exit
        </button>
        {question && (
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
              <div
                className="bg-indigo-500 h-1.5 rounded-full transition-all"
                style={{ width: `${((question.order) / question.total) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 shrink-0">
              {question.order} / {question.total}
            </span>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-8">
        {/* Loading */}
        {phase === "loading" && (
          <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        )}

        {/* Error */}
        {error && (
          <p className="text-red-500 text-sm bg-red-50 rounded-xl px-4 py-3 text-center">{error}</p>
        )}

        {/* Done screen */}
        {phase === "done" && (
          <div className="text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Session Complete!</h2>
            <p className="text-gray-400 text-sm mb-8">Great job on finishing all questions.</p>
            <button
              onClick={() => navigate(`/tracks/${trackId}`)}
              className="bg-indigo-600 text-white rounded-2xl px-8 py-3.5 font-semibold"
            >
              Back to Track
            </button>
          </div>
        )}

        {/* Awaiting play */}
        {phase === "awaiting_play" && question && (
          <div className="flex flex-col items-center gap-6 w-full">
            <p className="text-gray-500 text-sm text-center">
              {question.type === "dictation"
                ? "Listen and type what you hear."
                : "Listen and fill in the blanks."}
            </p>
            <PlayButton onClick={play} />
          </div>
        )}

        {/* Playing */}
        {phase === "playing" && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center">
              <span className="text-2xl">🔊</span>
            </div>
            <p className="text-gray-400 text-sm">Playing…</p>
          </div>
        )}
      </div>

      {/* Bottom sheet — input phase */}
      {(phase === "input" || phase === "result") && question && (
        <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.08)] px-6 pt-6 pb-8 animate-slide-up">
          {/* Replay button always available */}
          <button
            onClick={replay}
            className="flex items-center gap-2 text-indigo-500 text-sm font-medium mb-5"
          >
            <span>↺</span> Replay
          </button>

          {/* Result banner */}
          {phase === "result" && result && (
            <div
              className={`rounded-2xl px-4 py-3 mb-4 text-sm ${
                result.is_correct
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-700"
              }`}
            >
              <p className="font-semibold mb-1">{result.is_correct ? "Correct!" : "Incorrect"}</p>
              <p className="font-mono text-xs leading-relaxed">{result.correct_text}</p>
            </div>
          )}

          {/* Input: dictation */}
          {question.type === "dictation" && phase === "input" && (
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type what you heard…"
              rows={3}
              autoFocus
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-base outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-gray-50 resize-none mb-4"
            />
          )}

          {/* Input: fill_blank */}
          {question.type === "fill_blank" && question.display_text && (
            <div className="mb-4">
              <div className="text-sm text-gray-700 leading-8 flex flex-wrap items-center gap-1">
                {parseDisplayText(question.display_text).map((part, i) => {
                  if (part.kind === "text") {
                    return <span key={i}>{part.text}</span>;
                  }
                  const idx = part.index!;
                  return (
                    <input
                      key={i}
                      value={blankInputs[idx] ?? ""}
                      onChange={(e) => {
                        const next = [...blankInputs];
                        next[idx] = e.target.value;
                        setBlankInputs(next);
                      }}
                      disabled={phase === "result"}
                      autoFocus={idx === 0}
                      className="border-b-2 border-indigo-400 bg-transparent text-indigo-800 text-sm text-center outline-none w-20 disabled:border-gray-300 disabled:text-gray-600"
                    />
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-500 text-xs mb-3">{error}</p>
          )}

          {/* Action buttons */}
          {phase === "input" && (
            <button
              onClick={handleSubmit}
              disabled={submitting || (question.type === "dictation" ? !textInput.trim() : blankInputs.every((b) => !b.trim()))}
              className="w-full bg-indigo-600 text-white rounded-2xl py-3.5 font-semibold text-base disabled:opacity-50"
            >
              {submitting ? "Checking…" : "Submit"}
            </button>
          )}

          {phase === "result" && result && (
            <div className="flex gap-3">
              {result.is_correct && !result.is_last && (
                <button
                  onClick={handleContinue}
                  className="flex-1 bg-indigo-600 text-white rounded-2xl py-3.5 font-semibold text-sm"
                >
                  Continue →
                </button>
              )}
              {result.is_correct && result.is_last && (
                <button
                  onClick={handleContinue}
                  className="flex-1 bg-indigo-600 text-white rounded-2xl py-3.5 font-semibold text-sm"
                >
                  Finish
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-20 h-20 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
    >
      <svg viewBox="0 0 24 24" fill="white" className="w-8 h-8 ml-1">
        <path d="M8 5v14l11-7z" />
      </svg>
    </button>
  );
}
