import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTrack } from "../../api/content";
import { getAudioToken } from "../../api/session";
import { AudioTab, type AutoAdvance } from "../../shared/AudioTab";
import { MiniAudioPlayer } from "../../shared/MiniAudioPlayer";
import { TrackListSelector } from "../../shared/TrackListSelector";
import {
  listCachedAudio,
  deleteCachedAudio,
  setCachedBlob,
  setCachedJson,
  getCachedBlob,
  getCachedJson,
  setCachedAudioMeta,
  type CachedAudioInfo,
} from "../../utils/cache";
import type { Segment, Track } from "../../types";

interface OfflineItem extends CachedAudioInfo {
  hasUpdate?: boolean;
}

type PlayerState = "loading" | "ready" | "error" | "track_done" | "all_done";

export function OfflinePage() {
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [offlineItems, setOfflineItems] = useState<OfflineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [view, setView] = useState<"audio" | "list">("list");

  // Playback state
  const [trackQueue, setTrackQueue] = useState<number[]>([]);
  const [trackIndex, setTrackIndex] = useState(0);
  const [audioUrl, setAudioUrl] = useState("");
  const [track, setTrack] = useState<(Track & { segments: Segment[] }) | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [autoAdvance, setAutoAdvance] = useState<AutoAdvance>("off");

  const trackQueueRef = useRef<number[]>([]);
  const trackIndexRef = useRef(0);
  const autoAdvanceRef = useRef<AutoAdvance>("off");

  useEffect(() => { trackQueueRef.current = trackQueue; }, [trackQueue]);
  useEffect(() => { trackIndexRef.current = trackIndex; }, [trackIndex]);
  useEffect(() => { autoAdvanceRef.current = autoAdvance; }, [autoAdvance]);

  useEffect(() => {
    loadOfflineItems();
  }, []);

  const loadOfflineItems = async () => {
    setIsLoading(true);
    try {
      const cached = await listCachedAudio();
      const items: OfflineItem[] = [];

      for (const item of cached) {
        try {
          const t = await getTrack(item.trackId);
          const trackUpdatedAt = new Date(t.updated_at).getTime();
          items.push({
            ...item,
            hasUpdate: trackUpdatedAt > item.cachedAtMs,
          });
        } catch {
          items.push({ ...item, hasUpdate: false });
        }
      }
      setOfflineItems(items);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTrack = (id: number) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const toggleAll = () =>
    setSelectedIds(selectedIds.length === offlineItems.length ? [] : offlineItems.map((t) => t.trackId));

  const allSelected = offlineItems.length > 0 && selectedIds.length === offlineItems.length;

  const loadTrack = useCallback(async (trackId: number) => {
    setPlayerState("loading");
    setErrorMsg("");
    setTrack(null);
    try {
      type TrackWithSegments = Track & { segments: Segment[] };
      const trackKey = `t:${trackId}`;
      const audioKey = `a:${trackId}`;

      const fresh = await getTrack(trackId).catch(() => null);
      const trackData = (fresh ?? await getCachedJson<TrackWithSegments>(trackKey)) as TrackWithSegments | null;

      if (!trackData) throw new Error("Track data not found");
      setTrack(trackData);

      const blob = await getCachedBlob(audioKey);
      if (!blob) throw new Error("Audio not cached");

      setAudioUrl(URL.createObjectURL(blob));
      setPlayerState("ready");
    } catch {
      setErrorMsg("Failed to load track");
      setPlayerState("error");
    }
  }, []);

  const handleStart = async () => {
    if (selectedIds.length === 0) return;
    const sameQueue =
      selectedIds.length === trackQueue.length &&
      selectedIds.every((id, i) => id === trackQueue[i]);
    setView("audio");
    if (sameQueue && track) return; // Just expand mini player
    setTrackQueue(selectedIds);
    setTrackIndex(0);
    await loadTrack(selectedIds[0]);
  };

  const handlePrev = useCallback(() => {
    const queue = trackQueueRef.current;
    const idx = trackIndexRef.current;
    if (idx === 0) return;
    const newIdx = idx - 1;
    setTrackIndex(newIdx);
    loadTrack(queue[newIdx]);
  }, [loadTrack]);

  const handleNext = useCallback(() => {
    const queue = trackQueueRef.current;
    const idx = trackIndexRef.current;
    const total = queue.length;

    let nextIdx: number;
    if (autoAdvanceRef.current === "shuffle") {
      if (total === 1) {
        nextIdx = 0;
      } else {
        do { nextIdx = Math.floor(Math.random() * total); }
        while (nextIdx === idx);
      }
    } else {
      if (idx >= total - 1) { setPlayerState("all_done"); return; }
      nextIdx = idx + 1;
    }
    setTrackIndex(nextIdx);
    loadTrack(queue[nextIdx]);
  }, [loadTrack]);

  const handleExitPlayer = () => {
    setView("list");
  };

  const handleDelete = async (item: OfflineItem) => {
    if (!confirm(`Delete "${item.title}"?`)) return;
    try {
      await deleteCachedAudio(item.trackId);
      setOfflineItems(offlineItems.filter((o) => o.trackId !== item.trackId));
      setSelectedIds(selectedIds.filter((id) => id !== item.trackId));
    } catch {
      alert("Failed to delete");
    }
  };

  const handleUpdate = async (item: OfflineItem) => {
    const trackKey = `t:${item.trackId}`;
    const audioKey = `a:${item.trackId}`;

    setUpdatingIds((prev) => new Set(prev).add(item.trackId));
    try {
      const t = await getTrack(item.trackId);
      const token = await getAudioToken(item.trackId);
      const base = import.meta.env.VITE_API_URL ?? "";
      const resp = await fetch(base + token.url, {
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      const audioBlob = await resp.blob();

      await setCachedJson(trackKey, t);
      const blobSaved = await setCachedBlob(audioKey, audioBlob);
      const metaSaved = await setCachedAudioMeta(item.trackId, { title: t.title });

      if (!blobSaved || !metaSaved) {
        alert("Failed to update");
        return;
      }

      await loadOfflineItems();
    } catch {
      alert("Failed to update");
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.trackId);
        return next;
      });
    }
  };

  const formatDate = (ms: number): string => {
    return new Date(ms).toLocaleDateString();
  };

  // Single audio element shared across views
  const audioElement = audioUrl && (
    <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" />
  );

  // ── Playback view ─────────────────────────────────────────────────────
  if (view === "audio") {
    const trackTotal = trackQueue.length;

    return (
      <div className="flex flex-col h-full min-h-screen">
        {audioElement}

        {/* Header */}
        <div className="px-5 pt-12 pb-3 bg-white shrink-0 border-b border-gray-100">
          <button
            onClick={handleExitPlayer}
            className="text-indigo-500 text-sm font-medium"
          >
            ← Offline
          </button>
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
                onClick={() => loadTrack(trackQueue[trackIndex])}
                className="text-indigo-500 text-sm font-medium"
              >
                Try Again
              </button>
            </div>
          )}

          {playerState === "all_done" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center gap-6 bg-gray-50">
              <div>
                <div className="text-5xl mb-4">🎉</div>
                <p className="text-xl font-bold text-gray-900 mb-2">All Done!</p>
                <p className="text-gray-400 text-sm">
                  Played all {trackTotal} track{trackTotal > 1 ? "s" : ""}.
                </p>
              </div>
              <button
                onClick={handleExitPlayer}
                className="bg-indigo-600 text-white rounded-2xl px-8 py-3.5 font-semibold"
              >
                Back to List
              </button>
            </div>
          )}

          {playerState === "ready" && track && (
            <div className="absolute inset-0 overflow-hidden">
              <AudioTab
                audioRef={audioRef}
                track={track}
                segFrom={null}
                segTo={null}
                trackIndex={trackIndex}
                trackTotal={trackTotal}
                isActive={true}
                autoAdvance={autoAdvance}
                onSetAutoAdvance={setAutoAdvance}
                onPrev={handlePrev}
                onNext={handleNext}
                onRangeChange={() => {}}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">
      {audioElement}

      {/* Mini player at top - only when a track is loaded */}
      {track && (
        <MiniAudioPlayer
          audioRef={audioRef}
          title={track.title}
          trackIndex={trackIndex}
          trackTotal={trackQueue.length}
          onPrev={handlePrev}
          onNext={handleNext}
          onExpand={() => setView("audio")}
        />
      )}

      <div className={`bg-white px-6 ${track ? "pt-4" : "pt-14"} pb-4 border-b border-gray-100`}>
        <button
          onClick={() => navigate("/setup")}
          className="text-indigo-500 text-sm font-medium mb-3 flex items-center gap-1"
        >
          ‹ Categories
        </button>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Offline Content</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              {selectedIds.length === 0
                ? "Select tracks to play"
                : `${selectedIds.length} track${selectedIds.length > 1 ? "s" : ""} selected`}
            </p>
          </div>
          {offlineItems.length > 1 && (
            <button onClick={toggleAll} className="text-sm text-indigo-500 font-medium pb-1 shrink-0">
              {allSelected ? "Clear all" : "Select all"}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 pb-36 space-y-2">
        {isLoading ? (
          <div className="flex justify-center pt-20">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : offlineItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <div className="text-5xl mb-4">📱</div>
            <p className="text-gray-600 text-sm">No offline content downloaded yet</p>
            <p className="text-gray-400 text-xs mt-2">Download tracks from the player to use offline</p>
          </div>
        ) : (
          <TrackListSelector
            items={offlineItems.map((item) => ({
              id: item.trackId,
              title: item.title,
              description: formatDate(item.cachedAtMs),
              meta: item.hasUpdate ? <div className="w-2 h-2 rounded-full bg-yellow-500" /> : null,
              trailing: (
                <div className="flex items-center gap-1 px-2">
                  <button
                    onClick={() => handleUpdate(item)}
                    disabled={updatingIds.has(item.trackId)}
                    className="text-lg text-gray-400 hover:text-indigo-600 disabled:opacity-50 p-1"
                    title={item.hasUpdate ? "Update available" : "Update"}
                  >
                    🔄
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    className="text-lg text-gray-400 hover:text-red-600 p-1"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              ),
            }))}
            selectedIds={selectedIds}
            onToggle={toggleTrack}
          />
        )}
      </div>

      {offlineItems.length > 0 && (
        <div className="sticky bottom-0 px-5 pb-10 pt-3 bg-white border-t border-gray-100">
          <button
            onClick={handleStart}
            disabled={selectedIds.length === 0}
            className="w-full bg-indigo-600 text-white rounded-2xl py-3.5 font-bold text-base disabled:opacity-40 transition-opacity"
          >
            {selectedIds.length === 0
              ? "Select tracks to play"
              : `Start  ·  ${selectedIds.length} track${selectedIds.length > 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
