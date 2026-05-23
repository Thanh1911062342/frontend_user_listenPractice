import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getCategoryBySlug, getTrack } from "../../api/content";
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
import { AudioTab, type AutoAdvance } from "../../shared/AudioTab";
import { MiniAudioPlayer } from "../../shared/MiniAudioPlayer";
import { TrackListSelector } from "../../shared/TrackListSelector";
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

  // List view state
  const [view, setView] = useState<"audio" | "list">("audio");
  const [listSelectedIds, setListSelectedIds] = useState<number[]>([]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const configRef = useRef<PracticeConfig | null>(null);
  const autoAdvanceRef = useRef<AutoAdvance>("off");

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { autoAdvanceRef.current = autoAdvance; }, [autoAdvance]);

  // Fetch tracks for current category (used in list view)
  const categoryQuery = useQuery({
    queryKey: ["category", config?.categorySlug],
    queryFn: () => getCategoryBySlug(config!.categorySlug),
    enabled: !!config && view === "list",
  });

  // Sync listSelectedIds with current trackQueue when entering list view
  useEffect(() => {
    if (view === "list" && config) {
      setListSelectedIds(config.trackQueue);
    }
  }, [view, config]);

  useEffect(() => {
    if (!track || !config) return;
    const trackId = config.trackQueue[config.trackIndex];
    isAudioCached(trackId).then((cached) => {
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
      console.log("[Player] Cached blob:", blob);
      if (!blob) {
        console.log("[Player] No cached blob, fetching audio...");
        const token = await getAudioToken(trackId);
        console.log("[Player] Got token:", token);
        const base  = import.meta.env.VITE_API_URL ?? "";
        console.log("[Player] Base URL:", base, "token.url:", token.url);
        const resp  = await fetch(base + token.url, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });
        console.log("[Player] Fetch response:", resp.status, resp.ok);
        if (!resp.ok) throw new Error(`Audio fetch failed: ${resp.status}`);
        blob = await resp.blob();
        console.log("[Player] Got blob:", blob, "size:", blob?.size, "bytes");
      }
      console.log("[Player] Before createObjectURL, blob:", blob, typeof blob);
      if (!blob) throw new Error("blob is null");
      setAudioBlob(blob);
      setAudioUrl(URL.createObjectURL(blob));
      setPlayerState("ready");
    } catch (err) {
      console.error("[Player] initSession error:", err);
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
      console.log(`[Player] Downloading track ${trackId}, size: ${audioBlob.size} bytes`);
      const blobSaved = await setCachedBlob(audioKey, audioBlob);
      console.log(`[Player] Blob saved: ${blobSaved}`);
      if (!blobSaved) {
        setDownloadError("Failed to save audio");
        setDownloadStatus("idle");
        return;
      }
      const metaSaved = await setCachedAudioMeta(trackId, { title: track.title });
      console.log(`[Player] Metadata saved: ${metaSaved}`);
      if (!metaSaved) {
        setDownloadError("Failed to save metadata");
        setDownloadStatus("idle");
        return;
      }
      console.log(`[Player] Download complete for track ${trackId}`);
      setDownloadStatus("downloaded");
    } catch (err) {
      console.error("[Player] Download error:", err);
      setDownloadError("Failed to download");
      setDownloadStatus("idle");
    }
  }, [track, audioBlob, config]);

  const logout = () => {
    localStorage.removeItem("user_token");
    navigate("/login");
  };

  // List view handlers
  const toggleListTrack = (id: number) =>
    setListSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleApplyList = () => {
    if (listSelectedIds.length === 0 || !config) return;
    const sameQueue =
      listSelectedIds.length === config.trackQueue.length &&
      listSelectedIds.every((id, i) => id === config.trackQueue[i]);
    if (sameQueue) {
      setView("audio");
      return;
    }
    const next: PracticeConfig = {
      ...config,
      trackQueue: listSelectedIds,
      trackIndex: 0,
      segFrom: null,
      segTo: null,
    };
    patchConfig(next);
    setConfig(next);
    setTab("audio");
    setView("audio");
    initSession(next);
  };

  if (!config) return null;

  const trackTotal = config.trackQueue.length;

  // Single audio element shared across views
  const audioElement = audioUrl && (
    <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" />
  );

  // ── List view ─────────────────────────────────────────────────────────
  if (view === "list") {
    const categoryTracks = categoryQuery.data?.tracks ?? [];
    return (
      <div className="flex flex-col h-full min-h-screen bg-gray-50">
        {audioElement}

        {/* Top bar with back button */}
        <div className="bg-white px-6 pt-12 pb-2 shrink-0">
          <button
            onClick={() => navigate("/setup")}
            className="text-indigo-500 text-sm font-medium flex items-center gap-1"
          >
            ‹ Categories
          </button>
        </div>

        {/* Mini player below back button */}
        <MiniAudioPlayer
          audioRef={audioRef}
          title={track?.title}
          trackIndex={config.trackIndex}
          trackTotal={config.trackQueue.length}
          onPrev={handlePrev}
          onNext={handleNext}
          onExpand={() => setView("audio")}
        />

        {/* Header info */}
        <div className="bg-white px-6 pt-3 pb-4 border-b border-gray-100">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{config.categoryName}</h1>
              <p className="text-gray-400 text-sm mt-0.5">
                {listSelectedIds.length === 0
                  ? "Select tracks to practice"
                  : `${listSelectedIds.length} track${listSelectedIds.length > 1 ? "s" : ""} selected`}
              </p>
            </div>
            {categoryTracks.length > 1 && (
              <button
                onClick={() =>
                  setListSelectedIds(
                    listSelectedIds.length === categoryTracks.length ? [] : categoryTracks.map((t) => t.id)
                  )
                }
                className="text-sm text-indigo-500 font-medium pb-1 shrink-0"
              >
                {listSelectedIds.length === categoryTracks.length ? "Clear all" : "Select all"}
              </button>
            )}
          </div>
        </div>

        {/* Tracks list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 pb-36 space-y-2">
          {categoryQuery.isLoading && (
            <div className="flex justify-center pt-20">
              <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <TrackListSelector
            items={[...categoryTracks].sort((a, b) => a.id - b.id).map((t) => ({
              id: t.id,
              title: t.title,
              description: t.description ?? undefined,
            }))}
            selectedIds={listSelectedIds}
            onToggle={toggleListTrack}
          />
        </div>

        {/* Apply button */}
        <div className="sticky bottom-0 px-5 pb-10 pt-3 bg-white border-t border-gray-100">
          <button
            onClick={handleApplyList}
            disabled={listSelectedIds.length === 0}
            className="w-full bg-indigo-600 text-white rounded-2xl py-3.5 font-bold text-base disabled:opacity-40 transition-opacity"
          >
            {listSelectedIds.length === 0
              ? "Select tracks"
              : `Apply  ·  ${listSelectedIds.length} track${listSelectedIds.length > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    );
  }

  // ── Audio view ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-screen">
      {audioElement}

      {/* Header */}
      <div className="px-5 pt-12 pb-0 bg-white shrink-0">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setView("list")}
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
