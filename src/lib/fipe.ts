/** Contratos FIPE v2 oficiais: X-Subscription-Token, sem consulta por placa. */
export const FIPE_BASE = "https://fipe.parallelum.com.br/api/v2";
export const FIPE_TYPES = { cars: { label: "Carro", number: 1 }, motorcycles: { label: "Moto", number: 2 }, trucks: { label: "Caminhão", number: 3 } } as const;
export type FipeType = keyof typeof FIPE_TYPES;
export type FipeOperation = "references" | "brands" | "models" | "years" | "detail" | "brandYears" | "yearModels" | "codeYears" | "codeDetail" | "history";
export interface FipeInput { type?: FipeType; brandId?: string; modelId?: string; yearId?: string; code?: string; reference?: string }
export interface FipeOption { code: string; name: string }
export interface FipeReference { code: string; month: string }
export interface FipeReading { price: number; month: string; reference: string; label: string }
export interface FipeDetail { type: FipeType; brand: string; model: string; modelYear: number; fuel: string; fuelAcronym: string; code: string; price?: number; referenceMonth?: string; referenceLabel?: string; history: FipeReading[] }
export interface FipeLink { type: FipeType; brandId?: string; modelId?: string; yearId: string; code: string; brand: string; version: string; modelYear: number; fuel: string; provider: "parallelum" }
export class FipeError extends Error { constructor(public code: string, message: string, public status = 422) { super(message); } }
const bad = () => { throw new FipeError("FIPE_INVALID_RESPONSE", "A FIPE retornou dados em formato inesperado.", 424); };
export function fipeMonth(raw: string): string {
  const m = /^(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+|\/)(\d{4})$/i.exec(raw.trim());
  if (!m) return bad();
  const n = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"].indexOf(m[1].toLowerCase()) + 1;
  return `${m[2]}-${String(n).padStart(2, "0")}`;
}
export function fipePrice(raw: unknown): number {
  if (typeof raw !== "string" || !/^R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}$/.test(raw.trim())) return bad();
  const n = Number(raw.replace(/R\$|\s|\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n >= 1e10) return bad();
  return n;
}
export function fipePath(operation: string, input: FipeInput): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new FipeError("FIPE_INVALID_INPUT", "Parâmetros FIPE inválidos.");
  const allowed: Record<FipeOperation, (keyof FipeInput)[]> = { references: [], brands: ["type", "reference"], models: ["type", "brandId", "reference"], years: ["type", "brandId", "modelId", "reference"], detail: ["type", "brandId", "modelId", "yearId", "reference"], brandYears: ["type", "brandId", "reference"], yearModels: ["type", "brandId", "yearId", "reference"], codeYears: ["type", "code", "reference"], codeDetail: ["type", "code", "yearId", "reference"], history: ["type", "code", "yearId", "reference"] };
  if (!Object.hasOwn(allowed, operation)) throw new FipeError("FIPE_INVALID_INPUT", "Consulta FIPE inválida.");
  const keys = allowed[operation as FipeOperation];
  if (Object.keys(input).some(k => !keys.includes(k as keyof FipeInput))) throw new FipeError("FIPE_INVALID_INPUT", "Parâmetros FIPE inválidos.");
  for (const k of keys) {
    const v = input[k];
    if (k === "reference" && v === undefined) continue;
    const valid = typeof v === "string" && (k === "type" ? Object.hasOwn(FIPE_TYPES, v) : k === "code" ? /^\d{6}-\d$/.test(v) : k === "yearId" ? /^(?:19\d{2}|20\d{2}|32000)-[1-6]$/.test(v) : /^\d{1,8}$/.test(v));
    if (!valid) throw new FipeError("FIPE_INVALID_INPUT", `Campo FIPE inválido: ${k}.`);
  }
  const { type: t, brandId: b, modelId: m, yearId: y, code: c } = input;
  const paths: Record<FipeOperation, string> = { references: "/references", brands: `/${t}/brands`, models: `/${t}/brands/${b}/models`, years: `/${t}/brands/${b}/models/${m}/years`, detail: `/${t}/brands/${b}/models/${m}/years/${y}`, brandYears: `/${t}/brands/${b}/years`, yearModels: `/${t}/brands/${b}/years/${y}/models`, codeYears: `/${t}/${c}/years`, codeDetail: `/${t}/${c}/years/${y}`, history: `/${t}/${c}/years/${y}/history` };
  return paths[operation as FipeOperation] + (input.reference ? `?reference=${input.reference}` : "");
}
function obj(v: unknown): Record<string, unknown> { if (!v || typeof v !== "object" || Array.isArray(v)) return bad(); return v as Record<string, unknown>; }
function str(v: unknown): string { if (typeof v !== "string" || !v.trim()) return bad(); return v; }
export function mapFipe(operation: FipeOperation, raw: unknown): FipeOption[] | FipeReference[] | FipeDetail {
  if (!["detail", "codeDetail", "history"].includes(operation)) {
    if (!Array.isArray(raw)) return bad();
    if (operation === "references") return raw.map(v => { const o = obj(v); const month = str(o.month); fipeMonth(month); return { code: str(o.code), month }; });
    return raw.map(v => { const o = obj(v); return { code: str(o.code), name: str(o.name) }; });
  }
  const o = obj(raw), type = Object.entries(FIPE_TYPES).find(([, v]) => v.number === o.vehicleType)?.[0] as FipeType | undefined;
  if (!type || typeof o.modelYear !== "number" || !Number.isInteger(o.modelYear) || !(o.modelYear === 32000 || (o.modelYear >= 1900 && o.modelYear <= 2100)) || !/^\d{6}-\d$/.test(str(o.codeFipe))) return bad();
  const history = o.priceHistory === undefined ? [] : Array.isArray(o.priceHistory) ? o.priceHistory.map(v => { const h = obj(v); return { price: fipePrice(h.price), month: fipeMonth(str(h.month)), label: str(h.month), reference: str(h.reference) }; }) : bad();
  return { type, brand: str(o.brand), model: str(o.model), modelYear: o.modelYear, fuel: str(o.fuel), fuelAcronym: str(o.fuelAcronym), code: str(o.codeFipe), ...(operation !== "history" ? { price: fipePrice(o.price), referenceMonth: fipeMonth(str(o.referenceMonth)), referenceLabel: str(o.referenceMonth) } : {}), history };
}
export const variation = (current: number, previous?: number | null) => previous && previous > 0 ? { amount: current - previous, percent: (current - previous) / previous * 100 } : null;
export function fipeFleet(vehicles: { status: string; fipePrice?: number; fipeReferenceMonth?: string }[]) {
  const applicable = vehicles.filter(v => v.status !== "sold");
  const linked = applicable.filter(v => (v.fipePrice ?? 0) > 0 && /^\d{4}-\d{2}$/.test(v.fipeReferenceMonth ?? ""));
  return { total: linked.reduce((n, v) => n + (v.fipePrice ?? 0), 0), linked: linked.length, applicable: applicable.length };
}
