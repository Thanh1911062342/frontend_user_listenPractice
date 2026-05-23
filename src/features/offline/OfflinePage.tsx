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
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

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

    setUpdatingIds((prev) => new Set(prev).add(item.trackId.toString()));
    try {
      // Fetch fresh track data and audio
      const track = await getTrack(item.trackId);
      const token = await getAudioToken(item.trackId);
      const base = import.meta.env.VITE_API_URL ?? "";
      const resp = await fetch(base + token.url, {
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      const audioBlob = await resp.blob();

      // Update cache
      await setCachedJson(trackKey, track);
      const blobSaved = await setCachedBlob(audioKey, audioBlob);
      const metaSaved = await setCachedAudioMeta(item.trackId, { title: track.title });

      if (!blobSaved || !metaSaved) {
        alert("Failed to update audio or metadata");
        return;
      }

      // Reload the list
      await loadOfflineItems();
    } catch (err) {
      alert("Failed to update");
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.trackId.toString());
        return next;
      });
    }
  };

  const formatDate = (ms: number): string => {
    return new Date(ms).toLocaleDateString();
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

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
        <h1 className="text-lg font-bold text-gray-900">Offline Content</h1>
        <button
          onClick={() => navigate("/setup")}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : offlineItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="text-4xl mb-3">📱</div>
            <p className="text-gray-600 text-sm">
              No offline content downloaded yet.
            </p>
            <p className="text-gray-400 text-xs mt-2">
              Use the download button in the player to save tracks.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {offlineItems.map((item) => {
              const isPlaying = playingTrackId === item.trackId;
              return (
                <div
                  key={item.rawKey}
                  className="px-4 py-3 bg-white hover:bg-gray-50 flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(item.cachedAtMs)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
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
                        title="Play"
                        className="text-lg text-gray-400 hover:text-indigo-600 p-1"
                      >
                        ▶️
                      </button>
                    )}
                    {item.hasUpdate && (
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    )}
                    <button
                      onClick={() => handleUpdate(item)}
                      disabled={updatingIds.has(item.trackId.toString())}
                      title="Update"
                      className="text-lg text-gray-400 hover:text-indigo-600 disabled:opacity-50 p-1"
                    >
                      🔄
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      title="Delete"
                      className="text-lg text-gray-400 hover:text-red-600 p-1"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
