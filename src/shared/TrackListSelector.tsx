import { ReactNode } from "react";

export interface SelectableItem {
  id: number;
  title: string;
  description?: string;
  meta?: ReactNode;
  trailing?: ReactNode;
}

interface Props {
  items: SelectableItem[];
  selectedIds: number[];
  onToggle: (id: number) => void;
}

export function TrackListSelector({ items, selectedIds, onToggle }: Props) {
  return (
    <>
      {items.map((item, index) => {
        const checked = selectedIds.includes(item.id);
        return (
          <div
            key={item.id}
            className={`w-full text-left rounded-2xl border flex items-center gap-3 px-4 py-3.5 transition-all ${
              checked ? "border-indigo-200 bg-indigo-50" : "border-gray-100 bg-white"
            }`}
          >
            <button
              onClick={() => onToggle(item.id)}
              className="flex items-center gap-3 flex-1 min-w-0 active:scale-[0.98] transition-transform"
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

              {/* Title and description */}
              <div className="flex-1 min-w-0 text-left">
                <p className={`font-medium text-sm truncate ${checked ? "text-gray-900" : "text-gray-700"}`}>
                  {item.title}
                </p>
                {item.description && (
                  <p className="text-gray-400 text-xs mt-0.5 line-clamp-1">{item.description}</p>
                )}
              </div>

              {/* Meta (e.g., duration, difficulty dot) */}
              {item.meta && (
                <div className="flex items-center gap-2 shrink-0">{item.meta}</div>
              )}
            </button>

            {/* Trailing actions (e.g., update/delete buttons) */}
            {item.trailing && <div className="shrink-0">{item.trailing}</div>}
          </div>
        );
      })}
    </>
  );
}
