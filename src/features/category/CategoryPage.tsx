import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { getCategoryBySlug } from "../../api/content";

function fmtDuration(ms: number | null) {
  if (!ms) return null;
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["category", slug],
    queryFn: () => getCategoryBySlug(slug!),
    enabled: !!slug,
  });

  return (
    <div className="flex flex-col h-full min-h-screen">
      {/* Header */}
      <div className="px-6 pt-14 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="text-indigo-500 text-sm font-medium mb-4 flex items-center gap-1"
        >
          ← Back
        </button>
        {data && (
          <>
            <h1 className="text-xl font-bold text-gray-900">{data.name}</h1>
            {data.description && (
              <p className="text-gray-400 text-sm mt-1">{data.description}</p>
            )}
          </>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {isLoading && (
          <div className="flex justify-center pt-20">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {isError && (
          <p className="text-center text-red-400 pt-20 text-sm">Failed to load.</p>
        )}
        {data && data.tracks.length === 0 && (
          <p className="text-center text-gray-400 pt-20 text-sm">No tracks in this category.</p>
        )}
        {data && data.tracks.length > 0 && (
          <div className="space-y-3 pt-2">
            {data.tracks.map((track) => (
              <button
                key={track.id}
                onClick={() => navigate(`/tracks/${track.id}`)}
                className="w-full text-left bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm active:scale-[0.98] transition-transform"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{track.title}</p>
                    {track.description && (
                      <p className="text-gray-400 text-sm mt-0.5 line-clamp-2">{track.description}</p>
                    )}
                  </div>
                  {track.difficulty && (
                    <span className="text-xs text-gray-400 shrink-0">{track.difficulty}</span>
                  )}
                </div>
                {track.duration_ms && (
                  <p className="text-xs text-gray-400 mt-2">{fmtDuration(track.duration_ms)}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
