export interface PracticeConfig {
  categorySlug: string;
  categoryName: string;
  trackQueue: number[];   // ordered track IDs
  trackIndex: number;     // 0-based current position
  segFrom: number | null; // 1-indexed SRT seq, null = no lock
  segTo: number | null;
}

const KEY = "practice_config";

export function loadConfig(): PracticeConfig | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as PracticeConfig) : null;
  } catch {
    return null;
  }
}

export function saveConfig(c: PracticeConfig): void {
  localStorage.setItem(KEY, JSON.stringify(c));
}

export function patchConfig(patch: Partial<PracticeConfig>): void {
  const c = loadConfig();
  if (c) saveConfig({ ...c, ...patch });
}

export function clearConfig(): void {
  localStorage.removeItem(KEY);
}
