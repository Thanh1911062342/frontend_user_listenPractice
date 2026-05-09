import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getCategories, getCategoryBySlug } from "../../api/content";
import { loadConfig, saveConfig } from "../../store/practiceStore";
import type { Category } from "../../types";

type Step = "category" | "tracks";

const GRADIENTS = [
  "from-violet-500 to-purple-500",
  "from-sky-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-indigo-500 to-blue-600",
];

function catGradient(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return GRADIENTS[h % GRADIENTS.length];
}

const LEVEL_PILL: Record<string, string> = {
  beginner:     "bg-emerald-100 text-emerald-700",
  intermediate: "bg-amber-100 text-amber-700",
  advanced:     "bg-rose-100 text-rose-700",
};

const DIFF_DOT: Record<string, string> = {
  easy:   "bg-emerald-400",
  medium: "bg-amber-400",
  hard:   "bg-rose-400",
};

function fmtDuration(ms: number | null) {
  if (!ms) return null;
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
}

export function SetupPage() {
  const navigate = useNavigate();
  const existingConfig = loadConfig();

  const [step, setStep] = useState<Step>("category");
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const catQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const trackQuery = useQuery({
    queryKey: ["category", selectedCat?.slug],
    queryFn: () => getCategoryBySlug(selectedCat!.slug),
    enabled: !!selectedCat,
  });

  const tracks = [...(trackQuery.data?.tracks ?? [])].sort((a, b) => a.id - b.id);
  const allSelected = tracks.length > 0 && selectedIds.length === tracks.length;

  const toggleTrack = (id: number) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const toggleAll = () =>
    setSelectedIds(allSelected ? [] : tracks.map((t) => t.id));

  const handleStart = () => {
    if (!selectedCat || selectedIds.length === 0) return;
    saveConfig({
      categorySlug: selectedCat.slug,
      categoryName: selectedCat.name,
      trackQueue: selectedIds,
      trackIndex: 0,
      segFrom: null,
      segTo: null,
    });
    navigate("/", { replace: true });
  };

  // ── Step: category ────────────────────────────────────────────────────
  if (step === "category") {
    return (
      <div className="flex flex-col h-full min-h-screen bg-gray-50">
        <div className="bg-white px-6 pt-14 pb-5 border-b border-gray-100">
          <p className="text-xs text-indigo-500 font-semibold tracking-widest uppercase mb-1">
            New Session
          </p>
          <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
          <p className="text-gray-400 text-sm mt-0.5">Choose a category</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 pb-8 space-y-3">
          {catQuery.isLoading && <Spinner />}
          {catQuery.data?.map((cat) => {
            const grad = catGradient(cat.name);
            const pill = LEVEL_PILL[cat.level ?? ""] ?? "";
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setSelectedCat(cat);
                  setSelectedIds([]);
                  setStep("tracks");
                }}
                className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 px-4 py-4 active:scale-[0.98] transition-transform"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 truncate">{cat.name}</p>
                    {pill && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${pill}`}>
                        {cat.level}
                      </span>
                    )}
                  </div>
                  {cat.description && (
                    <p className="text-gray-400 text-xs mt-0.5 line-clamp-1">{cat.description}</p>
                  )}
                </div>
                <span className="text-gray-300 text-xl shrink-0">›</span>
              </button>
            );
          })}
        </div>

        {existingConfig && (
          <div className="px-6 pb-10 pt-3 bg-white border-t border-gray-100">
            <button
              onClick={() => navigate("/", { replace: true })}
              className="w-full flex items-center justify-center gap-1 text-indigo-500 text-sm font-medium py-2"
            >
              ‹ Resume: {existingConfig.categoryName}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Step: tracks ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">
      <div className="bg-white px-6 pt-14 pb-4 border-b border-gray-100">
        <button
          onClick={() => setStep("category")}
          className="text-indigo-500 text-sm font-medium mb-3 flex items-center gap-1"
        >
          ‹ Back
        </button>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{selectedCat?.name}</h1>
            <p className="text-gray-400 text-sm mt-0.5">
              {selectedIds.length === 0
                ? "Select tracks to practice"
                : `${selectedIds.length} track${selectedIds.length > 1 ? "s" : ""} selected`}
            </p>
          </div>
          {tracks.length > 1 && (
            <button onClick={toggleAll} className="text-sm text-indigo-500 font-medium pb-1 shrink-0">
              {allSelected ? "Clear all" : "Select all"}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 pb-36 space-y-2">
        {trackQuery.isLoading && <Spinner />}
        {tracks.map((track, index) => {
          const checked = selectedIds.includes(track.id);
          const dur = fmtDuration(track.duration_ms);
          const dot = DIFF_DOT[track.difficulty ?? ""];
          return (
            <button
              key={track.id}
              onClick={() => toggleTrack(track.id)}
              className={`w-full text-left rounded-2xl border flex items-center gap-3 px-4 py-3.5 transition-all active:scale-[0.98] ${
                checked ? "border-indigo-200 bg-indigo-50" : "border-gray-100 bg-white"
              }`}
            >
              {/* Checkbox */}
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  checked ? "border-indigo-500 bg-indigo-500" : "border-gray-200 bg-white"
                }`}
              >
                {checked && (
                  <svg viewBox="0 0 12 12" fill="none" className="w-3.5 h-3.5">
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="white"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>

              {/* Number badge */}
              <span
                className={`text-xs font-bold w-5 text-center shrink-0 tabular-nums ${
                  checked ? "text-indigo-400" : "text-gray-300"
                }`}
              >
                {index + 1}
              </span>

              {/* Title */}
              <div className="flex-1 min-w-0">
                <p className={`font-medium text-sm truncate ${checked ? "text-gray-900" : "text-gray-700"}`}>
                  {track.title}
                </p>
                {track.description && (
                  <p className="text-gray-400 text-xs mt-0.5 line-clamp-1">{track.description}</p>
                )}
              </div>

              {/* Meta */}
              <div className="flex items-center gap-2 shrink-0">
                {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}
                {dur && <span className="text-xs text-gray-400 tabular-nums">{dur}</span>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="sticky bottom-0 px-5 pb-10 pt-3 bg-white border-t border-gray-100">
        <button
          onClick={handleStart}
          disabled={selectedIds.length === 0}
          className="w-full bg-indigo-600 text-white rounded-2xl py-3.5 font-bold text-base disabled:opacity-40 transition-opacity"
        >
          {selectedIds.length === 0
            ? "Select tracks to start"
            : `Start  ·  ${selectedIds.length} track${selectedIds.length > 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center pt-20">
      <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
