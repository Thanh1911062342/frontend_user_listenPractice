import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTrack } from "../../api/content";
import { getAudioToken } from "../../api/session";
import {
  listCachedAudio,
  deleteCachedAudio,
  setCachedBlob,
  setCachedJson,
  type CachedAudioInfo,
} from "../../utils/cache";
import type { Track } from "../../types";

interface OfflineItem extends CachedAudioInfo {
  title?: string;
  hasUpdate?: boolean;
  isUpdating?: boolean;
}

export function OfflinePage() {
  const navigate = useNavigate();
  const [offlineItems, setOfflineItems] = useState<OfflineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadOfflineItems();
  }, []);

  const loadOfflineItems = async () => {
    setIsLoading(true);
    try {
      const cached = await listCachedAudio();
      const items: OfflineItem[] = cached.map((item) => ({
        ...item,
        isUpdating: false,
      }));

      // Load track titles and check for updates
      for (let i = 0; i < items.length; i++) {
        const trackId = extractTrackId(items[i].rawKey);
        if (trackId) {
          try {
            const track = await getTrack(trackId);
            items[i].title = track.title;
            // Check if track was updated after it was cached
            const trackUpdatedAt = new Date(track.updated_at).getTime();
            items[i].hasUpdate = trackUpdatedAt > items[i].cachedAtMs;
          } catch {
            // If fetch fails, keep just the rawKey
          }
        }
      }
      setOfflineItems(items);
    } catch (err) {
      console.error("Failed to load offline items", err);
    } finally {
      setIsLoading(false);
    }
  };

  const extractTrackId = (rawKey: string): number | null => {
    const match = rawKey.match(/^a:(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
  };

  const handleDelete = async (item: OfflineItem) => {
    if (!confirm(`Delete "${item.title || item.rawKey}"?`)) return;
    try {
      await deleteCachedAudio(item.rawKey);
      setOfflineItems(offlineItems.filter((o) => o.rawKey !== item.rawKey));
    } catch (err) {
      alert("Failed to delete");
    }
  };

  const handleUpdate = async (item: OfflineItem) => {
    const trackId = extractTrackId(item.rawKey);
    if (!trackId) return;

    const trackKey = `t:${trackId}`;
    const audioKey = item.rawKey;

    setUpdatingIds((prev) => new Set(prev).add(item.rawKey));
    try {
      // Fetch fresh track data and audio
      const track = await getTrack(trackId);
      const token = await getAudioToken(trackId);
      const base = import.meta.env.VITE_API_URL ?? "";
      const resp = await fetch(base + token.url, {
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      const audioBlob = await resp.blob();

      // Update cache
      await setCachedJson(trackKey, track);
      await setCachedBlob(audioKey, audioBlob);

      // Reload the list
      await loadOfflineItems();
    } catch (err) {
      alert("Failed to update");
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.rawKey);
        return next;
      });
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (ms: number): string => {
    return new Date(ms).toLocaleDateString();
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
            {offlineItems.map((item) => (
              <div
                key={item.rawKey}
                className="px-4 py-3 bg-white hover:bg-gray-50 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {item.title || item.rawKey}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatSize(item.sizeBytes)} • {formatDate(item.cachedAtMs)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {item.hasUpdate && (
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                  )}
                  <button
                    onClick={() => handleUpdate(item)}
                    disabled={updatingIds.has(item.rawKey)}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
