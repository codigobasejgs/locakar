import contracts from "./selsyn-contracts.json";

export const SELSYN_BASE = "https://api.appselsyn.com.br/keek/rest/";
export const REPORT_FORMATS = ["JSON", "PDF_PORTRAIT", "PDF_LANDSCAPE", "XLSX", "HTML"] as const;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface Schema {
  $ref?: string; type?: string; format?: string; pattern?: string; enum?: unknown[];
  default?: unknown; items?: Schema; properties?: Record<string, Schema>; required?: string[];
  additionalProperties?: Schema | boolean;
}
export interface SelsynParameter extends Omit<Schema, "required"> { name: string; in: string; required: boolean; description: string }
export interface SelsynOperation { path: string; label: string; group: string; parameters: SelsynParameter[]; response: Schema }
export const SELSYN_OPERATIONS = contracts.operations as unknown as Record<string, SelsynOperation>;
const SCHEMAS = contracts.schemas as unknown as Record<string, Schema>;
export const trackingId = (v: unknown): string | null => {
  const s = typeof v === "number" && Number.isSafeInteger(v) ? String(v) : typeof v === "string" ? v : "";
  return /^[1-9]\d{0,18}$/.test(s) && BigInt(s) <= BigInt("9223372036854775807") ? s : null;
};
export const normalizeIdentifier = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export interface SelsynDiagnostics {
  operationId: string; method: "GET" | "PUT"; pathname: string; timestamp: string;
  httpStatus: number | null; contentType: string | null; requestId: string | null; durationMs: number;
  /** Corpo de erro do fornecedor, sanitizado e truncado: mensagem/código exatamente como retornados. */
  providerBody?: Json;
}
export class SelsynError extends Error {
  diagnostics?: SelsynDiagnostics;
  constructor(public readonly code: string, message: string, public readonly status = 400, public readonly providerStatus?: number, public readonly retryable = false) { super(message); }
}
export function providerError(status: number) {
  if (status === 401) return new SelsynError("AUTHENTICATION_FAILED", "A Selsyn recusou a autenticação (HTTP 401). Confirme o tipo e a validade da credencial.", 424, status);
  if (status === 403) return new SelsynError("PROVIDER_FORBIDDEN", "A Selsyn recusou esta consulta (HTTP 403). O status sozinho não distingue chave inválida, escopo ou política do fornecedor.", 424, status);
  if (status === 404) return new SelsynError("PROVIDER_NOT_FOUND", "Nenhum resultado foi encontrado na Selsyn (ex.: veículo sem sensor cadastrado ou período sem dados).", 404, status);
  if (status === 429) return new SelsynError("PROVIDER_RATE_LIMITED", "Limite temporário da Selsyn atingido. Aguarde antes de consultar novamente.", 429, status, true);
  if (status === 400 || status === 422) return new SelsynError("INVALID_INPUT", "A Selsyn recusou os parâmetros desta consulta.", 422, status);
  return new SelsynError("PROVIDER_UNAVAILABLE", `Serviço Selsyn indisponível (HTTP ${status}).`, 424, status, status >= 500);
}

/** Validação contra o catálogo oficial. Rejeita URL, headers, método e qualquer campo não documentado. */
export function buildSelsynRequest(operationId: string, input: Record<string, unknown>) {
  if (!Object.hasOwn(SELSYN_OPERATIONS, operationId)) throw new SelsynError("INVALID_OPERATION", "Consulta não permitida.", 404);
  const operation = SELSYN_OPERATIONS[operationId];
  if (Object.keys(input).some(k => !operation.parameters.some(p => p.name === k))) throw new SelsynError("INVALID_INPUT", "Parâmetro não permitido nesta consulta.");
  let path = operation.path;
  const query = new URLSearchParams();
  const normalized: Record<string, string> = {};
  for (const p of operation.parameters) {
    let value = input[p.name];
    if (value === undefined || value === null || value === "") {
      if (p.required) throw new SelsynError("INVALID_INPUT", `Informe ${p.name}.`);
      value = p.default;
      if (value === undefined || value === null) continue;
    }
    if (!["string", "number", "boolean"].includes(typeof value)) throw new SelsynError("INVALID_INPUT", `Valor inválido para ${p.name}.`);
    const text = String(value).trim();
    if (text.length > 200 || !text) throw new SelsynError("INVALID_INPUT", `Valor inválido para ${p.name}.`);
    if (p.in === "path" && p.type === "string" && !/^[A-Za-z0-9-]{1,40}$/.test(text)) throw new SelsynError("INVALID_INPUT", `Identificador inválido em ${p.name}.`);
    if (p.type === "integer") {
      if (!/^\d+$/.test(text) || BigInt(text) > (p.format === "int32" ? BigInt("2147483647") : BigInt("9223372036854775807"))) throw new SelsynError("INVALID_INPUT", `ID inválido em ${p.name}.`);
      if (typeof value === "number" && !Number.isSafeInteger(value)) throw new SelsynError("INVALID_INPUT", "ID fora do intervalo seguro. Informe como texto.");
      if (p.in === "path" && BigInt(text) === BigInt(0)) throw new SelsynError("INVALID_INPUT", `ID inválido em ${p.name}.`);
    }
    if (p.type === "number" && (!Number.isFinite(Number(text)) || Number(text) < 0)) throw new SelsynError("INVALID_INPUT", `Número inválido em ${p.name}.`);
    if (p.type === "boolean" && text !== "true" && text !== "false") throw new SelsynError("INVALID_INPUT", `Valor inválido em ${p.name}.`);
    const allowed = p.enum?.filter(v => v !== null);
    if (allowed?.length && !allowed.some(v => String(v) === text)) throw new SelsynError("INVALID_INPUT", `Opção inválida em ${p.name}.`);
    if (p.pattern && !new RegExp(`^(?:${p.pattern})$`).test(text)) throw new SelsynError("INVALID_INPUT", `Opção inválida em ${p.name}.`);
    if (p.format === "yyyy-MM-dd") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !validDate(text + "T00:00:00.000Z")) throw new SelsynError("INVALID_INPUT", `Data inválida em ${p.name}.`);
    } else if (p.format?.includes("HH:mm:ss")) {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text) || !validDate(text)) throw new SelsynError("INVALID_INPUT", `Use data UTC válida em ${p.name}.`);
    }
    if (p.name === "page" && !/^\d+$/.test(text)) throw new SelsynError("INVALID_INPUT", "Página inválida.");
    if (p.name === "size" && (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > 10000)) throw new SelsynError("INVALID_INPUT", "Use tamanho de página entre 1 e 10.000.");
    normalized[p.name] = text;
    if (p.in === "path") path = path.replace(`{${p.name}}`, encodeURIComponent(text));
    else query.set(p.name, text);
  }
  for (const [a, b] of [["dataInicial", "dataFinal"], ["turnoInicial", "turnoFinal"], ["turnoDoisInicial", "turnoDoisFinal"]]) {
    if (normalized[a] && normalized[b] && normalized[a] > normalized[b]) throw new SelsynError("INVALID_INPUT", "A data final deve ser posterior à inicial.");
  }
  return { operation, path, query, normalized };
}
function validDate(s: string) { const d = new Date(s); return Number.isFinite(d.getTime()) && d.toISOString() === s; }
export function localDateToUtc(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(s)) throw new SelsynError("INVALID_INPUT", "Informe data e hora válidas.");
  const d = new Date(s);
  if (!Number.isFinite(d.getTime()) || d.getFullYear() !== Number(s.slice(0, 4)) || d.getMonth() + 1 !== Number(s.slice(5, 7)) || d.getDate() !== Number(s.slice(8, 10)) || d.getHours() !== Number(s.slice(11, 13)) || d.getMinutes() !== Number(s.slice(14, 16))) throw new SelsynError("INVALID_INPUT", "Data/hora local inexistente neste fuso.");
  return d.toISOString();
}

/** Campos opcionais ausentes são preservados; tipos incorretos nunca são convertidos silenciosamente. */
export function validateSelsynResponse(operationId: string, value: unknown): Json {
  const operation = SELSYN_OPERATIONS[operationId];
  if (!operation) throw new SelsynError("INVALID_OPERATION", "Consulta não permitida.", 404);
  const bad = () => { throw new SelsynError("INVALID_PROVIDER_RESPONSE", "A Selsyn retornou dados em formato inesperado.", 424); };
  function check(schema: Schema, data: unknown, depth = 0): void {
    if (depth > 40) return bad();
    if (schema.$ref) { const s = SCHEMAS[schema.$ref.split("/").pop()!]; if (!s) return bad(); return check(s, data, depth + 1); }
    if (data === null) return;
    if (schema.type === "array") { if (!Array.isArray(data)) return bad(); for (const item of data) check(schema.items ?? {}, item, depth + 1); }
    if (schema.type === "object") {
      if (!data || typeof data !== "object" || Array.isArray(data)) return bad();
      const obj = data as Record<string, unknown>;
      for (const key of schema.required ?? []) if (!(key in obj)) return bad();
      for (const [key, s] of Object.entries(schema.properties ?? {})) if (obj[key] !== undefined) check(s, obj[key], depth + 1);
    }
    if (schema.type === "string" && typeof data !== "string") return bad();
    if (schema.type === "boolean" && typeof data !== "boolean") return bad();
    if (schema.type === "integer" && (typeof data !== "number" || !Number.isSafeInteger(data))) return bad();
    if (schema.type === "number" && (typeof data !== "number" || !Number.isFinite(data))) return bad();
  }
  if (value !== null) {
    check(operation.response, value);
    const schema = operation.response.$ref ? SCHEMAS[operation.response.$ref.split("/").pop()!] : operation.response;
    if (schema?.type === "object" && schema.properties && value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length && !Object.keys(value).some(k => Object.hasOwn(schema.properties!, k))) bad();
  }
  return value as Json;
}

/** Corpo de erro do fornecedor: só JSON pequeno, sanitizado, sem chave; nada é inventado. */
export function providerErrorBody(text: string, secret: string): Json | undefined {
  const trimmed = text.slice(0, 4000).trim();
  if (!trimmed) return undefined;
  try { return sanitizeSelsyn(JSON.parse(trimmed) as Json, secret); } catch { return sanitizeSelsyn(trimmed.slice(0, 500), secret); }
}

/** Remove chaves secretas e referências com credenciais, inclusive na resposta técnica. */
export function sanitizeSelsyn(value: Json, secret = "", depth = 0): Json {
  if (depth > 30) return "[conteúdo excedeu profundidade máxima]";
  if (typeof value === "string") {
    let s = secret ? value.split(secret).join("[removido]").split(encodeURIComponent(secret)).join("[removido]") : value;
    s = s.replace(/([?&](?:x-api-key|api_key|token)=)[^&#\s]+/gi, "$1[removido]");
    return s;
  }
  if (Array.isArray(value)) return value.map(v => sanitizeSelsyn(v, secret, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !(secret && (k.includes(secret) || k.includes(encodeURIComponent(secret)))) && !/^(?:x-api-key|api[-_]?key|authorization|token|password|secret|lockKey)$/i.test(k)).map(([k, v]) => [k, sanitizeSelsyn(v, secret, depth + 1)]));
  return value;
}

export interface TrackingPoint { id: string; label: string; latitude: number; longitude: number; time?: string; speed?: number; ignition?: boolean }
export interface TrackedVehicle {
  id: string; identifier: string; description?: string; status?: string; offline?: boolean;
  position?: TrackingPoint; communicatedAt?: string; battery?: number; batteryUnit?: string;
  power?: number; powerUnit?: string; deviceId?: string; lockEnabled?: boolean; locked?: boolean; satellites?: number; distanceCounter?: number; address?: string;
  sensors: { id?: number; description?: string; value?: string; unit?: string }[];
}
export const coordinatesValid = (lat: unknown, lng: unknown): boolean => typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 && typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180;
export const record = (v: unknown): Record<string, Json> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, Json> : {};
const text = (v: unknown) => typeof v === "string" ? v : undefined;
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : undefined;
export function trackingPoint(v: unknown, id: string, label: string): TrackingPoint | undefined {
  const p = record(v);
  return coordinatesValid(p.latitude, p.longitude) ? { id, label, latitude: p.latitude as number, longitude: p.longitude as number, time: text(p.time), speed: num(p.speed), ignition: typeof p.ignition === "boolean" ? p.ignition : undefined } : undefined;
}
export function mapTrackedVehicle(v: unknown): TrackedVehicle {
  const raw = record(v); const id = trackingId(raw.id);
  if (!id || typeof raw.identificador !== "string") throw new SelsynError("INVALID_PROVIDER_RESPONSE", "Rastreável sem identificação válida.", 424);
  const pos = record(raw.ultimaPosicao);
  const sensors = Array.isArray(raw.ultimaAtualizacaoSensor) ? raw.ultimaAtualizacaoSensor : Array.isArray(pos.sensor) ? pos.sensor : [];
  return {
    id, identifier: raw.identificador, description: text(raw.descricao), status: text(raw.status),
    offline: typeof raw.offLine === "boolean" ? raw.offLine : undefined,
    lockEnabled: typeof raw.bloqueioHabilitado === "boolean" ? raw.bloqueioHabilitado : undefined,
    locked: typeof raw.lock === "boolean" ? raw.lock : typeof pos.locked === "boolean" ? pos.locked : undefined,
    position: trackingPoint(pos, id, raw.identificador), communicatedAt: text(raw.timeUltimaComunicacao),
    battery: num(pos.battery), batteryUnit: text(pos.batteryUnit), power: num(pos.power), powerUnit: text(pos.powerUnit),
    deviceId: trackingId(pos.deviceId) ?? undefined, satellites: num(pos.satellite), distanceCounter: num(pos.distance), address: text(record(pos.endereco).descricao),
    sensors: sensors.map(v => { const s = record(v); return { id: num(s.id), description: text(s.description), value: text(s.value), unit: text(s.unit) }; }),
  };
}
export function trackingTotals(list: TrackedVehicle[]) {
  return { tracked: list.length, moving: list.filter(v => v.offline !== true && v.status !== "OFF_LINE" && v.position?.speed !== undefined && v.position.speed > 0).length,
    stopped: list.filter(v => v.offline !== true && v.status !== "OFF_LINE" && v.position?.speed === 0).length,
    offline: list.filter(v => v.offline === true || v.status === "OFF_LINE").length,
    unknown: list.filter(v => v.offline !== true && v.status !== "OFF_LINE" && v.position?.speed === undefined).length };
}
