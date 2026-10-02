export interface HelpProgress {
  completed: string[];
  favorites: string[];
  recent: string[];
  feedback: Record<string, { helpful: boolean; comment: string }>;
  lessonSteps: Record<string, number>;
  searches: { query: string; count: number }[];
}
export const emptyProgress = (): HelpProgress => ({ completed: [], favorites: [], recent: [], feedback: {}, lessonSteps: {}, searches: [] });
export const progressKey = (user: string, org: string) => `locakar:help:v1:${user}:${org}`;
export function readProgress(storage: Pick<Storage, "getItem"> | null, key: string): HelpProgress {
  try {
    const raw = JSON.parse(storage?.getItem(key) ?? "null");
    if (!raw || typeof raw !== "object") return emptyProgress();
    const strings = (v: unknown) => Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").slice(0, 500) : [];
    return { ...emptyProgress(), completed: strings(raw.completed), favorites: strings(raw.favorites), recent: strings(raw.recent),
      feedback: raw.feedback && typeof raw.feedback === "object" ? raw.feedback : {},
      lessonSteps: raw.lessonSteps && typeof raw.lessonSteps === "object" ? raw.lessonSteps : {},
      searches: Array.isArray(raw.searches) ? raw.searches.filter((v: { query?: unknown; count?: unknown }) => typeof v?.query === "string" && typeof v.count === "number").slice(-50) : [] };
  } catch { return emptyProgress(); }
}
export function saveProgress(storage: Pick<Storage, "setItem"> | null, key: string, progress: HelpProgress) {
  try { storage?.setItem(key, JSON.stringify(progress)); return Boolean(storage); } catch { return false; }
}
export function toggleItem(items: string[], slug: string) {
  return items.includes(slug) ? items.filter((s) => s !== slug) : [...items, slug];
}
