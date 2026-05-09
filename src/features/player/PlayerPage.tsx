import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTrack } from "../../api/content";
import { getAudioToken, getExercise, startSession } from "../../api/session";
import {
  type PracticeConfig,
  loadConfig,
  patchConfig,
} from "../../store/practiceStore";
import type { Segment, Track } from "../../types";
import { PracticeTab } from "./PracticeTab";
import { ScriptTab } from "./ScriptTab";

type Tab = "practice" | "script";
type PlayerState = "loading" | "ready" | "error" | "track_done" | "all_done";

export function PlayerPage() {
  const navigate = useNavigate();

  const [config, setConfig] = useState<PracticeConfig | null>(null);
  const [tab, setTab] = useState<Tab>("practice");
  const [playerState, setPlayerState] = useState<PlayerState>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const [audioUrl, setAudioUrl] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [track, setTrack] = useState<(Track & { segments: Segment[] }) | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);

  const isLastTrack = config
    ? config.trackIndex >= config.trackQueue.length - 1
    : true;

  // Range start/end in ms computed from segments + config
  const rangeStartMs = useMemo(() => {
    const segs = track?.segments ?? [];
    if (!segs.length) return 0;
    if (config?.segFrom != null) {
      return segs.find((s) => s.seq === config.segFrom)?.start_ms ?? segs[0].start_ms;
    }
    return segs[0].start_ms;
  }, [track, config?.segFrom]);

  const rangeEndMs = useMemo(() => {
    const segs = track?.segments ?? [];
    if (!segs.length) return 0;
    if (config?.segTo != null) {
      return segs.find((s) => s.seq === config.segTo)?.end_ms ?? segs[segs.length - 1].end_ms;
    }
    return segs[segs.length - 1].end_ms;
  }, [track, config?.segTo]);

  // Pause audio when leaving "ready" state
  useEffect(() => {
    if (playerState !== "ready") audioRef.current?.pause();
  }, [playerState]);

  // ── Init session ───────────────────────────────────────────────────────
  const initSession = useCallback(async (cfg: PracticeConfig) => {
    const trackId = cfg.trackQueue[cfg.trackIndex];
    setPlayerState("loading");
    setErrorMsg("");
    setSessionId(null);
    setTrack(null);

    try {
      const [trackData, token, exercise] = await Promise.all([
        getTrack(trackId),
        getAudioToken(trackId),
        getExercise(trackId),
      ]);
      setTrack(trackData);
      setAudioUrl(token.url);
      const session = await startSession(
        exercise.id,
        cfg.segFrom ?? undefined,
        cfg.segTo ?? undefined
      );
      setSessionId(session.id);
      setPlayerState("ready");
    } catch {
      setErrorMsg("Failed to load. Please check your connection.");
      setPlayerState("error");
    }
  }, []);

  // On mount: load config
  useEffect(() => {
    const cfg = loadConfig();
    if (!cfg || cfg.trackQueue.length === 0) {
      navigate("/setup", { replace: true });
      return;
    }
    setConfig(cfg);
    initSession(cfg);
  }, []); // eslint-disable-line

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleSessionComplete = () => setPlayerState("track_done");

  const handleNextTrack = () => {
    if (!config || isLastTrack) return;
    const next: PracticeConfig = {
      ...config,
      trackIndex: config.trackIndex + 1,
      segFrom: null,
      segTo: null,
    };
    patchConfig(next);
    setConfig(next);
    initSession(next);
  };

  const handlePracticeAgain = () => {
    if (config) initSession(config);
  };

  const handleRangeChange = async (from: number | null, to: number | null) => {
    if (!config) return;
    const next: PracticeConfig = { ...config, segFrom: from, segTo: to };
    patchConfig(next);
    setConfig(next);
    setTab("practice");
    await initSession(next);
  };

  const logout = () => {
    localStorage.removeItem("user_token");
    navigate("/login");
  };

  if (!config) return null;

  const trackTotal = config.trackQueue.length;
  const rangeLabel =
    config.segFrom != null
      ? config.segTo != null && config.segTo !== config.segFrom
        ? `Segments ${config.segFrom}–${config.segTo}`
        : `Segment ${config.segFrom}`
      : null;

  return (
    <div className="flex flex-col h-full min-h-screen">
      {/* Shared audio element — lives here so both tabs share it */}
      {audioUrl && (
        <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" />
      )}

      {/* Header */}
      <div className="px-5 pt-12 pb-0 bg-white shrink-0">
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={() => navigate("/setup")}
            className="text-xs text-indigo-500 font-medium truncate max-w-[70%]"
          >
            ← {config.categoryName}
          </button>
          <button onClick={logout} className="text-xs text-gray-400">
            Logout
          </button>
        </div>

        <div className="flex items-baseline gap-2 mb-0.5">
          <h2 className="text-base font-bold text-gray-900 truncate flex-1">
            {track?.title ?? "Loading…"}
          </h2>
          {trackTotal > 1 && (
            <span className="text-xs text-gray-400 shrink-0 tabular-nums">
              {config.trackIndex + 1}/{trackTotal}
            </span>
          )}
        </div>

        {rangeLabel && (
          <p className="text-xs text-indigo-400 mb-1">{rangeLabel}</p>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-100 mt-2">
          {(["practice", "script"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-gray-400"
              }`}
            >
              {t === "practice" ? "Practice" : "Script"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative overflow-hidden">
        {/* Loading */}
        {playerState === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {playerState === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 gap-4 bg-gray-50">
            <p className="text-red-500 text-sm text-center">{errorMsg}</p>
            <button
              onClick={() => config && initSession(config)}
              className="text-indigo-500 text-sm font-medium"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Track done */}
        {playerState === "track_done" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 gap-6 bg-gray-50">
            <div className="text-center">
              <div className="text-4xl mb-3">✓</div>
              <p className="text-lg font-bold text-gray-900 mb-1">Track Complete!</p>
              <p className="text-gray-400 text-sm truncate max-w-[280px]">
                {track?.title}
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full">
              {!isLastTrack ? (
                <button
                  onClick={handleNextTrack}
                  className="w-full bg-indigo-600 text-white rounded-2xl py-3.5 font-semibold"
                >
                  Next Track →
                </button>
              ) : (
                <button
                  onClick={() => setPlayerState("all_done")}
                  className="w-full bg-indigo-600 text-white rounded-2xl py-3.5 font-semibold"
                >
                  Finish
                </button>
              )}
              <button
                onClick={handlePracticeAgain}
                className="w-full border border-gray-200 text-gray-600 rounded-2xl py-3.5 font-semibold text-sm"
              >
                Practice Again
              </button>
            </div>
          </div>
        )}

        {/* All done */}
        {playerState === "all_done" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center gap-6 bg-gray-50">
            <div>
              <div className="text-5xl mb-4">🎉</div>
              <p className="text-xl font-bold text-gray-900 mb-2">All Done!</p>
              <p className="text-gray-400 text-sm">
                You've completed all {trackTotal} selected track
                {trackTotal > 1 ? "s" : ""}.
              </p>
            </div>
            <button
              onClick={() => navigate("/setup")}
              className="bg-indigo-600 text-white rounded-2xl px-8 py-3.5 font-semibold"
            >
              Start New Session
            </button>
          </div>
        )}

        {/* Tab content — both mounted, one hidden to preserve state */}
        {playerState === "ready" && sessionId && audioUrl && (
          <>
            <div
              className={`absolute inset-0 overflow-hidden ${
                tab !== "practice" ? "hidden" : ""
              }`}
            >
              <PracticeTab
                key={sessionId}
                sessionId={sessionId}
                audioRef={audioRef}
                rangeStartMs={rangeStartMs}
                rangeEndMs={rangeEndMs}
                onComplete={handleSessionComplete}
              />
            </div>
            <div
              className={`absolute inset-0 overflow-hidden ${
                tab !== "script" ? "hidden" : ""
              }`}
            >
              <ScriptTab
                segments={track?.segments ?? []}
                segFrom={config.segFrom}
                segTo={config.segTo}
                audioRef={audioRef}
                isActive={tab === "script"}
                onRangeChange={handleRangeChange}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
