import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTrack } from "../../api/content";
import { getAudioToken, getExercise, startSession } from "../../api/session";
import {
  getCachedBlob,
  getCachedJson,
  setCachedBlob,
  setCachedJson,
  setCachedAudioMeta,
  isAudioCached,
} from "../../utils/cache";
import {
  type PracticeConfig,
  loadConfig,
  patchConfig,
} from "../../store/practiceStore";
import type { Segment, Track } from "../../types";
import { AudioTab, type AutoAdvance } from "./AudioTab";
import { PracticeTab } from "./PracticeTab";

type Tab = "audio" | "practice";
type PlayerState = "loading" | "ready" | "error" | "track_done" | "all_done";

export function PlayerPage() {
  const navigate = useNavigate();

  const [config, setConfig] = useState<PracticeConfig | null>(null);
  const [tab, setTab] = useState<Tab>("audio");
  const [autoAdvance, setAutoAdvance] = useState<AutoAdvance>("off");
  const [playerState, setPlayerState] = useState<PlayerState>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const [audioUrl, setAudioUrl] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [track, setTrack] = useState<(Track & { segments: Segment[] }) | null>(null);

  const [downloadStatus, setDownloadStatus] = useState<"idle" | "downloading" | "downloaded">("idle");
  const [downloadError, setDownloadError] = useState("");

  const audioRef = useRef<HTMLAudioElement>(null);
  const configRef = useRef<PracticeConfig | null>(null);
  const autoAdvanceRef = useRef<AutoAdvance>("off");

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { autoAdvanceRef.current = autoAdvance; }, [autoAdvance]);

  useEffect(() => {
    if (!track || !config) return;
    const trackId = config.trackQueue[config.trackIndex];
    const audioKey = `a:${trackId}`;
    isAudioCached(audioKey).then((cached) => {
      setDownloadStatus(cached ? "downloaded" : "idle");
    });
  }, [track, config]);

  const rangeStartMs = useMemo(() => {
    const segs = track?.segments ?? [];
    if (!segs.length) return 0;
    if (config?.segFrom != null)
      return segs.find((s) => s.seq === config.segFrom)?.start_ms ?? segs[0].start_ms;
    return segs[0].start_ms;
  }, [track, config?.segFrom]);

  const rangeEndMs = useMemo(() => {
    const segs = track?.segments ?? [];
    if (!segs.length) return 0;
    if (config?.segTo != null)
      return segs.find((s) => s.seq === config.segTo)?.end_ms ?? segs[segs.length - 1].end_ms;
    return segs[segs.length - 1].end_ms;
  }, [track, config?.segTo]);

  useEffect(() => {
    if (playerState !== "ready") audioRef.current?.pause();
  }, [playerState]);

  const initSession = useCallback(async (cfg: PracticeConfig) => {
    const trackId = cfg.trackQueue[cfg.trackIndex];
    setPlayerState("loading");
    setErrorMsg("");
    setSessionId(null);
    setTrack(null);
    try {
      type TrackWithSegments = Track & { segments: Segment[] };
      const trackKey = `t:${trackId}`;
      const audioKey = `a:${trackId}`;

      let trackData: TrackWithSegments;
      try {
        const [fresh, exercise] = await Promise.all([
          getTrack(trackId),
          getExercise(trackId),
        ]);
        trackData = fresh as TrackWithSegments;
        await setCachedJson(trackKey, trackData);
        setTrack(trackData);

        const session = await startSession(
          exercise.id,
          cfg.segFrom ?? undefined,
          cfg.segTo ?? undefined
        );
        setSessionId(session.id);
      } catch {
        const cached = await getCachedJson<TrackWithSegments>(trackKey);
        if (!cached) throw new Error("offline-no-cache");
        trackData = cached;
        setTrack(trackData);
      }

      let blob = await getCachedBlob(audioKey);
      if (!blob) {
        const token = await getAudioToken(trackId);
        const base  = import.meta.env.VITE_API_URL ?? "";
        const resp  = await fetch(base + token.url, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });
        blob = await resp.blob();
      }
      setAudioBlob(blob);
      setAudioUrl(URL.createObjectURL(blob));
      setPlayerState("ready");
    } catch {
      setErrorMsg("Failed to load. Please check your connection.");
      setPlayerState("error");
    }
  }, []);

  useEffect(() => {
    const cfg = loadConfig();
    if (!cfg || cfg.trackQueue.length === 0) {
      navigate("/setup", { replace: true });
      return;
    }
    setConfig(cfg);
    initSession(cfg);
  }, []); // eslint-disable-line

  // ── Navigation ─────────────────────────────────────────────────────────
  const handleNext = useCallback(() => {
    const cfg = configRef.current;
    if (!cfg) return;
    const total = cfg.trackQueue.length;
    let nextIndex: number;
    if (autoAdvanceRef.current === "shuffle") {
      if (total === 1) {
        nextIndex = 0;
      } else {
        do { nextIndex = Math.floor(Math.random() * total); }
        while (nextIndex === cfg.trackIndex);
      }
    } else {
      if (cfg.trackIndex >= total - 1) { setPlayerState("all_done"); return; }
      nextIndex = cfg.trackIndex + 1;
    }
    const next: PracticeConfig = { ...cfg, trackIndex: nextIndex, segFrom: null, segTo: null };
    patchConfig(next);
    setConfig(next);
    setTab("audio");
    initSession(next);
  }, [initSession]);

  const handlePrev = useCallback(() => {
    const cfg = configRef.current;
    if (!cfg || cfg.trackIndex === 0) return;
    const next: PracticeConfig = { ...cfg, trackIndex: cfg.trackIndex - 1, segFrom: null, segTo: null };
    patchConfig(next);
    setConfig(next);
    setTab("audio");
    initSession(next);
  }, [initSession]);

  const handleSessionComplete = () => {
    if (autoAdvance !== "off") handleNext();
    else setPlayerState("track_done");
  };

  const handleSwitchTab = (t: Tab) => {
    if (t === "practice") audioRef.current?.pause();
    setTab(t);
  };

  const handleRangeChange = async (from: number | null, to: number | null) => {
    if (!config) return;
    const next: PracticeConfig = { ...config, segFrom: from, segTo: to };
    patchConfig(next);
    setConfig(next);
    await initSession(next);
  };

  const handleDownloadAudio = useCallback(async () => {
    if (!track || !audioBlob || !config) return;
    setDownloadStatus("downloading");
    setDownloadError("");
    try {
      const trackId = config.trackQueue[config.trackIndex];
      const audioKey = `a:${trackId}`;
      const blobSaved = await setCachedBlob(audioKey, audioBlob);
      if (!blobSaved) {
        setDownloadError("Failed to save audio");
        setDownloadStatus("idle");
        return;
      }
      const metaSaved = await setCachedAudioMeta(audioKey, { trackId, title: track.title });
      if (!metaSaved) {
        setDownloadError("Failed to save metadata");
        setDownloadStatus("idle");
        return;
      }
      setDownloadStatus("downloaded");
    } catch (err) {
      setDownloadError("Failed to download");
      setDownloadStatus("idle");
    }
  }, [track, audioBlob, config]);

  const logout = () => {
    localStorage.removeItem("user_token");
    navigate("/login");
  };

  if (!config) return null;

  const trackTotal = config.trackQueue.length;

  return (
    <div className="flex flex-col h-full min-h-screen">
      {audioUrl && (
        <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" />
      )}

      {/* Header */}
      <div className="px-5 pt-12 pb-0 bg-white shrink-0">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => navigate("/setup")}
            className="text-xs text-indigo-500 font-medium truncate max-w-[50%]"
          >
            ← {config.categoryName}
          </button>
          <div className="flex items-center gap-2">
            {playerState === "ready" && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDownloadAudio}
                  disabled={downloadStatus === "downloading"}
                  title={
                    downloadStatus === "downloading"
                      ? "Downloading..."
                      : downloadStatus === "downloaded"
                        ? "Downloaded"
                        : "Download for offline"
                  }
                  className={`text-lg ${
                    downloadStatus === "downloaded"
                      ? "text-green-600"
                      : "text-gray-400 hover:text-indigo-600"
                  } disabled:opacity-50`}
                >
                  {downloadStatus === "downloading" ? "⏳" : downloadStatus === "downloaded" ? "✓" : "⬇️"}
                </button>
                {downloadError && (
                  <div className="text-xs text-red-500">{downloadError}</div>
                )}
              </div>
            )}
            <button onClick={logout} className="text-xs text-gray-400">
              Logout
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {(["audio", "practice"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => handleSwitchTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-gray-400"
              }`}
            >
              {t === "audio" ? "Audio" : "Practice"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative overflow-hidden">
        {playerState === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

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

        {playerState === "track_done" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 gap-6 bg-gray-50">
            <div className="text-center">
              <div className="text-4xl mb-3">✓</div>
              <p className="text-lg font-bold text-gray-900 mb-1">Track Complete!</p>
              <p className="text-gray-400 text-sm truncate max-w-[280px]">{track?.title}</p>
            </div>
            <div className="flex flex-col gap-3 w-full">
              {config.trackIndex < trackTotal - 1 ? (
                <button
                  onClick={handleNext}
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
                onClick={() => config && initSession(config)}
                className="w-full border border-gray-200 text-gray-600 rounded-2xl py-3.5 font-semibold text-sm"
              >
                Practice Again
              </button>
            </div>
          </div>
        )}

        {playerState === "all_done" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center gap-6 bg-gray-50">
            <div>
              <div className="text-5xl mb-4">🎉</div>
              <p className="text-xl font-bold text-gray-900 mb-2">All Done!</p>
              <p className="text-gray-400 text-sm">
                You've completed all {trackTotal} selected track{trackTotal > 1 ? "s" : ""}.
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

        {playerState === "ready" && track && (
          <>
            <div className={`absolute inset-0 overflow-hidden ${tab !== "audio" ? "hidden" : ""}`}>
              <AudioTab
                audioRef={audioRef}
                track={track}
                segFrom={config.segFrom}
                segTo={config.segTo}
                trackIndex={config.trackIndex}
                trackTotal={trackTotal}
                isActive={tab === "audio"}
                autoAdvance={autoAdvance}
                onSetAutoAdvance={setAutoAdvance}
                onPrev={handlePrev}
                onNext={handleNext}
                onRangeChange={handleRangeChange}
              />
            </div>
            {sessionId && (
              <div className={`absolute inset-0 overflow-hidden ${tab !== "practice" ? "hidden" : ""}`}>
                <PracticeTab
                  key={sessionId}
                  sessionId={sessionId}
                  audioRef={audioRef}
                  rangeStartMs={rangeStartMs}
                  rangeEndMs={rangeEndMs}
                  onComplete={handleSessionComplete}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
