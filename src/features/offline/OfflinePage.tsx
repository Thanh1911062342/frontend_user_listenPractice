import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTrack } from "../../api/content";
import { getAudioToken } from "../../api/session";
import { AudioPlayer } from "../../shared/AudioPlayer";
import {
  listCachedAudio,
  deleteCachedAudio,
  setCachedBlob,
  setCachedJson,
  getCachedBlob,
  setCachedAudioMeta,
  type CachedAudioInfo,
} from "../../utils/cache";
import type { Track } from "../../types";

interface OfflineItem extends CachedAudioInfo {
  hasUpdate?: boolean;
}

export function OfflinePage() {
  const navigate = useNavigate();
  const [offlineItems, setOfflineItems] = useState<OfflineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());

  const [playingTrackId, setPlayingTrackId] = useState<number | null>(null);
  const [playingBlob, setPlayingBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    loadOfflineItems();
  }, []);

  const loadOfflineItems = async () => {
    setIsLoading(true);
    try {
      const cached = await listCachedAudio();
      console.log("[Offline] Cached audio list:", cached);
      const items: OfflineItem[] = [];

      for (const item of cached) {
        try {
          const track = await getTrack(item.trackId);
          const trackUpdatedAt = new Date(track.updated_at).getTime();
          items.push({
            ...item,
            hasUpdate: trackUpdatedAt > item.cachedAtMs,
          });
        } catch (e) {
          console.log("[Offline] Failed to fetch track", item.trackId, e);
          items.push({
            ...item,
            hasUpdate: false,
          });
        }
      }
      console.log("[Offline] Final items:", items);
      setOfflineItems(items);
    } catch (e) {
      console.error("[Offline] Load error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlay = async (item: OfflineItem) => {
    try {
      const blob = await getCachedBlob(item.key);
      if (!blob) {
        alert("Audio file not found");
        return;
      }
      setPlayingTrackId(item.trackId);
      setPlayingBlob(blob);
      setIsPlaying(true);
    } catch (err) {
      alert("Failed to play audio");
    }
  };

  const handleDelete = async (item: OfflineItem) => {
    if (!confirm(`Delete "${item.title}"?`)) return;
    try {
      await deleteCachedAudio(item.trackId);
      setOfflineItems(offlineItems.filter((o) => o.trackId !== item.trackId));
    } catch (err) {
      alert("Failed to delete");
    }
  };

  const handleUpdate = async (item: OfflineItem) => {
    const trackKey = `t:${item.trackId}`;
    const audioKey = `a:${item.trackId}`;

    setUpdatingIds((prev) => new Set(prev).add(item.trackId));
    try {
      const track = await getTrack(item.trackId);
      const token = await getAudioToken(item.trackId);
      const base = import.meta.env.VITE_API_URL ?? "";
      const resp = await fetch(base + token.url, {
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      const audioBlob = await resp.blob();

      await setCachedJson(trackKey, track);
      const blobSaved = await setCachedBlob(audioKey, audioBlob);
      const metaSaved = await setCachedAudioMeta(item.trackId, { title: track.title });

      if (!blobSaved || !metaSaved) {
        alert("Failed to update");
        return;
      }

      await loadOfflineItems();
    } catch (err) {
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

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">
      {/* Header - Match SetupPage style */}
      <div className="bg-white px-6 pt-14 pb-5 border-b border-gray-100 flex items-start justify-between">
        <div>
          <p className="text-xs text-indigo-500 font-semibold tracking-widest uppercase mb-1">
            Offline
          </p>
          <h1 className="text-2xl font-bold text-gray-900">Downloaded Content</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {offlineItems.length === 0
              ? "No tracks downloaded yet"
              : `${offlineItems.length} track${offlineItems.length > 1 ? "s" : ""} available`}
          </p>
        </div>
        <button
          onClick={() => navigate("/setup")}
          className="text-gray-400 hover:text-gray-600 mt-1"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3 pb-8">
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
          offlineItems.map((item) => (
            <div
              key={item.key}
              className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3 px-4 py-3 active:scale-[0.98] transition-transform"
            >
              {/* Play button or audio player */}
              <div className="shrink-0">
                {playingTrackId === item.trackId ? (
                  <AudioPlayer
                    blob={playingBlob}
                    isPlaying={isPlaying}
                    onPlayingChange={setIsPlaying}
                    onEnded={() => setPlayingTrackId(null)}
                  />
                ) : (
                  <button
                    onClick={() => handlePlay(item)}
                    className="text-lg text-gray-400 hover:text-indigo-600 p-1"
                    title="Play"
                  >
                    ▶️
                  </button>
                )}
              </div>

              {/* Title and date */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                <p className="text-xs text-gray-500">{formatDate(item.cachedAtMs)}</p>
              </div>

              {/* Update indicator */}
              {item.hasUpdate && <div className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />}

              {/* Action buttons */}
              <div className="flex items-center gap-1 shrink-0">
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
            </div>
          ))
        )}
      </div>
    </div>
  );
}
