import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getCategories } from "../../api/content";

const LEVEL_COLOR: Record<string, string> = {
  beginner: "bg-emerald-100 text-emerald-700",
  intermediate: "bg-amber-100 text-amber-700",
  advanced: "bg-rose-100 text-rose-700",
};

export function HomePage() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });

  const logout = () => {
    localStorage.removeItem("user_token");
    navigate("/login");
  };

  return (
    <div className="flex flex-col h-full min-h-screen">
      {/* Header */}
      <div className="px-6 pt-14 pb-4">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">聴く練習</h1>
            <p className="text-gray-400 text-sm">Listening Practice</p>
          </div>
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-gray-600 pb-1"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {isLoading && (
          <div className="flex justify-center pt-20">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {isError && (
          <p className="text-center text-red-400 pt-20 text-sm">Failed to load categories.</p>
        )}
        {data && data.length === 0 && (
          <p className="text-center text-gray-400 pt-20 text-sm">No categories yet.</p>
        )}
        {data && data.length > 0 && (
          <div className="space-y-3 pt-2">
            {data.map((cat) => (
              <button
                key={cat.id}
                onClick={() => navigate(`/categories/${cat.slug}`)}
                className="w-full text-left bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm active:scale-[0.98] transition-transform"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{cat.name}</p>
                    {cat.description && (
                      <p className="text-gray-400 text-sm mt-0.5 line-clamp-2">{cat.description}</p>
                    )}
                  </div>
                  {cat.level && (
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${LEVEL_COLOR[cat.level] ?? "bg-gray-100 text-gray-500"}`}
                    >
                      {cat.level}
                    </span>
                  )}
                </div>
                <p className="text-xs text-indigo-400 mt-2 font-medium">{cat.type}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
