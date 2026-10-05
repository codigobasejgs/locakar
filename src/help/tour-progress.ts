import type { TourDef } from "./types";

export type TourMode = "quick" | "full";
export interface TourRecord {
  version: number;
  status: "active" | "paused" | "done" | "skipped";
  mode: TourMode;
  step: number;
  furthest: number;
  completedVersions: number[];
  feedback?: { helpful: boolean; comment: string };
  updatedAt: string;
}
export interface TourState {
  tours: Record<string, TourRecord>;
  welcome?: "later" | "done";
  /** Telas em que o convite "Quer aprender a usar esta área?" já apareceu (aparece uma vez só). */
  prompted: string[];
}
export const emptyTourState = (): TourState => ({ tours: {}, prompted: [] });
export const tourStateKey = (user: string, org: string) => `locakar:tour:v1:${user}:${org}`;

const STATUSES = new Set(["active", "paused", "done", "skipped"]);
const int = (v: unknown, max = 500) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : 0);

/** Lê o estado salvo descartando qualquer coisa malformada (armazenamento é entrada não confiável). */
export function readTourState(storage: Pick<Storage, "getItem"> | null, key: string): TourState {
  try {
    const raw = JSON.parse(storage?.getItem(key) ?? "null");
    if (!raw || typeof raw !== "object") return emptyTourState();
    const tours: Record<string, TourRecord> = {};
    for (const [id, r] of Object.entries((raw.tours ?? {}) as Record<string, Partial<TourRecord>>)) {
      if (!r || typeof r !== "object" || !STATUSES.has(r.status as string) || id.length > 80) continue;
      tours[id] = {
        version: int(r.version, 1e4) || 1,
        status: r.status as TourRecord["status"],
        mode: r.mode === "quick" ? "quick" : "full",
        step: int(r.step),
        furthest: int(r.furthest),
        completedVersions: Array.isArray(r.completedVersions) ? r.completedVersions.filter((v) => Number.isInteger(v)).slice(-20) : [],
        feedback: r.feedback && typeof r.feedback.helpful === "boolean" ? { helpful: r.feedback.helpful, comment: String(r.feedback.comment ?? "").slice(0, 500) } : undefined,
        updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date(0).toISOString(),
      };
    }
    const prompted = Array.isArray(raw.prompted) ? raw.prompted.filter((s: unknown): s is string => typeof s === "string").slice(-100) : [];
    return { tours, prompted, welcome: raw.welcome === "later" || raw.welcome === "done" ? raw.welcome : undefined };
  } catch {
    return emptyTourState();
  }
}
export function saveTourState(storage: Pick<Storage, "setItem"> | null, key: string, state: TourState) {
  try {
    storage?.setItem(key, JSON.stringify(state));
    return Boolean(storage);
  } catch {
    return false;
  }
}

/** Junta o salvo no aparelho com o salvo no servidor: vence o registro mais recente de cada tour. */
export function mergeTourState(local: TourState, remote: Record<string, TourRecord>): TourState {
  const tours = { ...local.tours };
  for (const [id, r] of Object.entries(remote)) if (!tours[id] || tours[id].updatedAt < r.updatedAt) tours[id] = r;
  return { ...local, tours };
}

const now = () => new Date().toISOString();
const put = (state: TourState, id: string, record: TourRecord): TourState => ({ ...state, tours: { ...state.tours, [id]: record } });

export function startTour(state: TourState, tour: Pick<TourDef, "id" | "version">, mode: TourMode, step = 0): TourState {
  const prev = state.tours[tour.id];
  return put(state, tour.id, { version: tour.version, status: "active", mode, step, furthest: Math.max(step, prev?.version === tour.version && prev.mode === mode ? prev.furthest : 0), completedVersions: prev?.completedVersions ?? [], feedback: prev?.feedback, updatedAt: now() });
}
export function moveTour(state: TourState, id: string, step: number): TourState {
  const r = state.tours[id];
  return r ? put(state, id, { ...r, step, furthest: Math.max(r.furthest, step), updatedAt: now() }) : state;
}
export function pauseTour(state: TourState, id: string): TourState {
  const r = state.tours[id];
  return r && r.status === "active" ? put(state, id, { ...r, status: "paused", updatedAt: now() }) : state;
}
export function skipTour(state: TourState, id: string): TourState {
  const r = state.tours[id];
  return r ? put(state, id, { ...r, status: "skipped", updatedAt: now() }) : state;
}
/** Concluir guarda a versão no histórico: quando o tour mudar, a conclusão antiga continua registrada. */
export function completeTour(state: TourState, id: string, steps: number): TourState {
  const r = state.tours[id];
  if (!r) return state;
  return put(state, id, { ...r, status: "done", step: steps - 1, furthest: steps - 1, completedVersions: [...new Set([...r.completedVersions, r.version])], updatedAt: now() });
}
export function rateTour(state: TourState, id: string, feedback: { helpful: boolean; comment: string }): TourState {
  const r = state.tours[id];
  return r ? put(state, id, { ...r, feedback: { helpful: feedback.helpful, comment: feedback.comment.slice(0, 500) }, updatedAt: now() }) : state;
}

export type TourStatus = "new" | "in_progress" | "done" | "updated";
/** "updated": concluído numa versão anterior. Oferecido, nunca imposto. */
export function tourStatus(record: TourRecord | undefined, tour: Pick<TourDef, "version">): TourStatus {
  if (!record) return "new";
  if (record.completedVersions.includes(tour.version)) return "done";
  if (record.version === tour.version && (record.status === "active" || record.status === "paused")) return "in_progress";
  if (record.completedVersions.length) return "updated";
  return record.version === tour.version && record.furthest > 0 ? "in_progress" : "new";
}
